// Coop Supermercado (loja online linkada em portalcoop.com.br): coopsupermercado.com.br, VTEX Intelligent Search.
// Uso: node collectors/coop.mjs (a partir de server/). Grava data/extraido/coop.json, coop.meta.json e coop.md.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const BASE = 'https://www.coopsupermercado.com.br';
// Loja: o site guarda a escolha como regionId = base64("SW#<vendedor>"). coopspbm = Barão de Mauá,
// coopsprp = Ribeirão Pires (vendedores listados em /api/checkout/pub/regions?country=BRA&postalCode=09310000).
const SELLER = process.env.COOP_SELLER || 'coopspbm';
const REGION = Buffer.from(`SW#${SELLER}`).toString('base64');
// Preço de cooperado: o site usa o canal de vendas 2 (vendedor "<loja>sc2"), que a mesma API devolve com
// regionId = base64("SW#coopspbmsc2"). Pela regra do price.mjs cooperado conta (só pede ser cooperado).
const REGION_COOP = Buffer.from(`SW#${SELLER}sc2`).toString('base64');
const STORE_SCOPE = 'Coop Supermercado Barão de Mauá (preços da loja, via regionId do site)';
const MARKET = 'Coop';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const MAX_REQ = 800; // cada página é lida duas vezes (preço normal e de cooperado)
const PAGE_CAP = 2400; // a API não entrega mais que ~2.500 itens por consulta
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// departamentos de comida, higiene e limpeza; pets, bazar, digitais e inativos ficam de fora
const DEPTS = {
  hortifruti: 'alimenticios', mercearia: 'alimenticios', 'exclusivos-coop': 'alimenticios', bebidas: 'alimenticios',
  'bebidas-alcoolicas': 'alimenticios', 'doces-e-confeitaria': 'alimenticios', 'frios-e-laticinios': 'alimenticios',
  congelados: 'alimenticios', peixaria: 'alimenticios', padaria: 'alimenticios', acougue: 'alimenticios',
  'cereais-e-saudaveis': 'alimenticios', 'especial-coca-cola': 'alimenticios',
  'higiene-e-cuidados-pessoais': 'higiene', limpeza: 'limpeza',
};
const HIGIENE = /higiene|sabonete|shampoo|xampu|condicionador|creme dental|escova dental|enxaguante|desodorante|absorvente|fralda|papel higienico|cotonete|barbear/;
const LIMPEZA = /limpeza|detergente|desinfetante|amaciante|sabao|alvejante|agua sanitaria|lava roupa|multiuso|esponja|saco de lixo|limpador/;

function categorize(dept, catPath, name) {
  const s = strip(`${catPath} ${name}`);
  if (DEPTS[dept] === 'alimenticios' && dept === 'exclusivos-coop') {
    if (LIMPEZA.test(s)) return 'limpeza';
    if (HIGIENE.test(s)) return 'higiene';
  }
  return DEPTS[dept] ?? 'outros';
}

