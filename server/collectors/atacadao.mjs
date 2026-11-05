import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://www.atacadao.com.br';
const CEP = process.env.ATACADAO_CEP || '09310-000';
const MARKET = 'Atacadão';
const MAX_REQUESTS = 600;
const PAUSE_MS = 1100;

const DEPARTMENTS = [
  ['mercearia', 'alimenticios'], ['padaria-e-matinais', 'alimenticios'], ['bebidas', 'alimenticios'],
  ['frios-e-congelados', 'alimenticios'], ['carnes-aves-e-peixes', 'alimenticios'], ['hortifruti', 'alimenticios'],
  ['cafeteria', 'alimenticios'], ['higiene-e-perfumaria', 'higiene'], ['limpeza', 'limpeza'],
];
const DEPT_CATEGORY = Object.fromEntries(DEPARTMENTS);
const EXTRA_PAGES = [['catalogo', 'Super Ofertas']];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let blocked = null;

export async function openSession() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.getByRole('button', { name: /aceitar todos/i }).first().click({ timeout: 4000 }).catch(() => {});
  await page.locator('button:visible:has-text("INFORMAR LOCALIZAÇÃO")').first().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.locator('text=Entrega em Casa').first().click();
  await page.waitForTimeout(800);
  await page.locator('#location-search').fill(CEP);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  await page.locator('input[placeholder="Ex: 6157"]').fill('1');
  await page.getByRole('button', { name: /^confirmar$/i }).click();
  await page.waitForTimeout(4500);
  const ck = (await ctx.cookies()).find((c) => c.name === 'regionalization');
  const reg = ck ? JSON.parse(decodeURIComponent(ck.value)) : {};
  const header = (await page.locator('header').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const storeName = (header.match(/Entregue pela Loja - (.+?) para o CEP/) || [])[1] || null;
  return { browser, ctx, page, seller: reg.seller || null, postalCode: reg.postalCode || null, storeName };
}

function sizeFromName(name) {
  const m = [...name.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|lt|un|und|unid|m|cm|mts)\b/gi)];
  if (!m.length) return null;
  const x = m[m.length - 1];
  return `${x[1]}${x[2].toLowerCase()}`;
}

