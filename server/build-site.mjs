// Junta os JSON de data/extraido em arquivos estáticos para o site (app/public/data).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(ROOT, '../app/public/data');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const valid = (o) => o && o.market && o.externalId != null && o.name && typeof o.price === 'number' && o.price >= 0.1 && o.price < 20000 && // R$ 0,01 e R$ 99.999 são cadastro sem preço (vistos no Nagumo)
   o.collectedAt;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');
const now = Date.now();
const index = { generatedAt: new Date().toISOString(), markets: [] };

import crypto from 'node:crypto';
import sharp from 'sharp';
import { groupOffers, pairKey, parsePack } from './group.mjs';
import { bestPrice } from './price.mjs';
import { fineCategory } from './category.mjs';
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
  Coop: 'preços da loja Barão de Mauá (retirada, CEP 09310-000)',
  Baronesa: 'encarte da loja de Mauá (R. Fernão Dias, 5)',
  'Assaí': 'encarte das lojas de Ribeirão Pires e Mauá',
  Nagumo: 'preços da loja de Mauá (Av. Barão de Mauá, 3232)',
  Semar: 'preços da loja 06 Mauá',
  Extra: 'preços da loja online de São Bernardo (Demarchi); as lojas de Mauá e Ribeirão Pires não vendem pelo site',
  Joanin: 'tabloide das lojas de Mauá e Ribeirão Pires',
  Nevada: 'ofertas do Instagram (@redenevada)',
  STUK: 'jornal de ofertas do dia publicado no Instagram (@supermercadostuk)',
  Lourencini: 'ofertas do Instagram (@lourencinisupermercados)',
  Dia: 'destaques do folheto da loja de Mauá (Av. Dom José Gaspar, 1016), via Tiendeo',
  'Roldão': 'encartes que valem na loja de Mauá (o Roldão não tem loja em Ribeirão Pires)',
};
// Cidades das lojas usadas por mercado (filtro do site).
const CITIES = {
  'Atacadão': ['Mauá'], Spani: ['Mauá'], Coop: ['Mauá'], Baronesa: ['Mauá'], 'Assaí': ['Mauá', 'Ribeirão Pires'],
  Nagumo: ['Mauá'], Semar: ['Mauá'], Joanin: ['Mauá', 'Ribeirão Pires'], 'Roldão': ['Mauá'], Dia: ['Mauá'], STUK: ['Ribeirão Pires'], Nevada: ['Mauá'], Lourencini: ['Mauá'],
  // preço da loja online de São Bernardo: não entra no filtro "Lojas em Mauá/Ribeirão Pires"
  Extra: ['São Bernardo do Campo'],
};
// Mercados sem fonte coletável: aparecem no site só com o caminho para as ofertas.
index.infoOnly = [{
  name: 'STUK', cities: ['Ribeirão Pires'],
  note: 'O jornal de ofertas sai todo dia só no Instagram e no WhatsApp de cada loja.',
  address: 'Av. Princesa Izabel, 980, Parque Aliança, Ribeirão Pires',
  links: [
    { label: 'Instagram', url: 'https://www.instagram.com/supermercadostuk/' },
    { label: 'WhatsApp', url: 'https://wa.me/5511980810790?text=Oi!%20Quero%20receber%20as%20ofertas%20do%20dia' },
    { label: 'Site', url: 'https://supermercadostuk.com.br/' },
  ],
}];
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
    const best = bestPrice(o.price, o.condition);
    slim.push({
      id, market, name: o.name, brand: o.brand ?? null, ean: o.ean ?? null, size: o.size ?? null,
      price: best.price, listPrice: best.listPrice ?? o.listPrice ?? null, category: fineCategory(o),
      imageUrl, productUrl: o.productUrl ?? null, validUntil: o.validUntil ?? null, // observação e unitPrice ficam só no dado bruto: o site não usa e pesavam MBs
      // caixa/fardo: quantas unidades vêm (o site compara pelo preço de cada uma)
      ...(parsePack(o.name, o.size ?? '') > 1 ? { units: parsePack(o.name, o.size ?? '') } : {}),
      ...(o.source === 'encarte' ? { source: 'encarte' } : {}),
      ...(best.condition ? { condition: best.condition } : {}),
    });
  }
  built.push({ market, slim });
  index.markets.push({
    name: market, file: `${slug(market)}.json`, products: slim.length, cities: CITIES[market] ?? [],
    source: rows.some((r) => r.source === 'encarte') ? 'encarte' : 'site', expiredDropped: rows.length - vigentes.length,
    storeScope: STORE_LABEL[market] ?? ((rows[0].storeScope ?? '').slice(0, 90) || null), collectedAt: rows.map((r) => r.collectedAt).sort().at(-1),
  });
}

// mercado que passou a ter produtos (ex.: STUK pelo Instagram) sai da lista de só-link
index.infoOnly = index.infoOnly.filter((i) => !index.markets.some((m) => m.name === i.name));

// Produtos iguais em mercados diferentes recebem o mesmo "g" (id do grupo).
const flat = built.flatMap((b) => b.slim);
// Vereditos de 'mesmo produto?': os rótulos do Rafael valem sempre; os do juiz com IA só se a prova dele passou.
const verdicts = new Map();
try {
  const j = JSON.parse(fs.readFileSync(path.join(IN, 'juiz-veredictos.json'), 'utf8'));
  if (j.ativo) for (const [k, v] of Object.entries(j.pares || {})) verdicts.set(k, v.same);
} catch { /* ainda sem juiz */ }
try {
  for (const x of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/rotulos.json'), 'utf8')))
    if (x.label === 'mesmo' || x.label === 'diferente') verdicts.set(pairKey(x.a, x.b), x.label === 'mesmo');
} catch { /* sem rótulos */ }
const groups = groupOffers(flat, (i, j) => verdicts.get(pairKey(flat[i], flat[j])));
index.verdicts = verdicts.size;
for (const g of groups) {
  const gid = crypto.createHash('sha1').update(g.key).digest('hex').slice(0, 10);
  for (const i of g.idx) flat[i].g = gid;
}
for (const o of flat) delete o.ean; // só serve para agrupar; o site não usa
index.groupsByEan = groups.filter((g) => g.key.startsWith('ean:')).length;
index.groups = groups.length;
for (const b of built) fs.writeFileSync(path.join(OUT, `${slug(b.market)}.json`), JSON.stringify(b.slim));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(index.markets.map((m) => `${m.name}: ${m.products}`).join('\n') || 'nenhum dado');
console.log(`Grupos com 2+ mercados: ${groups.length}`);
