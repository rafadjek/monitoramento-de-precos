// Lê encartes em imagem com IA de visão gratuita e grava produtos no formato comum.
// Uso: node readers/folheto.mjs <manifesto.json> [outro-manifesto.json ...] [--dry]
// Manifesto (gerado pelo coletor de cada mercado): array de
//   { market, offerId, validFrom?, validUntil?, validityNote?, stores[], storeScope?, images[], referer? }
// Sem validade no manifesto, vale a validade impressa nas páginas (lida pela IA). Sem validade nenhuma, o produto não entra.
// Leitores (READER_MODE): "ocr-primeiro" (padrão) = OCR local (ocr.py, RapidOCR) + modelo de texto grátis, com conferência dos
// preços contra o OCR; o que não passa na conferência vai para o Gemini (visão). "gemini-primeiro" = Gemini, depois OCR,
// depois OpenRouter (imagem). "so-gemini" = como antes (Gemini, reserva OpenRouter de imagem). Ver readers/ocr-leitor.mjs.
// Segredos (variáveis de ambiente): GEMINI_API_KEY (Gemini e Gemma), GROQ_API_KEY e OPENROUTER_API_KEY (reservas).
// Cache: data/cache/leitura/<sha1(url)>.json (resposta da IA) e data/cache/paginas/<sha1(url)> (imagem, reaproveitada
// pelo build-site para recortar a foto do produto). A mesma imagem nunca é lida duas vezes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lerPorOcr, lerJson, OcrFalhou } from './ocr-leitor.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_READ = path.join(ROOT, 'data/cache/leitura');
const CACHE_PAGES = path.join(ROOT, 'data/cache/paginas');
const OUT = path.join(ROOT, 'data/extraido');
const MODELS = (process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-3.8-flash,gemini-2.5-flash,gemini-flash-lite-latest,gemini-3.5-flash-lite').split(',');
const GAP_MS = Number(process.env.READER_GAP_MS || 7000); // ~8 pedidos/min, abaixo do limite gratuito
const MAX_NEW = Number(process.env.READER_MAX_NEW || 60);
// prazo da rodada: depois dele não começa imagem nova (grava o que leu; o resto fica para a próxima rodada).
// Sem isso o passo do GitHub era interrompido no limite de tempo e nada era gravado.
const DEADLINE = Date.now() + Number(process.env.READER_BUDGET_MIN || 40) * 60e3; // teto de páginas novas por execução; o resto fica para a próxima
const READER_MODE = ['ocr-primeiro', 'gemini-primeiro', 'so-gemini'].includes(process.env.READER_MODE) ? process.env.READER_MODE : 'ocr-primeiro';
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
- Caixa colorida embaixo do preço com outro valor e "A PARTIR DE N UN." (ex.: "R$ 2,99 CADA" e embaixo "R$ 2,79 A PARTIR DE 3UN.") é outro preço do MESMO produto: others = [{"price": 2.79, "condition": "a partir de 3 un."}]. Confira produto por produto: é comum quase todos da página terem essa caixa.
- "X% de desconto na 2ª unidade" com "nesta oferta a unidade sai por R$ Y": others = [{"price": Y, "condition": "cada levando 2 (X% na 2ª unidade)"}].
- "de R$ X por R$ Y" (ou "de: X" e "por: Y"): price = Y e listPrice = X. "por" não é condição.
- Página inteira de ofertas exclusivas de clube ou app (cabeçalho como "Ofertas exclusivas para membros do Clube Prime", "Exclusivo app"): repita essa exigência em condition de cada produto (ex.: "exclusivo Clube Prime").
- Preço com "KG", "KILO", "QUILO" ou "/kg" junto do valor é preço por quilo: condition = "preço por kg" (ou, se houver outros preços, ponha "por kg" também na condição de cada um). Nunca deixe sem essa informação.
- Se o único preço visível depende de condição ("leve 3 pague 2", "por kg"), use-o em price e descreva em condition (ex.: "preço por kg"). condition fica null quando não houver.
- Ignore frases do tipo "neste pacote o quilo sai por", "nesta caixa a unidade sai por", "este pacote de 2,5kg sai por" (é só cálculo do preço por quilo/unidade ou da embalagem: não é outro produto nem vai em others). Se o pacote tem preço por kg e preço do pacote, price = preço do pacote e condition = null.
- "LVE 12 PG 11" no nome significa "leve 12 pague 11": mantenha no name e repita em condition.
- listPrice = preço "de" (riscado ou escrito "de:"), se aparecer; senão null.
- name = nome do produto como no encarte, com marca e tamanho; brand e size separados quando possível (size ex.: "5kg", "900ml", "12 rolos").
- category: "alimenticios" (comida e bebida), "higiene" (cuidado pessoal, papel higiênico, fralda), "limpeza" (casa e lavanderia) ou "outros".
- box = [ymin, xmin, ymax, xmax] da foto do produto, inteiros de 0 a 1000.
- validFrom e validUntil = período de validade impresso na página ("ofertas válidas de 03/11 a 09/11/2026"), no formato AAAA-MM-DD; null se a página não mostrar. Se o ano não aparecer, use ${new Date().getFullYear()}.
Responda só com o objeto JSON.`;

// Só para tabloides cujo manifesto traz blockValidity (Joanin): cada bloco colorido tem a sua faixa de validade.
const BLOCK_RULE = `
- Este encarte tem BLOCOS com validade própria: faixas como "OFERTAS VÁLIDAS DE 20/11 A 22/11/2026 - SEXTA/SÁBADO/DOMINGO" valem só para os produtos daquele bloco (os que aparecem logo abaixo da faixa, até a próxima faixa). Em cada produto, preencha validFrom e validUntil (AAAA-MM-DD) com a faixa do bloco onde ele está. Se a página tem uma faixa só (ou o produto não está sob nenhuma faixa), deixe validFrom e validUntil do produto como null: vale a validade geral. Nunca copie a faixa de um bloco para produtos de outro. O validFrom/validUntil do topo do objeto continua sendo a validade geral (a faixa mais ampla/principal).`;

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
          validFrom: { type: 'STRING', nullable: true }, validUntil: { type: 'STRING', nullable: true },
          box: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['name', 'price', 'category'],
      },
    },
  },
  required: ['products'],
};

// Imagem cortada no meio (o servidor da Baronesa às vezes entrega só 229.376 bytes = 224 KiB, sem avisar): o formato
// tem marcador de fim e ele falta. Formato desconhecido (ou HTML de erro) não é tratado aqui: segue o fluxo normal.
export const TRUNC_SUSPECT_SIZE = 229376;
export function isTruncated(buf) {
  if (!buf || buf.length < 4) return true;
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--; // alguns servidores completam com zeros
  if (buf[0] === 0xff && buf[1] === 0xd8) return !(buf[end - 2] === 0xff && buf[end - 1] === 0xd9); // JPEG: termina em FFD9
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return buf.subarray(buf.length - 8, buf.length - 4).toString() !== 'IEND'; // PNG: chunk IEND + CRC
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return buf.readUInt32LE(4) + 8 > buf.length; // WebP: tamanho declarado
  if (buf.subarray(0, 4).toString() === '%PDF') return !buf.subarray(Math.max(0, buf.length - 1024)).toString('latin1').includes('%%EOF');
  return false;
}
// Baixa (getBuf) até vir inteira: tenta de novo depois de uma pausa (pausa cresce a cada tentativa). Se continuar
// cortada, lança erro (a página não vai para o leitor, não gasta cota) e registra o aviso do GitHub Actions.
export async function fetchComplete(getBuf, url, { tries = Number(process.env.TRUNC_TRIES || 3), pauseMs = Number(process.env.TRUNC_PAUSE_MS || 20000), sleepFn = sleep } = {}) {
  let buf;
  for (let i = 1; i <= tries; i++) {
    buf = await getBuf();
    if (!isTruncated(buf)) return buf;
    console.warn(`  imagem cortada (${buf.length} bytes${buf.length === TRUNC_SUSPECT_SIZE ? ', tamanho típico de corte do servidor' : ''}), tentativa ${i}/${tries}`);
    if (i < tries) await sleepFn(pauseMs * i);
  }
  console.log(`::warning::imagem de encarte continua cortada após ${tries} tentativas, não enviada ao leitor: ${url}`);
  throw new Error(`imagem cortada (${buf.length} bytes) após ${tries} tentativas`);
}

async function download(url, referer) {
  const f = path.join(CACHE_PAGES, sha1(url));
  if (fs.existsSync(f)) {
    const c = fs.readFileSync(f);
    if (!isTruncated(c)) return c;
    fs.rmSync(f); // cache antigo com imagem cortada: baixa de novo
  }
  return fetchComplete(() => rawDownload(url, referer, f), url);
}
async function rawDownload(url, referer, f) {
  const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
  if (referer) headers.Referer = referer;
  let r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  // Proxy de imagens (Worker na Cloudflare), só se configurado e só quando a origem recusa o IP do GitHub.
  if ((r.status === 403 || r.status === 429) && process.env.IMG_PROXY) {
    r = await fetch(`${process.env.IMG_PROXY}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(45000) });
  }
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (isTruncated(buf)) return buf; // cortada: não vai para o cache; fetchComplete decide
  fs.mkdirSync(CACHE_PAGES, { recursive: true });
  fs.writeFileSync(f, buf);
  return buf;
}

