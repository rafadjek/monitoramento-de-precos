// Junta os JSON de data/extraido em arquivos estáticos para o site (app/public/data).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(ROOT, '../app/public/data');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const valid = (o) => o && o.market && o.externalId != null && o.name && typeof o.price === 'number' && o.price > 0 && o.collectedAt;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');
const now = Date.now();
const index = { generatedAt: new Date().toISOString(), markets: [] };

import crypto from 'node:crypto';
import sharp from 'sharp';
import { groupOffers } from './group.mjs';
const IMG = path.join(ROOT, '../app/public/img');
const PAGES = path.join(ROOT, 'data/cache/paginas');
fs.rmSync(IMG, { recursive: true, force: true });
fs.mkdirSync(IMG, { recursive: true });
fs.mkdirSync(PAGES, { recursive: true });

// Recorta a foto do produto na página do folheto e devolve o caminho relativo da miniatura.
async function crop(o, id) {
  const pf = path.join(PAGES, crypto.createHash('sha1').update(o.imageUrl).digest('hex'));
  if (!fs.existsSync(pf)) {
    const r = await fetch(o.imageUrl);
    if (!r.ok) return null;
    fs.writeFileSync(pf, Buffer.from(await r.arrayBuffer()));
  }
  const img = sharp(pf);
  const { width: W, height: H } = await img.metadata();
  const [y0, x0, y1, x1] = o.imageBox.map((n) => Math.min(Math.max(n, 0), 1000));
  const left = Math.floor((x0 / 1000) * W), top = Math.floor((y0 / 1000) * H);
  const width = Math.floor(((x1 - x0) / 1000) * W), height = Math.floor(((y1 - y0) / 1000) * H);
  if (width < 20 || height < 20) return null;
  const name = crypto.createHash('sha1').update(id).digest('hex').slice(0, 16) + '.webp';
  await img.extract({ left, top, width: Math.min(width, W - left), height: Math.min(height, H - top) })
    .resize(320, 320, { fit: 'inside' }).webp({ quality: 78 }).toFile(path.join(IMG, name));
  return `img/${name}`;
}

const STORE_LABEL = {
  'Atacadão': 'preços da loja de Mauá (CEP 09310-000)',
  Spani: 'preços da loja Mauá 1 (Av. Barão de Mauá, 2005)',
};
const built = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !x.includes('encartes'))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  if (!Array.isArray(parsed)) continue; // .meta.json e .verificacao.json dos coletores
  const rows = parsed.filter(valid);
  if (!rows.length) continue;
  const market = rows[0].market;
  const vigentes = rows.filter((o) => !o.validUntil || new Date(o.validUntil).getTime() >= now);
  const slim = [];
  for (const o of vigentes) {
    const id = `${slug(market)}:${o.externalId}`;
    let imageUrl = o.imageUrl ?? null;
    if (imageUrl && Array.isArray(o.imageBox)) {
      imageUrl = await crop(o, id).catch(() => null); // sem recorte, melhor sem imagem do que a página inteira
    }
    slim.push({
      id, market, name: o.name, brand: o.brand ?? null, size: o.size ?? null,
      price: o.price, listPrice: o.listPrice ?? null, unitPrice: o.unitPrice ?? null, category: o.category ?? 'outros',
      imageUrl, productUrl: o.productUrl ?? null, validUntil: o.validUntil ?? null, validityNote: o.validityNote ?? null,
    });
  }
  built.push({ market, slim });
  index.markets.push({
    name: market, file: `${slug(market)}.json`, products: slim.length, expiredDropped: rows.length - vigentes.length,
    storeScope: STORE_LABEL[market] ?? ((rows[0].storeScope ?? '').slice(0, 90) || null), collectedAt: rows.map((r) => r.collectedAt).sort().at(-1),
  });
}

// Produtos iguais em mercados diferentes recebem o mesmo "g" (id do grupo).
const flat = built.flatMap((b) => b.slim);
const groups = groupOffers(flat);
for (const g of groups) {
  const gid = crypto.createHash('sha1').update(g.key).digest('hex').slice(0, 10);
  for (const i of g.idx) flat[i].g = gid;
}
index.groups = groups.length;
for (const b of built) fs.writeFileSync(path.join(OUT, `${slug(b.market)}.json`), JSON.stringify(b.slim));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(index.markets.map((m) => `${m.name}: ${m.products}`).join('\n') || 'nenhum dado');
console.log(`Grupos com 2+ mercados: ${groups.length}`);
