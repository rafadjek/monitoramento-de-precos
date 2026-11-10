// Lê encartes em imagem com IA de visão gratuita e grava produtos no formato comum.
// Uso: node readers/folheto.mjs <manifesto.json> [outro-manifesto.json ...] [--dry]
// Manifesto (gerado pelo coletor de cada mercado): array de
//   { market, offerId, validFrom?, validUntil?, validityNote?, stores[], storeScope?, images[], referer? }
// Sem validade no manifesto, vale a validade impressa nas páginas (lida pela IA). Sem validade nenhuma, o produto não entra.
// Segredos (variáveis de ambiente): GEMINI_API_KEY (principal), OPENROUTER_API_KEY (reserva).
// Cache: data/cache/leitura/<sha1(url)>.json (resposta da IA) e data/cache/paginas/<sha1(url)> (imagem, reaproveitada
// pelo build-site para recortar a foto do produto). A mesma imagem nunca é lida duas vezes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_READ = path.join(ROOT, 'data/cache/leitura');
const CACHE_PAGES = path.join(ROOT, 'data/cache/paginas');
const OUT = path.join(ROOT, 'data/extraido');
const MODELS = (process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-3.8-flash,gemini-2.5-flash,gemini-flash-lite-latest,gemini-2.5-flash-lite').split(',');
const GAP_MS = Number(process.env.READER_GAP_MS || 7000); // ~8 pedidos/min, abaixo do limite gratuito
const MAX_NEW = Number(process.env.READER_MAX_NEW || 60); // teto de páginas novas por execução; o resto fica para a próxima
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const manifests = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
// sobe quando a instrução muda: as páginas são lidas de novo (v2: lista "others" com todos os preços alternativos)
const READ_VERSION = 'v2';
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');

const PROMPT = `Você lê uma página de encarte (folheto) de supermercado brasileiro. Extraia TODOS os produtos com preço visível.
Regras:
- Só o que está escrito na imagem. Nunca invente nem estime. Se não tiver certeza do preço, omita o produto.
- price = preço de venda de 1 unidade/embalagem em reais, como número (ex.: 24.9). Preço escrito "33,99" é 33.99.
- price = preço normal do produto (o maior, sem condição). TODOS os outros preços do mesmo produto vão em others, cada um com a sua condição, como está escrito: ex. [{"price": 28.5, "condition": "no app Roldão Mais"}, {"price": 27.9, "condition": "no cartão Roldão Pay"}], [{"price": 23.9, "condition": "a partir de 2 un."}], [{"price": 4.49, "condition": "no app Meu Assaí"}]. Não deixe nenhum de fora: faixas coloridas embaixo do preço ("APP ...", "CARTÃO ...", "PIX", "CLUBE ...") são outros preços.
- "X% de desconto na 2ª unidade" com "nesta oferta a unidade sai por R$ Y": others = [{"price": Y, "condition": "cada levando 2 (X% na 2ª unidade)"}].
- Se o único preço visível depende de condição ("leve 3 pague 2", "por kg"), use-o em price e descreva em condition (ex.: "preço por kg"). condition fica null quando não houver.
- Ignore frases do tipo "neste pacote o quilo sai por" (é só cálculo do preço por quilo, não é outro produto nem outro preço).
- "LVE 12 PG 11" no nome significa "leve 12 pague 11": mantenha no name e repita em condition.
- listPrice = preço "de" riscado, se aparecer; senão null.
- name = nome do produto como no encarte, com marca e tamanho; brand e size separados quando possível (size ex.: "5kg", "900ml", "12 rolos").
- category: "alimenticios" (comida e bebida), "higiene" (cuidado pessoal, papel higiênico, fralda), "limpeza" (casa e lavanderia) ou "outros".
- box = [ymin, xmin, ymax, xmax] da foto do produto, inteiros de 0 a 1000.
- validFrom e validUntil = período de validade impresso na página ("ofertas válidas de 03/11 a 09/11/2026"), no formato AAAA-MM-DD; null se a página não mostrar. Se o ano não aparecer, use ${new Date().getFullYear()}.
Responda só com o objeto JSON.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    validFrom: { type: 'STRING', nullable: true },
    validUntil: { type: 'STRING', nullable: true },
    products: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, brand: { type: 'STRING', nullable: true }, size: { type: 'STRING', nullable: true },
          price: { type: 'NUMBER' }, listPrice: { type: 'NUMBER', nullable: true },
          condition: { type: 'STRING', nullable: true },
          others: { type: 'ARRAY', items: { type: 'OBJECT', properties: { price: { type: 'NUMBER' }, condition: { type: 'STRING' } }, required: ['price', 'condition'] } },
          category: { type: 'STRING', enum: ['alimenticios', 'higiene', 'limpeza', 'outros'] },
          box: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['name', 'price', 'category'],
      },
    },
  },
  required: ['products'],
};

async function download(url, referer) {
  const f = path.join(CACHE_PAGES, sha1(url));
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
  if (referer) headers.Referer = referer;
  let r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  // Proxy de imagens (Worker na Cloudflare), só se configurado e só quando a origem recusa o IP do GitHub.
  if ((r.status === 403 || r.status === 429) && process.env.IMG_PROXY) {
    r = await fetch(`${process.env.IMG_PROXY}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(45000) });
  }
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE_PAGES, { recursive: true });
  fs.writeFileSync(f, buf);
  return buf;
}