function toRecord(node, scope, collectedAt, fromPage) {
  const offers = (node.offers?.offers || []).filter((o) => typeof o.price === 'number' && o.price > 0);
  if (!node.name || !offers.length) return null;
  offers.sort((a, b) => (a.minQuantity || 1) - (b.minQuantity || 1));
  const o = offers[0];
  const tiers = offers.slice(1).filter((t) => t.price < o.price);
  const crumbs = (node.breadcrumbList?.itemListElement || []).filter((c) => c.position < (node.breadcrumbList.itemListElement.length)).map((c) => c.name);
  const slugDept = ((node.breadcrumbList?.itemListElement || [])[0]?.item || '').replace(/\//g, '');
  const notes = [];
  if ((o.minQuantity || 1) > 1) notes.push(`preço válido a partir de ${o.minQuantity} un`);
  for (const t of tiers) notes.push(`R$ ${t.price.toFixed(2).replace('.', ',')} a partir de ${t.minQuantity} un`);
  if (fromPage === 'catalogo') notes.push('listado em Super Ofertas');
  notes.push('o site não informa data de validade; preço vigente no momento da coleta');
  return {
    market: MARKET,
    externalId: String(node.sku || node.id),
    name: node.name.trim(),
    brand: node.brand?.brandName || node.brand?.name || null,
    size: sizeFromName(node.name),
    price: o.price,
    listPrice: o.listPrice && o.listPrice > o.price ? o.listPrice : null,
    unitPrice: null,
    category: DEPT_CATEGORY[slugDept] || 'outros',
    categoryRaw: crumbs.join(' > ') || null,
    imageUrl: node.image?.[0]?.url || null,
    productUrl: `${BASE}/${node.slug}/p`,
    validFrom: null,
    validUntil: null,
    validityNote: notes.join('; '),
    storeScope: scope,
    collectedAt,
  };
}

async function collectPath(page, path, scope, collectedAt, store, fromPage) {
  const firstResp = page.waitForResponse(
    (r) => { const u = decodeURIComponent(r.url()); return u.includes('ProductsQuery') && u.includes('"after":"0"') && !u.includes('sku.id') && u.includes('atacadaobr') && !u.includes('"channel","value":""'); },
    { timeout: 40000 },
  ).catch(() => null);
  requests++;
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const fr = await firstResp;
  if (!fr) return { path, total: 0, got: 0, note: 'sem resposta de produtos' };
  const url0 = new URL(fr.url());
  const vars = JSON.parse(url0.searchParams.get('variables'));
  vars.first = 40;
  let total = null, got = 0, note = '';
  const limit = (sort, maxItems) => runPass(sort, maxItems);
  const first = await limit('name_asc', Infinity);
  if (first.stop) return { path, total, got, note: first.stop };
  // a API recusa after >= 2000; o resto da lista é lido em ordem inversa
  if (total !== null && got < total && first.capped) {
    const missing = total - got;
    const second = await limit('name_desc', missing + 120);
    if (second.stop) note = second.stop;
    else note = `lista acima de 2000: final lido em ordem inversa (${missing} itens esperados fora da 1ª leitura)`;
  }
  return { path, total, got, note };

  async function runPass(sort, maxItems) {
  vars.sort = sort;
  let after = 0;
  for (;;) {
    if (requests >= MAX_REQUESTS) return { stop: 'teto de requisições atingido' };
    if (after >= maxItems) break;
    vars.after = String(after);
    const u = `${BASE}/api/graphql?operationName=ProductsQuery&variables=${encodeURIComponent(JSON.stringify(vars))}`;
    await sleep(PAUSE_MS);
    requests++;
    const res = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: 'include' });
      const t = await r.text();
      return { status: r.status, text: t.slice(0, 5_000_000) };
    }, u);
    if (res.status === 403 || res.status === 429 || /captcha|challenge/i.test(res.text.slice(0, 500))) {
      blocked = `HTTP ${res.status} em ${path} (after=${after})`;
      return { stop: 'BLOQUEIO: ' + blocked };
    }
    if (res.status !== 200) return { stop: `HTTP ${res.status}` };
    const j = JSON.parse(res.text);
    const prods = j.data?.search?.products;
    if (!prods) return after >= 2000 ? { capped: true } : { stop: 'resposta sem products' };
    total = prods.pageInfo?.totalCount ?? total;
    const edges = prods.edges || [];
    if (!edges.length) break;
    for (const e of edges) {
      const rec = toRecord(e.node, scope, collectedAt, fromPage);
      if (!rec) continue;
      const prev = store.get(rec.externalId);
      if (!prev) store.set(rec.externalId, rec);
      else if (fromPage === 'catalogo') prev.validityNote = prev.validityNote.includes('Super Ofertas') ? prev.validityNote : 'listado em Super Ofertas; ' + prev.validityNote;
    }
    got += edges.length;
    after += edges.length;
    if (total !== null && after >= total) break;
  }
  return {};
  }
}

async function main() {
  const t0 = Date.now();
  const collectedAt = new Date().toISOString();
  const s = await openSession();
  const scope = `Atacadão ${s.storeName || s.seller} (vendedor ${s.seller}), entrega no CEP ${s.postalCode}, definido pela seleção de endereço do site (CEP ${CEP}, número 1)`;
  console.log('Sessão:', scope);
  const store = new Map();
  const log = [];
  // Super Ofertas primeiro (marca os itens), depois os departamentos
  for (const [path, label] of EXTRA_PAGES) {
    const r = await collectPath(s.page, path, scope, collectedAt, store, 'catalogo');
    log.push({ ...r, label });
    console.log(label, r);
    if (blocked) break;
  }
  for (const [path] of DEPARTMENTS) {
    if (blocked) break;
    const r = await collectPath(s.page, path, scope, collectedAt, store, path);
    log.push(r);
    console.log(path, r, 'acumulado', store.size);
  }
  await s.browser.close();
  const rows = [...store.values()];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_DIR + 'atacadao.json', JSON.stringify(rows, null, 1));
  fs.writeFileSync(OUT_DIR + 'atacadao.meta.json', JSON.stringify({ scope, log, requests, blocked, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
  console.log('TOTAL', rows.length, 'requisições', requests, blocked ? 'BLOQUEADO: ' + blocked : '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
