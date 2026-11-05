// Lê folhetos em imagem com IA de visão gratuita e grava produtos no formato comum.
// Uso: node readers/folheto.mjs <manifesto.json> [--dry]
// Manifesto: array de { market, offerId, validFrom, validUntil, validityNote, stores[], images[] }
// Segredos (variáveis de ambiente): GEMINI_API_KEY (principal), OPENROUTER_API_KEY (reserva).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'data/cache');
const OUT = path.join(ROOT, 'data/extraido');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GAP_MS = Number(process.env.READER_GAP_MS || 13000); // ~4 pedidos/min, abaixo do limite gratuito
const [manifestPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = `Você lê uma página de folheto de supermercado brasileiro. Extraia TODOS os produtos com preço visível.
Regras:
- Só o que está escrito na imagem. Nunca invente nem estime. Se não tiver certeza do preço, omita o produto.
- price = preço de venda de 1 unidade/embalagem em reais, como número (ex.: 24.9). Se o preço só vale em combo ("leve 3 pague 2", "a partir de 3 unidades", cartão do clube), coloque o preço da condição em price e descreva a condição em condition.
- listPrice = preço "de", se aparecer; senão null.
- name = nome do produto como no folheto, com marca e tamanho; brand e size separados quando possíveis (size ex.: "5kg", "900ml").
- category: "alimenticios" (comida e bebida), "higiene" (cuidado pessoal), "limpeza" (casa e lavanderia) ou "outros".
- box = [ymin, xmin, ymax, xmax] da foto/etiqueta do produto, valores inteiros de 0 a 1000.
Responda somente com um array JSON.`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' }, brand: { type: 'STRING', nullable: true }, size: { type: 'STRING', nullable: true },
      price: { type: 'NUMBER' }, listPrice: { type: 'NUMBER', nullable: true }, unit: { type: 'STRING', nullable: true },
      condition: { type: 'STRING', nullable: true },
      category: { type: 'STRING', enum: ['alimenticios', 'higiene', 'limpeza', 'outros'] },
      box: { type: 'ARRAY', items: { type: 'INTEGER' } },
    },
    required: ['name', 'price', 'category'],
  },
};

async function download(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; monitoramento-precos)' } });
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function askGemini(buf, mime) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem GEMINI_API_KEY');
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: buf.toString('base64') } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
  for (let tent = 0; tent < 4; tent++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await sleep(20000 * (tent + 1)); continue; }
    if (!r.ok) throw new Error(`gemini ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    return JSON.parse(t);
  }
  throw new Error('gemini: limite de uso atingido');
}

async function askOpenRouter(buf, mime) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('sem OPENROUTER_API_KEY');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'openrouter/free', temperature: 0,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }] }],
    }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const t = (await r.json()).choices?.[0]?.message?.content ?? '';
  return JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
}

async function readPage(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(f)) return { items: JSON.parse(fs.readFileSync(f, 'utf8')), cached: true };
  const buf = await download(url);
  const mime = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
  let items;
  try { items = await askGemini(buf, mime); }
  catch (e) {
    console.warn('  gemini falhou:', e.message);
    items = await askOpenRouter(buf, mime);
  }
  fs.writeFileSync(f, JSON.stringify(items));
  return { items, cached: false };
}

const ok = (it) => it && typeof it.name === 'string' && it.name.length > 2 && typeof it.price === 'number' && it.price > 0 && it.price < 10000;

async function main() {
  if (!manifestPath) throw new Error('uso: node readers/folheto.mjs <manifesto.json> [--dry]');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const now = new Date();
  const rows = {};
  for (const enc of manifest) {
    if (enc.validUntil && new Date(enc.validUntil) < now) { console.log(`pulando vencido: ${enc.market} ${enc.offerId}`); continue; }
    for (let i = 0; i < enc.images.length; i++) {
      const url = enc.images[i];
      console.log(`${enc.market} ${enc.offerId} página ${i + 1}/${enc.images.length}`);
      if (DRY) continue;
      let res;
      try { res = await readPage(url); } catch (e) { console.warn('  erro:', e.message); continue; }
      let kept = 0;
      for (const it of res.items.filter(ok)) {
        const key = `${enc.market}|${it.name.toLowerCase()}|${it.price}`;
        const id = crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
        (rows[enc.market] ??= new Map()).set(id, {
          market: enc.market, externalId: id, name: it.name.trim(), brand: it.brand ?? null, size: it.size ?? null,
          price: it.price, listPrice: it.listPrice ?? null, unitPrice: it.unit ?? null,
          category: it.category ?? 'outros', categoryRaw: null,
          imageUrl: url, imageBox: Array.isArray(it.box) && it.box.length === 4 ? it.box : null, productUrl: null,
          validFrom: enc.validFrom ?? null, validUntil: enc.validUntil ?? null,
          validityNote: [enc.validityNote, it.condition].filter(Boolean).join(' · ') || null,
          storeScope: `Folheto: ${(enc.stores ?? []).join(', ') || 'lojas não informadas'}`,
          collectedAt: now.toISOString(),
        });
        kept++;
      }
      console.log(`  ${kept} produtos${res.cached ? ' (cache)' : ''}`);
      if (!res.cached) await sleep(GAP_MS);
    }
  }
  if (!DRY) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [market, map] of Object.entries(rows)) {
      const file = path.join(OUT, market.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-') + '.json');
      fs.writeFileSync(file, JSON.stringify([...map.values()], null, 1));
      console.log(`gravado ${file}: ${map.size}`);
    }
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