let modelIdx = 0;
async function askGemini(buf, mime) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem GEMINI_API_KEY');
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: buf.toString('base64') } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
  let last = '';
  for (let tent = 0, onModel = 0; tent < 8; tent++, onModel++) {
    const model = MODELS[modelIdx];
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000),
      });
    } catch (e) {
      // página muito cheia pode passar do tempo: tenta de novo (e com outro modelo na segunda vez)
      last = `${model} ${e.message}`;
      console.warn('  ' + last);
      if (onModel >= 1 && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; }
      continue;
    }
    if (r.status === 404 && modelIdx < MODELS.length - 1) { console.warn(`  modelo ${model} indisponível, tentando ${MODELS[modelIdx + 1]}`); modelIdx++; onModel = -1; continue; }
    if (r.status === 429 || r.status >= 500) {
      last = `${model} ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 160)}`;
      console.warn('  ' + last);
      // só a cota do DIA troca de modelo (cada modelo tem a sua); limite por minuto (PDF grande) é esperar e repetir
      if ((/PerDay|per day/i.test(last) || (r.status >= 500 && onModel >= 2)) && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
      await sleep(Math.min(30 * (onModel + 1), 120) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`gemini ${model} ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    return { ...JSON.parse(t), model };
  }
  throw new Error(`gemini: limite de uso atingido (${last})`);
}

async function askOpenRouter(buf, mime) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('sem OPENROUTER_API_KEY');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: 'openrouter/free', temperature: 0,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }] }],
    }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const t = (await r.json()).choices?.[0]?.message?.content ?? '';
  return { ...JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)), model: 'openrouter/free' };
}

let newReads = 0;
// key: identificador estável da imagem (o endereço do Instagram muda a cada consulta; a chave é o post)
async function readPage(url, referer, key = url) {
  const f = path.join(CACHE_READ, sha1(key + '|' + READ_VERSION) + '.json');
  if (fs.existsSync(f)) return { ...JSON.parse(fs.readFileSync(f, 'utf8')), cached: true };
  if (newReads >= MAX_NEW) throw new Error('teto de páginas novas desta execução');
  const buf = await download(url, referer);
  // PDF (o Roldão publica o encarte inteiro assim): o Gemini lê PDF direto
  const mime = buf.subarray(0, 4).toString() === '%PDF' ? 'application/pdf' : buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  newReads++;
  let res;
  try { res = await askGemini(buf, mime); }
  catch (e) {
    console.warn('  gemini falhou:', e.message);
    try { res = await askOpenRouter(buf, mime); }
    catch (e2) { throw new Error(`${e.message} | reserva: ${e2.message}`); }
  }
  const page = { validFrom: res.validFrom ?? null, validUntil: res.validUntil ?? null, products: res.products ?? [], model: res.model, readAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_READ, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(page));
  return { ...page, cached: false };
}

// "2026-11-09" em horário de Brasília: início às 00:00, fim às 23:59:59.
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const startIso = (s) => { const m = ISO_DAY.exec(s ?? ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], 3)).toISOString() : null; };
const endIso = (s) => { const m = ISO_DAY.exec(s ?? ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3] + 1, 2, 59, 59)).toISOString() : null; };
const mode = (xs) => { const c = new Map(); for (const x of xs.filter(Boolean)) c.set(x, (c.get(x) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

// "cada"/"un" não é condição; "quilo"/"kg" vira "preço por kg"
const cond = (c) => {
  const t = String(c ?? '').trim();
  if (!t || /^(cada|un\.?|und\.?|unid\.?|unidade|(o )?pre[cç]o (por|da) unidade)$/i.test(t)) return null;
  if (/^(por\s+)?(o\s+)?(quilo|kg)$/i.test(t) || /^pre[cç]o por (kg|quilo)$/i.test(t)) return 'preço por kg';
  return t;
};
const isPdf = (u) => /\.pdf($|\?)/i.test(u);
// De todos os preços alternativos, o menor que não pede cartão da loja vira a condição ("R$ 28,50 no app Roldão Mais");
// sem nenhum assim, o de cartão fica só como observação (o build-site não deixa virar preço principal).
const CARD = /cart[aã]o|\bpay\b/i;
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
const bestCond = (it) => {
  const alts = (Array.isArray(it.others) ? it.others : []).filter((x) => typeof x?.price === 'number' && x.price > 0 && x.price < it.price && x.condition);
  const free = alts.filter((x) => !CARD.test(x.condition)).sort((a, b) => a.price - b.price)[0];
  if (free) return `${brl(free.price)} ${free.condition.trim()}`;
  const card = alts.sort((a, b) => a.price - b.price)[0];
  if (card) return `${brl(card.price)} ${card.condition.trim()}`;
  return cond(it.condition);
};
const ok = (it) => it && typeof it.name === 'string' && it.name.trim().length > 2 && typeof it.price === 'number' && it.price > 0 && it.price < 10000;

async function main() {
  if (!manifests.length) throw new Error('uso: node readers/folheto.mjs <manifesto.json> [...] [--dry]');
  const now = new Date();
  const rows = {};
  const report = { startedAt: now.toISOString(), pages: [] };
  for (const mf of manifests) {
    if (!fs.existsSync(mf)) { console.warn(`sem manifesto ${mf}`); continue; }
    for (const enc of JSON.parse(fs.readFileSync(mf, 'utf8'))) {
      rows[enc.market] ??= new Map();
      if (enc.validUntil && new Date(enc.validUntil) < now) { console.log(`pulando vencido: ${enc.market} ${enc.offerId}`); continue; }
      if (enc.validFrom && new Date(enc.validFrom) > now) { console.log(`ainda não começou: ${enc.market} ${enc.offerId}`); continue; }
      const pages = [];
      for (let i = 0; i < enc.images.length; i++) {
        const url = enc.images[i];
        console.log(`${enc.market} ${enc.offerId} página ${i + 1}/${enc.images.length}`);
        if (DRY) continue;
        try {
          const p = await readPage(url, enc.referer, enc.imageKeys?.[i] ?? url);
          pages.push({ url, ...p });
          report.pages.push({ market: enc.market, offerId: enc.offerId, url, ok: true, cached: p.cached, products: p.products.length, model: p.model });
          console.log(`  ${p.products.length} produtos${p.cached ? ' (cache)' : ` (${p.model})`}`);
          if (!p.cached) await sleep(GAP_MS);
        } catch (e) {
          console.warn('  erro:', e.message);
          report.pages.push({ market: enc.market, offerId: enc.offerId, url, ok: false, error: e.message });
        }
      }
      // validade: a do manifesto; senão a impressa na página; senão a mais comum entre as páginas do encarte
      const encFrom = mode(pages.map((p) => p.validFrom)), encUntil = mode(pages.map((p) => p.validUntil));
      for (const p of pages) {
        const validFrom = enc.validFrom ?? startIso(p.validFrom ?? encFrom);
        const validUntil = enc.validUntil ?? endIso(p.validUntil ?? encUntil);
        if (!validUntil) { console.warn(`  sem validade, descartando a página ${p.url}`); continue; }
        if (new Date(validUntil) < now) continue;
        for (const it of p.products.filter(ok)) {
          const id = sha1(`${enc.market}|${it.name.trim().toLowerCase()}|${it.price}`).slice(0, 12);
          rows[enc.market].set(id, {
            market: enc.market, externalId: id, name: it.name.trim(), brand: it.brand ?? null, ean: null, size: it.size ?? null,
            price: it.price, listPrice: it.listPrice > it.price ? it.listPrice : null, unitPrice: null,
            category: it.category ?? 'outros', categoryRaw: null,
            // de PDF não dá para recortar a foto: fica sem imagem e o link abre o PDF
            imageUrl: isPdf(p.url) ? null : p.url, imageBox: !isPdf(p.url) && Array.isArray(it.box) && it.box.length === 4 ? it.box : null,
            productUrl: enc.link ?? p.url, source: 'encarte', condition: bestCond(it),
            validFrom, validUntil,
            validityNote: enc.validityNote ?? null,
            storeScope: enc.storeScope ?? `Encarte: ${(enc.stores ?? []).join(', ') || 'lojas não informadas'}`,
            collectedAt: now.toISOString(),
          });
        }
      }
    }
  }
  if (DRY) return;
  fs.mkdirSync(OUT, { recursive: true });
  for (const [market, map] of Object.entries(rows)) {
    const file = path.join(OUT, `${slug(market)}.json`);
    const failed = report.pages.filter((p) => p.market === market && !p.ok).length;
    // Leitura toda falhou: mantém o arquivo anterior (o build-site tira o que já venceu).
    if (!map.size && failed && fs.existsSync(file)) { console.warn(`${market}: nada lido, mantendo o arquivo anterior`); continue; }
    fs.writeFileSync(file, JSON.stringify([...map.values()], null, 1));
    console.log(`gravado ${path.basename(file)}: ${map.size}`);
  }
  report.finishedAt = new Date().toISOString();
  report.newReads = newReads;
  fs.writeFileSync(path.join(OUT, 'encartes.leitura.json'), JSON.stringify(report, null, 1));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
