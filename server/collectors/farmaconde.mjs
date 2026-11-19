// Farma Conde (farmaconde.com.br, VTEX): farmácia com 2 lojas em Mauá.
// Uso: node collectors/farmaconde.mjs (a partir de server/). Grava data/extraido/farmaconde.json.
// Regra de retirada: o item só entra se a simulação (orderForms/simulation) disser que está disponível
// para retirada em pelo menos uma das 2 lojas de Mauá; o preço é o da simulação (menor entre as lojas).
// rx e generic vêm só da ficha do produto (Tarja, Controlado, Tipo de Produto), nunca do nome.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const BASE = 'https://www.farmaconde.com.br';
const MARKET = 'Farma Conde';
const STORE_SCOPE = 'Farma Conde: preço do site com retirada nas lojas de Mauá (Barão de Mauá e Castelo Branco)';
// Lojas de Mauá: a simulação precisa do CEP da própria loja, senão a retirada nela volta "cannotBeDelivered".
const STORES = [
  { seller: 'farmaconde306', cep: '09310000', name: 'Mauá Barão de Mauá' }, // Av. Barão de Mauá, 732
  { seller: 'farmaconde285', cep: '09321375', name: 'Mauá Castelo Branco' }, // Av. Castelo Branco, 2365
];
const UA = 'Mozilla/5.0 (compatible; BateOfertas/1.0; coleta educada, 1 requisicao por segundo)';
const PAGE = 50; // máximo de produtos por chamada do catálogo
const FROM_CAP = 2500; // o catálogo não entrega além de _from=2500: fatia por preço até caber
const SIM_BATCH = 50; // itens por simulação
const MAX_REQ = 1800;
const LIMIT = Number(process.env.FC_LIMIT) || 0; // teste: para depois de N produtos do catálogo
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let requests = 0;
async function http(url, init = {}) {
  for (let t = 0; t < 5; t++) {
    if (requests >= MAX_REQ) throw new Error('teto de requisições atingido');
    requests++;
    await sleep(1000);
    let r;
    try {
      r = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) } });
    } catch (e) {
      if (t === 4) throw e;
      await sleep(3000 * 2 ** t);
      continue;
    }
    if (r.status === 403 || r.status === 429) throw new Error(`bloqueio HTTP ${r.status} em ${url}`);
    if (r.ok || r.status === 206) return r;
    if (r.status < 500) throw new Error(`HTTP ${r.status} em ${url}`);
    console.warn(`HTTP ${r.status}, tentativa ${t + 1}: ${url}`);
    await sleep(3000 * 2 ** t);
  }
  throw new Error(`falhou 5x: ${url}`);
}

// ---------- catálogo, fatiado por faixa de preço ----------
const catUrl = (a, b, from) =>
  `${BASE}/api/catalog_system/pub/products/search?fq=${encodeURIComponent(`P:[${a} TO ${b}]`)}&_from=${from}&_to=${from + PAGE - 1}`;
const products = new Map(); // productId -> produto
let capped = 0;

async function slice(a, b) {
  if (LIMIT && products.size >= LIMIT) return;
  const r = await http(catUrl(a, b, 0));
  const total = Number((r.headers.get('resources') || '').split('/')[1]) || 0;
  if (!total) return;
  if (total > FROM_CAP + PAGE && b - a > 0.011) {
    const mid = Math.floor(((a + b) / 2) * 100) / 100;
    await slice(a, mid);
    await slice(Math.round((mid + 0.01) * 100) / 100, b);
    return;
  }
  if (total > FROM_CAP + PAGE) { capped++; console.warn(`faixa R$ ${a} (${total} itens) acima do teto do catálogo; pode perder itens`); }
  let from = 0;
  let data = await r.json();
  for (;;) {
    for (const p of data) if (!products.has(p.productId)) products.set(p.productId, p);
    from += PAGE;
    if (data.length < PAGE || from > FROM_CAP || from >= total || (LIMIT && products.size >= LIMIT)) break;
    data = await (await http(catUrl(a, b, from))).json();
  }
}