let modelIdx = 0;
let geminiOff = false; // cota do dia acabou em todos os modelos: não tenta mais nesta execução
async function askGemini(buf, mime, prompt = PROMPT) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem GEMINI_API_KEY');
  if (geminiOff) throw new Error('gemini: cota do dia esgotada em todos os modelos (desligado nesta execução)');
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: buf.toString('base64') } }] }],
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
      const txt = (await r.text()).replace(/\s+/g, ' ');
      last = `${model} ${r.status} ${txt.slice(0, 160)}`;
      console.warn('  ' + last);
      // Cota do DIA: o quotaId vem no fim da mensagem ("...PerDay..."); antes o teste olhava só os 160 primeiros
      // caracteres, não via o PerDay e esperava ~35 min em vão (19/11). Cota do dia troca de modelo (cada um tem a
      // sua); acabou em todos, o Gemini fica desligado nesta execução e as páginas vão direto para a reserva.
      // Sem PerDay nem PerMinute no texto, 3 recusas seguidas no mesmo modelo contam como cota do dia.
      const daily = r.status === 429 && (/PerDay|per day/i.test(txt) || (!/PerMinute|per minute/i.test(txt) && onModel >= 2));
      if (daily || (r.status >= 500 && onModel >= 2)) {
        if (modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
        if (daily) { geminiOff = true; break; }
      }
      // limite por minuto (PDF grande) é esperar e repetir
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

// Reserva de imagem: modelos de visão :free explícitos (o "openrouter/free" às vezes devolvia texto sem JSON e quebrava com
// "Unexpected end of JSON input"). Lista separada por vírgula em OPENROUTER_VISION_MODEL; o próximo entra se um falhar.
const OR_VISION = (process.env.OPENROUTER_VISION_MODEL || 'google/gemma-4-31b-it:free,nvidia/nemotron-3.5-super-vl:free').split(',');
async function askOpenRouter(buf, mime, prompt = PROMPT) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('sem OPENROUTER_API_KEY');
  // PDF não vai como image_url: a reserva de imagem só lê imagem
  if (mime === 'application/pdf') throw new Error('openrouter: PDF não suportado na reserva de imagem');
  const falhas = [];
  for (const model of OR_VISION) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model, temperature: 0,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }] }],
        }),
      });
      if (!r.ok) { falhas.push(`${model} HTTP ${r.status}`); continue; }
      const t = (await r.json()).choices?.[0]?.message?.content ?? '';
      const j = lerJson(t);
      if (!j || !Array.isArray(j.products)) { falhas.push(`${model} sem JSON`); continue; }
      return { ...j, model };
    } catch (e) { falhas.push(`${model} ${e.message}`); }
  }
  throw new Error(`openrouter: ${falhas.join('; ')}`);
}