let requests = 0;
async function api(path, region = REGION) {
  if (requests >= MAX_REQ) throw new Error('teto de requisições atingido');
  for (let t = 0; t < 3; t++) {
    requests++;
    await sleep(1000);
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${BASE}/api/io/_v/api/intelligent-search/${path}${sep}regionId=${encodeURIComponent(region)}`, { headers: { 'user-agent': UA } });
    if (r.status === 403 || r.status === 429) throw new Error(`bloqueio HTTP ${r.status}`);
    if (r.ok) return r.json();
    if (r.status < 500) throw new Error(`HTTP ${r.status} em ${path}`);
  }
  throw new Error(`falhou 3x: ${path}`);
}

async function categoryTree() {
  const r = await fetch(`${BASE}/sitemap/category-0.xml`, { headers: { 'user-agent': UA } });
  return [...(await r.text()).matchAll(/<loc>https:\/\/www\.coopsupermercado\.com\.br\/([^<]+)<\/loc>/g)].map((m) => m[1]);
}

// Cooperado: mesma página da busca no canal 2. Guarda o menor preço de cada produto (productId -> oferta).
// Falha que não seja bloqueio só deixa a página sem preço de cooperado (nunca inventa).
const coopOffers = new Map();
async function coopPage(path) {
  try {
    const d = await api(path, REGION_COOP);
    for (const p of d.products || []) {
      const it = p.items?.[0];
      const se = it?.sellers?.find((x) => x.sellerDefault) ?? it?.sellers?.[0];
      const co = se?.commertialOffer;
      if (co && co.Price > 0 && co.AvailableQuantity > 0) coopOffers.set(p.productId, { price: co.Price, listPrice: co.ListPrice });
    }
  } catch (e) {
    if (/bloqueio|teto/.test(e.message)) throw e;
    console.warn('cooperado: página sem preço de cooperado:', e.message);
  }
}

const facetPath = (levels) => levels.map((l, i) => `category-${i + 1}/${l}`).join('/');

async function walk(levels, all, cats, dept, seen) {
  const first = await api(`product_search/${facetPath(levels)}?count=50&page=1`);
  const total = first.recordsFiltered ?? 0;
  console.log(`${levels.join('/')}: ${total}`);
  if (total > PAGE_CAP && levels.length < 3) {
    const kids = cats.filter((c) => c.startsWith(levels.join('/') + '/') && c.split('/').length === levels.length + 1);
    for (const k of kids) await walk(k.split('/'), all, cats, dept, seen);
    return;
  }
  let page = 1;
  let data = first;
  while (data.products?.length) {
    await coopPage(`product_search/${facetPath(levels)}?count=50&page=${page}`);
    for (const p of data.products) if (!seen.has(p.productId)) { seen.add(p.productId); all.push({ p, dept }); }
    if (page * 50 >= total || page >= 50) break;
    page++;
    data = await api(`product_search/${facetPath(levels)}?count=50&page=${page}`);
  }
}

function toRow(p, dept, collectedAt, storeScope) {
  const it = p.items?.[0];
  const se = it?.sellers?.find((s) => s.sellerDefault) ?? it?.sellers?.[0];
  const co = se?.commertialOffer;
  if (!co || !(co.Price > 0) || !(co.AvailableQuantity > 0)) return null;
  // Produto vendido por peso: a API traz o preço do kg (Price) e o site mostra o preço do item,
  // "R$ 6,29 / 0.6 kg (R$ 10,49 /kg)" = preço do kg x unitMultiplier, cortado nos centavos (não arredondado).
  // Só usa o unitMultiplier que a própria API informa; kg com multiplicador 1 fica "preço por kg".
  const mu = String(it.measurementUnit || '').toLowerCase();
  const mult = Number(it.unitMultiplier);
  const byWeight = (mu === 'kg' || mu === 'g') && mult > 0 && mult !== 1;
  const scale = (v) => (byWeight ? Math.floor(Math.round(v * mult * 1e4) / 100) / 100 : v);
  const price = scale(co.Price);
  const listPrice = scale(co.ListPrice);
  const promo = listPrice > price;
  const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
  let condition = null;
  const coop = coopOffers.get(p.productId);
  if (coop) {
    const cp = scale(coop.price);
    if (cp > 0 && cp < price) condition = `${brl(cp)} para cooperado`;
  }
  let unitPrice = null;
  if (mu === 'kg' && byWeight) unitPrice = `${brl(co.Price)} /kg`;
  else if (mu === 'kg') unitPrice = 'preço por kg';
  const until = co.PriceValidUntil && new Date(co.PriceValidUntil).getUTCFullYear() < 2100 ? co.PriceValidUntil : null;
  const sizeM = [...String(p.productName).matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l|un)\b/gi)].pop();
  return {
    market: MARKET,
    externalId: String(p.productId),
    name: p.productName,
    brand: p.brand || null,
    ean: it?.ean ? String(it.ean).trim() : null,
    size: sizeM ? `${sizeM[1].replace(',', '.')}${sizeM[2].toLowerCase()}` : null,
    price,
    listPrice: promo ? listPrice : null,
    unitPrice,
    category: categorize(dept, p.categories?.[0] ?? '', p.productName),
    categoryRaw: (p.categories?.[0] ?? '').replace(/^\/|\/$/g, '').replace(/\//g, ' > ') || null,
    imageUrl: it.images?.[0]?.imageUrl ?? null,
    productUrl: p.link ? `${BASE}${p.link}` : null,
    validFrom: null,
    validUntil: until,
    validityNote: until ? null : 'o site não informa até quando o preço vale',
    condition,
    storeScope,
    collectedAt,
  };
}

async function main() {
  const started = new Date();
  const scope = STORE_SCOPE;
  console.log('loja:', scope);
  const cats = await categoryTree();
  const all = [];
  const seen = new Set();
  let stopped = null;
  try {
    for (const dept of Object.keys(DEPTS)) await walk([dept], all, cats, dept, seen);
  } catch (e) {
    stopped = e.message;
    console.warn('coleta interrompida:', stopped);
  }
  const collectedAt = new Date().toISOString();
  const rows = all.map(({ p, dept }) => toRow(p, dept, collectedAt, scope)).filter(Boolean);
  const byCat = rows.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {});
  if (!rows.length) { console.error('nenhum produto coletado; mantendo arquivos anteriores'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(`${OUT_DIR}coop.json`, JSON.stringify(rows, null, 1));
  fs.writeFileSync(`${OUT_DIR}coop.meta.json`, JSON.stringify({
    startedAt: started.toISOString(), finishedAt: collectedAt, requests, rawProducts: all.length, kept: rows.length,
    unavailableOrNoPrice: all.length - rows.length, byCategory: byCat, withImage: rows.filter((r) => r.imageUrl).length,
    withValidity: rows.filter((r) => r.validUntil).length, onPromo: rows.filter((r) => r.listPrice).length, stopped, storeScope: scope,
  }, null, 2));
  console.log(`coop: ${rows.length} produtos`, JSON.stringify(byCat), `(${requests} requisições)`);
  if (stopped && rows.length < 500) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