// ---------- simulação com retirada ----------
async function simulate(store, itemIds) {
  const body = { items: itemIds.map((id) => ({ id, quantity: 1, seller: store.seller })), country: 'BRA', postalCode: store.cep };
  const r = await http(`${BASE}/api/checkout/pub/orderForms/simulation?sc=1`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  const out = new Map(); // itemId -> {price, listPrice}
  for (const it of j.items || []) {
    if (it.availability !== 'available') continue;
    const slas = j.logisticsInfo?.[it.requestIndex]?.slas || [];
    const pick = slas.some((s) => s.deliveryChannel === 'pickup-in-point' && String(s.pickupPointId || '').startsWith(store.seller));
    if (!pick || !(it.price > 0)) continue;
    out.set(String(it.id), { price: it.price / 100, listPrice: it.listPrice / 100 });
  }
  return out;
}

// ---------- montagem das linhas ----------
const first = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
function isRx(p) {
  const tarja = strip(first(p['Tarja']));
  return /vermelha|preta/.test(tarja) || strip(first(p['Controlado'])) === 'sim';
}
const isGeneric = (p) => strip(first(p['Tipo de Produto'])) === 'generico';

// Categoria: a farmácia usa a árvore do site (categoryRaw); higiene/beleza/bebê continuam em "higiene"
// para comparar com os mercados, o resto fica "outros" e o category.mjs decide (farmacia) pelo segmento.
const HIGIENE = /higiene|beleza|perfumaria|cabelo|pele|banho|fralda|bebe|infantil|dental|oral|sabonete|desodorante|absorvente|protetor solar|barbear/;
const categorize = (raw) => (HIGIENE.test(strip(raw)) ? 'higiene' : 'outros');

function toRows(p, offers, collectedAt) {
  const rows = [];
  const rx = isRx(p);
  const generic = isGeneric(p);
  const categoryRaw = (p.categories?.[0] ?? '').replace(/^\/|\/$/g, '').replace(/\//g, ' > ') || null;
  for (const it of p.items || []) {
    const o = offers.get(String(it.itemId));
    if (!o?.length) continue;
    const price = Math.min(...o.map((x) => x.price));
    const list = Math.max(...o.filter((x) => x.price === price).map((x) => x.listPrice));
    const name = it.nameComplete || it.name || p.productName;
    const sizeM = [...String(name).matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|un)\b/gi)].pop();
    rows.push({
      market: MARKET,
      segment: 'farmacia',
      externalId: String(it.itemId),
      name,
      brand: p.brand || null,
      ean: it.ean ? String(it.ean).trim() || null : null,
      size: sizeM ? `${sizeM[1].replace(',', '.')}${sizeM[2].toLowerCase()}` : null,
      price,
      listPrice: list > price ? list : null,
      category: categorize(categoryRaw),
      categoryRaw,
      ...(rx ? { rx: true } : {}),
      ...(generic ? { generic: true } : {}),
      stores: STORES.filter((s) => o.some((x) => x.store === s.name)).map((s) => s.name),
      imageUrl: it.images?.[0]?.imageUrl ?? null,
      productUrl: p.link || (p.linkText ? `${BASE}/${p.linkText}/p` : null),
      validFrom: null,
      validUntil: null,
      validityNote: 'o site não informa até quando o preço vale',
      storeScope: STORE_SCOPE,
      collectedAt,
    });
  }
  return rows;
}

async function main() {
  const started = Date.now();
  let stopped = null;
  const offers = new Map(); // itemId -> [{price, listPrice, store}]
  try {
    await slice(0, 1000000);
    console.log(`catálogo: ${products.size} produtos (${requests} requisições, ${Math.round((Date.now() - started) / 1000)}s)`);
    const ids = [...new Set([...products.values()].flatMap((p) => (p.items || []).map((i) => String(i.itemId))))];
    for (const store of STORES) {
      let ok = 0;
      for (let i = 0; i < ids.length; i += SIM_BATCH) {
        const res = await simulate(store, ids.slice(i, i + SIM_BATCH));
        for (const [id, v] of res) { (offers.get(id) ?? offers.set(id, []).get(id)).push({ ...v, store: store.name }); ok++; }
        if ((i / SIM_BATCH) % 40 === 0) console.log(`${store.name}: ${Math.min(i + SIM_BATCH, ids.length)}/${ids.length} simulados, ${ok} com retirada`);
      }
      console.log(`${store.name}: ${ok} itens com retirada`);
    }
  } catch (e) {
    stopped = e.message;
    console.error('coleta interrompida:', stopped);
  }
  if (stopped) { console.error('coleta incompleta; mantendo arquivo anterior'); process.exit(1); }
  const collectedAt = new Date().toISOString();
  const rows = [...products.values()].flatMap((p) => toRows(p, offers, collectedAt));
  if (!rows.length) { console.error('nenhum produto coletado; mantendo arquivo anterior'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(`${OUT_DIR}farmaconde.json`, JSON.stringify(rows));
  const porLoja = Object.fromEntries(STORES.map((s) => [s.name, rows.filter((r) => r.stores.includes(s.name)).length]));
  console.log(`farmaconde: ${rows.length} itens | rx ${rows.filter((r) => r.rx).length} | genéricos ${rows.filter((r) => r.generic).length} | com EAN ${rows.filter((r) => r.ean).length} | por loja ${JSON.stringify(porLoja)} | ${requests} requisições | ${Math.round((Date.now() - started) / 6000) / 10} min | faixas acima do teto: ${capped}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