let newReads = 0;
// key: identificador estável da imagem (o endereço do Instagram muda a cada consulta; a chave é o post)
// blockValidity: tabloide com faixas de validade por bloco (Joanin). Muda o prompt e a chave do cache só desses encartes,
// então as leituras em cache dos outros mercados não são refeitas.
async function readPage(url, referer, key = url, blockValidity = false) {
  const prompt = blockValidity ? PROMPT.replace('Responda só com o objeto JSON.', BLOCK_RULE.trim() + ' Responda só com o objeto JSON.') : PROMPT;
  const f = path.join(CACHE_READ, sha1(key + '|' + READ_VERSION + (blockValidity ? '|blocos' : '')) + '.json');
  if (fs.existsSync(f)) return { ...JSON.parse(fs.readFileSync(f, 'utf8')), cached: true };
  if (newReads >= MAX_NEW) throw new Error('teto de páginas novas desta execução');
  if (Date.now() > DEADLINE) throw new Error('prazo da rodada esgotado; fica para a próxima');
  const buf = await download(url, referer);
  // PDF (o Roldão publica o encarte inteiro assim): o Gemini lê PDF direto
  const mime = buf.subarray(0, 4).toString() === '%PDF' ? 'application/pdf' : buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  newReads++;
  const blockRule = blockValidity ? BLOCK_RULE : '';
  // Cada leitor devolve a página lida ou lança erro; o motivo da troca fica registrado em motivoGemini
  const porOcr = async () => ({ ...(await lerPorOcr(buf, PROMPT, { blockRule })) });
  const porGemini = async () => {
    try { return { ...(await askGemini(buf, mime, prompt)), reader: 'gemini' }; }
    catch (e) {
      console.warn('  gemini falhou:', e.message);
      try { const r = await askOpenRouter(buf, mime, prompt); return { ...r, reader: 'openrouter:' + r.model }; }
      catch (e2) { throw new Error(`${e.message} | reserva: ${e2.message}`); }
    }
  };
  let res, motivoGemini = null;
  if (READER_MODE === 'so-gemini') { res = await porGemini(); motivoGemini = 'READER_MODE=so-gemini'; }
  else if (READER_MODE === 'gemini-primeiro') {
    try { res = await porGemini(); }
    catch (e) {
      console.warn('  tentando o OCR:', e.message);
      try { res = await porOcr(); } catch (e2) { throw new Error(`${e.message} | ocr: ${e2.message}`); }
    }
  } else {
    try { res = await porOcr(); }
    catch (e) {
      if (!(e instanceof OcrFalhou)) console.warn('  erro inesperado no OCR:', e.message);
      motivoGemini = e.message.slice(0, 300);
      console.warn('  OCR não resolveu, indo para o Gemini:', motivoGemini);
      res = await porGemini();
    }
  }
  const page = { validFrom: res.validFrom ?? null, validUntil: res.validUntil ?? null, products: res.products ?? [], model: res.model, reader: res.reader, ...(motivoGemini ? { motivoGemini } : {}), readAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_READ, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(page));
  return { ...page, cached: false };
}

