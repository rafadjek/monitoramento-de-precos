// Supermercado Dia (Mauá). O site do Dia não publica ofertas; o folheto da loja de Mauá aparece no Tiendeo.
// Usa só a página pública da loja no Tiendeo (/maua/supermercado-dia, liberada no robots.txt). O folheto inteiro
// fica em /Catalogos/, que o robots.txt do Tiendeo proíbe: por isso entram só os produtos em destaque do folheto
// ("gibs"), que a página traz em texto: nome, marca, preço, "De/Por", página e foto recortada.
// Saída: server/data/extraido/dia.json (sem IA).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/dia.json', import.meta.url));
const PAGE = 'https://www.tiendeo.com.br/maua/supermercado-dia';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DIA_ID = '179'; // retailer_id do Dia no Tiendeo

const r = await fetch(PAGE, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(45000) });
if (!r.ok) { console.error(`dia: HTTP ${r.status}`); process.exit(1); }
const html = (await r.text()).replace(/\\"/g, '"').replace(/\\u0026/g, '&');

// folhetos do Dia na página (id -> validade)
const flyers = new Map();
for (const m of html.matchAll(/\{"id":"(\d+)","retailer_id":"(\d+)","title":"([^"]*)","start_date":"([^"]+)","end_date":"([^"]+)"[\s\S]{0,700}?"unpublish_at_iso":"([^"]+)"/g)) {
  if (m[2] !== DIA_ID) continue;
  flyers.set(m[1], { title: m[3], until: new Date(m[6]).toISOString() });
}
if (!flyers.size) { console.error('dia: nenhum folheto do Dia na página'); process.exit(1); }

const num = (s) => { const v = parseFloat(String(s ?? '').replace(',', '.')); return v > 0 ? v : null; };
const SIZE = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l|lt|litros?|un\.?|unidades|rolos|m)\b/i;
const rows = new Map();
const now = Date.now();
for (const m of html.matchAll(/\{"id":"([0-9a-f-]{36})","type":"crop","flyer_id":"(\d+)","title":"([^"]+)"([\s\S]{0,4000}?)"gibCover":\{"default":\["([^"]+)"/g)) {
  const [, id, flyerId, title, body, img] = m;
  const fl = flyers.get(flyerId);
  if (!fl || Date.parse(fl.until) < now) continue;
  const price = num((body.match(/"price_extended":\{[^}]*"digits":"([\d.,]+)"/) || [])[1]);
  if (!price || rows.has(id)) continue;
  const vision = (body.match(/"google_vision_text":"([^"]*)"/) || [])[1] || '';
  const brand = (body.match(/"brand":"([^"]*)"/) || [])[1] || title.split(' - ')[0] || null;
  const product = title.includes(' - ') ? title.split(' - ').slice(1).join(' - ') : title;
  // o texto do folheto (OCR) começa com a descrição limpa, com o tamanho; depois vêm preço e ruído
  const desc = vision.split(/\s(?:De|A partir|be|Por)\s/)[0].replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const size = (desc.match(SIZE) || [])[0] || null;
  const de = num((vision.match(/\bDe\s*(?:R\$\s*)?(\d+[.,]\d{2})/i) || [])[1]);
  const name = desc.length >= 8 ? desc : [product, brand].filter(Boolean).join(' ');
  // condição que o texto só sugere (2ª unidade, leve/pague, a partir de): marcada para conferir, sem inventar número
  const condition = /desconto na|leve|pague|a partir/i.test(vision) ? 'condição especial: confira no folheto' : null;
  rows.set(id, {
    market: 'Dia', externalId: id, name, brand: brand || null, ean: null, size,
    price, listPrice: de && de > price && de < price * 2.5 ? de : null, // "De" absurdo é ruído do OCR unitPrice: null,
    category: 'alimenticios', categoryRaw: (body.match(/"shared_category":"([^"]*)"/) || [])[1] || null,
    imageUrl: img, productUrl: PAGE, source: 'encarte', condition,
    validFrom: null, validUntil: fl.until,
    validityNote: `${fl.title}, destaque do folheto da loja de Mauá no Tiendeo`,
    storeScope: 'Folheto do Dia da loja de Mauá (Av. Dom José Gaspar, 1016), produtos em destaque, via Tiendeo',
    collectedAt: new Date().toISOString(),
  });
}
const out = [...rows.values()];
if (!out.length) { console.error('dia: nenhum produto em destaque'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`dia: ${out.length} produtos de ${flyers.size} folheto(s)`);
for (const o of out.slice(0, 12)) console.log(`  ${o.price} ${o.listPrice ?? ''} | ${o.name}`);
