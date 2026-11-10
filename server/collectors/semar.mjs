// Semar Supermercados (plataforma OSuper), loja 06 Mauá (storeId 1705).
// O site busca os produtos em sense.osuper.com.br/336/<loja>/v2/search, JSON aberto, 20 por página.
// A Cloudflare dessa API só atende navegador, então a busca roda de dentro da página do site (como o Nagumo).
// A busca para em 10.000 resultados: percorre departamento por departamento (todos têm menos que isso).
// Saída: server/data/extraido/semar.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/semar.json', import.meta.url));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = 'https://www.semarentrega.com.br';
const STORE = '1705';
const STORE_SLUG = 'loja-06-maua';
const API = `https://sense.osuper.com.br/336/${STORE}/v2/search`;
const PAGE = 20; // a API recusa mais que 20
const PAUSE_MS = 1100;
const MAX_REQ = 1500;
const MARKET = 'Semar';
const SCOPE = 'Loja Semar 06 Mauá (preços da loja no site semarentrega.com.br)';
const CATEGORY = [
  [/higiene|beleza|perfum|farm/i, 'higiene'],
  [/limpeza/i, 'limpeza'],
  [/mercearia|bebida|latic|frios|carne|a[cç]ougue|hortifr|padaria|congelad|matinal|doce|biscoit|peix|adega|cerveja|vinho/i, 'alimenticios'],
];
const categoryOf = (cat) => (CATEGORY.find(([re]) => re.test(cat || '')) || [null, 'outros'])[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ locale: 'pt-BR', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.goto(`${SITE}/${STORE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

let requests = 0;
async function search(params) {
  if (++requests > MAX_REQ) throw new Error(`teto de ${MAX_REQ} requisições`);
  await sleep(PAUSE_MS);
  for (let t = 1; t <= 3; t++) {
    const r = await page.evaluate(async (u) => {
      const res = await fetch(u);
      const text = await res.text();
      return { status: res.status, text };
    }, `${API}?brands=&tags=&sortField=_score&sortOrder=desc&size=${PAGE}&${params}`).catch((e) => ({ status: 0, text: e.message }));
    if (r.status === 200) return JSON.parse(r.text);
    if (r.status === 403 || r.status === 429) throw new Error(`bloqueio ${r.status}`);
    await sleep(3000 * t);
  }
  throw new Error('falhou 3 vezes: ' + params);
}

// Menor preço sem cartão da loja: promoção da loja, clube por CPF (persona) e pix contam.
function priceOf(h) {
  const p = h.pricing || {};
  const regular = Number(p.price);
  let price = p.promotion && p.promotionalPrice > 0 ? Number(p.promotionalPrice) : regular;
  let condition = null;
  const now = Date.now();
  const live = (x) => x && x.active !== false && (!x.startDate || Date.parse(x.startDate) <= now) && (!x.endDate || Date.parse(x.endDate) >= now);
  for (const pp of [].concat(h.personaPromotions || [])) {
    if (!live(pp) || !(pp.promotionPrice > 0)) continue;
    const min = Number(pp.minQuantity) || 1;
    if (pp.promotionPrice < price) {
      price = Number(pp.promotionPrice);
      condition = min > 1 ? `no clube Semar (CPF), levando ${min}` : 'no clube Semar (CPF)';
    }
  }
  for (const pp of [].concat(h.paymentPromotions || [])) {
    const v = Number(pp.promotionPrice ?? pp.price);
    if (live(pp) && v > 0 && v < price) { price = v; condition = `no ${String(pp.paymentMethod || pp.name || 'pix').toLowerCase()}`; }
  }
  for (const pp of [].concat(h.promotions || [])) {
    const v = Number(pp.promotionPrice);
    const min = Number(pp.minQuantity) || 1;
    if (live(pp) && v > 0 && v < price) { price = v; condition = min > 1 ? `cada levando ${min} ou mais` : null; }
  }
  const listPrice = regular > price ? regular : null;
  const ends = [].concat(h.personaPromotions || [], h.promotions || []).filter(live).map((x) => x.endDate).filter(Boolean).sort()[0] || null;
  return { price: Math.round(price * 100) / 100, listPrice, condition, validUntil: listPrice ? ends : null };
}

const collectedAt = new Date().toISOString();
const rows = new Map();
const first = await search('categories=&from=0&search=');
const depts = (first.extraData?.categories || []).map((c) => c.key).filter((k) => !k.includes(' > ') && !/Campanhas/i.test(k));
console.log('departamentos:', depts.map((d) => d.split(':')[1]).join(', '));
for (const dept of depts) {
  let from = 0, total = 0, got = 0;
  do {
    const j = await search(`categories=${encodeURIComponent(dept)}&from=${from}&search=`);
    total = Math.min(j.total ?? 0, 10000);
    for (const h of j.hits || []) {
      if (h.type && h.type !== 'PRODUCT') continue;
      const pr = priceOf(h);
      if (!h.name || !(pr.price > 0) || h.quantity?.inStock === 0) continue;
      const cat = (h.categories || []).filter((c) => c.startsWith(`store${STORE}:`)).map((c) => c.split(':')[1]).sort((a, b) => b.length - a.length)[0] || dept.split(':')[1];
      rows.set(String(h.id), {
        market: MARKET,
        externalId: String(h.id),
        name: h.name.replace(/\s+/g, ' ').trim(),
        brand: null, // o campo de marca da API vem sempre "Semar"
        ean: null,
        size: null,
        price: pr.price,
        listPrice: pr.listPrice,
        unitPrice: h.saleUnit && h.saleUnit !== 'UN' ? `preço por ${h.saleUnit.toLowerCase()}` : null,
        category: categoryOf(cat),
        categoryRaw: cat,
        imageUrl: h.image || null,
        productUrl: `${SITE}/${STORE_SLUG}/produto/${h.slug}`,
        validFrom: null,
        validUntil: pr.validUntil,
        validityNote: pr.validUntil ? 'oferta com data de fim informada pelo site' : 'preço vigente no momento da coleta',
        condition: pr.condition,
        storeScope: SCOPE,
        collectedAt,
      });
    }
    got += (j.hits || []).length;
    from += PAGE;
    if (!j.hasNext) break;
  } while (from < total);
  console.log(`${dept.split(':')[1]}: ${got} lidos (site informa ${total}); únicos ${rows.size}; requisições ${requests}`);
}
await browser.close();
const out = [...rows.values()];
if (out.length < 500) { console.error(`semar: só ${out.length} produtos; não grava`); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`semar: ${out.length} produtos, ${out.filter((o) => o.listPrice).length} em oferta, ${requests} requisições`);