// Validade própria de um produto (bloco do tabloide). Vale só se for uma data coerente: dentro da janela geral do
// encarte (um bloco nunca dura mais que o tabloide) e com início <= fim; do contrário usa a validade geral.
// geral = { validFrom, validUntil } em ISO (já convertidas por startIso/endIso). Devolve { validFrom, validUntil }.
export function itemValidity(it, geral) {
  let from = startIso(it.validFrom), until = endIso(it.validUntil);
  const gF = geral.validFrom ? Date.parse(geral.validFrom) : -Infinity, gU = geral.validUntil ? Date.parse(geral.validUntil) : Infinity;
  if (from && (Date.parse(from) < gF || Date.parse(from) > gU)) from = null;
  if (until && (Date.parse(until) > gU || Date.parse(until) < gF)) until = null;
  if (from && until && Date.parse(from) > Date.parse(until)) { from = null; until = null; }
  return { validFrom: from ?? geral.validFrom, validUntil: until ?? geral.validUntil };
}

// "2026-11-09" em horário de Brasília: início às 00:00, fim às 23:59:59.
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const startIso = (s) => { const m = ISO_DAY.exec(s ?? ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], 3)).toISOString() : null; };
const endIso = (s) => { const m = ISO_DAY.exec(s ?? ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3] + 1, 2, 59, 59)).toISOString() : null; };
const mode = (xs) => { const c = new Map(); for (const x of xs.filter(Boolean)) c.set(x, (c.get(x) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

// Frase de cálculo ("neste(a) pacote, o(a) quilo sai por", "nesta caixa a unidade sai por", "este pacote de 2,5kg sai por")
// não é outro preço. Conferência de 18/11: virava preço e o site mostrava R$ 12,98 numa linguiça de R$ 64,90 e
// R$ 1,89 numa caixa de hambúrguer de R$ 68,04. "Nesta oferta a unidade sai por" (desconto na 2ª unidade) continua valendo.
const CALC = /\b(neste|nesta|este|esta)\s*(\(a\))?\s*(pacote|caixa|fardo|embalagem|bandeja|pe[cç]a|kit|pack|saco|gal[aã]o)\b|\b(o|a)\s*(\(a\))?\s*(quilo|kg|litro|unidade|rolo|metro)\s+sai\s+por\b/i;
export const isCalc = (c) => CALC.test(String(c ?? '')) && !/levando|oferta|2[ªao°]\s*un|segunda/i.test(String(c));
// "de R$ 6,99 por R$ 5,99" lido como price 6,99 e others [{5,99, "por"}]: o "por" é o preço, o "de" é o anterior.
const DE_POR = /^(por|por apenas|apenas|s[oó])\s*:?$/i;
// Arruma o que a IA devolveu antes de virar linha (vale também para leituras já em cache).
export const normalize = (it) => {
  const others = (Array.isArray(it.others) ? it.others : []).filter((x) => !isCalc(x?.condition));
  const por = others.filter((x) => typeof x?.price === 'number' && x.price > 0 && x.price < it.price && DE_POR.test(String(x.condition ?? '').trim()))
    .sort((a, b) => a.price - b.price)[0];
  if (por) return { ...it, price: por.price, listPrice: Math.max(it.listPrice ?? 0, it.price), others: others.filter((x) => x !== por) };
  return { ...it, others };
};
// Produto "por kg" que só existe como cálculo de outro da mesma página ("LINGUIÇA AURORA PACOTE 5KG" R$ 89,90 e
// "LINGUIÇA AURORA KG" R$ 17,98): sai. Só quando o derivado não tem quantidade e o preço bate com preço / kg do pacote.
const kgOf = (s) => { const m = /(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(s ?? ''); return m ? parseFloat(m[1].replace(',', '.')) : null; };
const qtyKg = (it) => kgOf(it.size) ?? kgOf(it.name);
const baseName = (n) => n.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\d+(?:[.,]\d+)?\s*(KG|G|ML|L)\b/g, ' ').replace(/\b(PACOTE|PCT|PC|PECA|KG|QUILO|BANDEJA|CAIXA|CX)\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, ' ').trim();
export const dropDerived = (list) => list.filter((b) => !(qtyKg(b) == null && /\bkg\b|quilo/i.test(`${b.name} ${b.size ?? ''} ${b.condition ?? ''}`)
  && list.some((a) => a !== b && qtyKg(a) > 1 && baseName(a.name) === baseName(b.name) && Math.abs(a.price - b.price * qtyKg(a)) <= a.price * 0.01 + 0.05)));

// "cada"/"un"/"por" não é condição; "quilo"/"kg" vira "preço por kg"; frase de cálculo sai
export const cond = (c) => {
  const t = String(c ?? '').trim();
  if (!t || /^(cada|por|un\.?|und\.?|unid\.?|unidade|(o )?pre[cç]o (por|da) unidade)$/i.test(t) || isCalc(t)) return null;
  if (/^(por\s+)?(o\s+)?(quilo|kg)$/i.test(t) || /^pre[cç]o por (kg|quilo)$/i.test(t)) return 'preço por kg';
  return t;
};
const isPdf = (u) => /\.pdf($|\?)/i.test(u);
// De todos os preços alternativos, o menor que não pede cartão da loja vira a condição ("R$ 28,50 no app Roldão Mais");
// sem nenhum assim, o de cartão fica só como observação (o build-site não deixa virar preço principal).
const CARD = /cart[aã]o|\bpay\b/i;
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
export const bestCond = (it) => {
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
      const key = enc.arquivo ?? enc.market; // 'arquivo': grava em <arquivo>.json (ex.: folheto do Atacadão, sem apagar o catálogo)
      rows[key] ??= new Map();
      if (enc.validUntil && new Date(enc.validUntil) < now) { console.log(`pulando vencido: ${enc.market} ${enc.offerId}`); continue; }
      if (enc.validFrom && new Date(enc.validFrom) > now) { console.log(`ainda não começou: ${enc.market} ${enc.offerId}`); continue; }
      const pages = [];
      for (let i = 0; i < enc.images.length; i++) {
        const url = enc.images[i];
        console.log(`${enc.market} ${enc.offerId} página ${i + 1}/${enc.images.length}`);
        if (DRY) continue;
        try {
          const p = await readPage(url, enc.referer, enc.imageKeys?.[i] ?? url, !!enc.blockValidity);
          pages.push({ url, ...p });
          // leitura antiga (sem "reader"): foi o Gemini, ou o OpenRouter se o modelo começa assim
          const reader = p.reader ?? (String(p.model).startsWith('openrouter') ? 'openrouter:' + p.model : 'gemini');
          report.pages.push({ market: enc.market, ...(enc.arquivo ? { arquivo: enc.arquivo } : {}), offerId: enc.offerId, url, ok: true, cached: p.cached, products: p.products.length, model: p.model, reader, ...(p.motivoGemini ? { motivoGemini: p.motivoGemini } : {}) });
          console.log(`  ${p.products.length} produtos${p.cached ? ' (cache)' : ` (${reader})`}`);
          if (!p.cached && !reader.startsWith('ocr+')) await sleep(GAP_MS); // o intervalo é por causa da cota do Gemini; o OCR tem o seu controle de tokens
        } catch (e) {
          console.warn('  erro:', e.message);
          report.pages.push({ market: enc.market, ...(enc.arquivo ? { arquivo: enc.arquivo } : {}), offerId: enc.offerId, url, ok: false, error: e.message });
        }
      }
      // página sem nenhum preço alternativo num encarte em que as outras têm: leitura provavelmente incompleta
      // (conferência de 18/11: 6 páginas do Assaí sem nenhum "a partir de 3 un."). Só avisa; não relê sozinho.
      const alts = (p) => p.products.filter((it) => (Array.isArray(it.others) && it.others.length) || it.condition).length;
      if (pages.some((p) => alts(p) > 0)) {
        for (const p of pages.filter((p) => p.products.length >= 10 && !alts(p))) {
          console.log(`::warning::${enc.market}: página sem nenhum preço alternativo, conferir ${p.url}`);
          const r = report.pages.find((x) => x.url === p.url); if (r) r.semAlternativos = true;
        }
      }
      // validade: a do manifesto; senão a impressa na página; senão a mais comum entre as páginas do encarte
      const encFrom = mode(pages.map((p) => p.validFrom)), encUntil = mode(pages.map((p) => p.validUntil));
      for (const p of pages) {
        const validFrom = enc.validFrom ?? startIso(p.validFrom ?? encFrom);
        // comércio de bairro (social.mjs): arte sem data impressa vale até fallbackUntil (3 dias após o post)
        const printed = endIso(p.validUntil ?? encUntil);
        const validUntil = enc.validUntil ?? printed ?? enc.fallbackUntil ?? null;
        const usouFallback = !enc.validUntil && !printed && !!enc.fallbackUntil;
        if (!validUntil) { console.warn(`  sem validade, descartando a página ${p.url}`); continue; }
        if (new Date(validUntil) < now) continue;
        for (const it of dropDerived(p.products.filter(ok).map(normalize))) {
          // faixa de validade do bloco (só em encarte com blockValidity); sem ela vale a geral
          const v = enc.blockValidity ? itemValidity(it, { validFrom, validUntil }) : { validFrom, validUntil };
          if (new Date(v.validUntil) < now) continue; // bloco já vencido
          const id = sha1(`${enc.market}|${it.name.trim().toLowerCase()}|${it.price}`).slice(0, 12);
          rows[key].set(id, {
            market: enc.market, externalId: id, name: it.name.trim(), brand: it.brand ?? null, ean: null, size: it.size ?? null,
            price: it.price, listPrice: it.listPrice > it.price ? it.listPrice : null, unitPrice: null,
            category: it.category ?? 'outros', categoryRaw: enc.categoryRaw ?? null,
            ...(enc.section ? { section: enc.section } : {}), // ex.: 'farmacia', para filtrar depois
            ...(enc.segment ? { segment: enc.segment } : {}), // 'bairro' (comércio de bairro do Instagram)
            // de PDF não dá para recortar a foto: fica sem imagem e o link abre o PDF
            imageUrl: isPdf(p.url) ? null : p.url, imageBox: !isPdf(p.url) && Array.isArray(it.box) && it.box.length === 4 ? it.box : null,
            productUrl: enc.link ?? p.url, source: 'encarte', condition: bestCond(it),
            validFrom: v.validFrom, validUntil: v.validUntil,
            validityNote: usouFallback ? (enc.fallbackNote ?? null) : (enc.validityNote ?? null),
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
    const failed = report.pages.filter((p) => (p.arquivo ?? p.market) === market && !p.ok).length;
    // Leitura toda falhou: mantém o arquivo anterior (o build-site tira o que já venceu).
    if (!map.size && failed && fs.existsSync(file)) { console.warn(`${market}: nada lido, mantendo o arquivo anterior`); continue; }
    fs.writeFileSync(file, JSON.stringify([...map.values()], null, 1));
    console.log(`gravado ${path.basename(file)}: ${map.size}`);
  }
  report.finishedAt = new Date().toISOString();
  report.newReads = newReads;
  report.readerMode = READER_MODE;
  report.porLeitor = {};
  for (const p of report.pages.filter((x) => x.ok && !x.cached)) { const k = p.reader.startsWith('ocr+') ? 'ocr' : p.reader.split(':')[0]; report.porLeitor[k] = (report.porLeitor[k] ?? 0) + 1; }
  fs.writeFileSync(path.join(OUT, 'encartes.leitura.json'), JSON.stringify(report, null, 1));
}
// só roda quando chamado direto (o teste importa as funções acima)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
