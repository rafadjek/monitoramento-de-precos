// Extra Mercado (GPA). As lojas físicas de Mauá e Ribeirão Pires não vendem pelo site. A loja online mais
// próxima que entrega na região é a de Ribeirão Pires: loja 5675, storeId 1643, R. João Domingues de
// Oliveira, 194. Ela só faz ENTREGA (taxa de R$ 19,90), sem retirada; Mauá não tem entrega. Tem preço próprio
// (só parte dos preços coincide com a antiga loja 1162 de São Bernardo) e cerca de 8,7 mil itens.
// Coleta por categoria: POST api.vendas.gpa.digital/ex/search/category-page, 100 itens por página, um
// departamento por vez (a busca por termos perdia ~20% do catálogo). A API não traz o EAN; ele vem das
// páginas dos produtos (extra-ean.mjs).
// Saída: server/data/extraido/extra.json
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fillEans } from './extra-ean.mjs';

const OUT = fileURLToPath(new URL('../data/extraido/extra.json', import.meta.url));
const API = 'https://api.vendas.gpa.digital/ex/search/category-page';
const SITE = 'https://www.extramercado.com.br';
const STORE_ID = 1643;
const MARKET = 'Extra';
const SCOPE = 'Loja online de Ribeirão Pires (loja 5675, R. João Domingues de Oliveira, 194): só entrega, R$ 19,90; sem retirada. As lojas de Mauá e Ribeirão Pires não vendem pelo site';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PER_PAGE = 100;
const MAX_PAGES = 120; // freio por departamento (o maior tem ~45 páginas)
const PAUSE_MS = 1000;
const MAX_REQ = 400;
// departamento do site -> nome para a categoria fina (server/category.mjs lê categoryRaw) e categoria grossa
const DEPTS = [
  ['alimentos', 'Alimentos', 'alimenticios'], ['bebidas', 'Bebidas', 'alimenticios'],
  ['limpeza', 'Limpeza', 'limpeza'], ['descartaveis', 'Descartáveis', 'limpeza'],
  ['bebe-e-crianca', 'Bebê e criança', 'alimenticios'], ['perfumaria', 'Perfumaria', 'higiene'],
  ['petshop', 'Petshop', 'alimenticios'], ['bazar', 'Bazar', 'alimenticios'], ['textil', 'Têxtil', 'alimenticios'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
async function fetchPage(multiCategory, page) {
  if (++requests > MAX_REQ) throw new Error(`teto de ${MAX_REQ} requisições`);
  await sleep(PAUSE_MS);
  const body = { partner: 'linx', page, resultsPerPage: PER_PAGE, multiCategory, sortBy: 'relevance', department: 'ecom', storeId: STORE_ID, customerPlus: true, filters: [] };
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(API, {
      method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: SITE + '/' },
    }).catch((e) => ({ ok: false, status: 0, e }));
    if (r.ok) return r.json();
    if (r.status === 404) return { products: [], totalPages: 0 }; // departamento sem itens
    if (r.status === 403 || r.status === 429) throw new Error(`bloqueio ${r.status}`);
    await sleep(3000 * t);
  }
  throw new Error(`falha repetida em ${multiCategory} página ${page}`); // melhor não gravar do que gravar catálogo cortado
}

// Menor preço sem cartão da loja: oferta, app (Clube Extra, só CPF), "leve X pague Y", desconto na Nª unidade
// e desconto percentual simples ("10% off", promotionPercentOffOnUnity 1, sem quantidade mínima). Nesse último
// caso o site manda o preço final já pronto em promotion.unitPrice (ex.: R$ 7,69 -> R$ 6,92 com 10%); ele só vale
// se for menor que o preço mostrado, senão o preço mostrado já traz o desconto.
function priceOf(p) {
  const shown = Number(p.price);
  const regular = Number(p.priceFrom) > shown ? Number(p.priceFrom) : null;
  let price = shown, condition = null, ends = null;
  for (const pr of p.productPromotions || []) {
    ends = pr.endDate ? new Date(pr.endDate + (pr.endDate.endsWith('Z') ? '' : '-03:00')).toISOString() : ends;
    // cartão da loja não conta; o selo FIC é o "10% pagando com o Cartão Extra" e a API nem sempre preenche paymentFormName nele
    if ((pr.paymentFormName && /cart/i.test(pr.paymentFormName)) || pr.promotionSealColor === 'FIC') continue;
    const buy = Number(pr.promotionQuantityBuy), pay = Number(pr.promotionQuantityPayFor);
    const nth = Number(pr.promotionPercentOffOnUnity), off = Number(pr.promotionPercentOff);
    if (buy > 1 && pay > 0 && pay < buy) {
      const v = (shown * pay) / buy;
      if (v < price) { price = v; condition = `cada levando ${buy} (leve ${buy} pague ${pay})`; }
    } else if (nth > 1 && off > 0) {
      const v = (shown * (nth - 1 + (1 - off / 100))) / nth;
      if (v < price) { price = v; condition = `cada levando ${nth} (${off}% off na ${nth}ª)`; }
    } else if (!(buy > 1) && off > 0 && off < 100) {
      // percentual simples: usa o preço pronto do site (unitPrice). Sem ele, só aplica o percentual que o próprio
      // site informa se o preço mostrado não vier com "de" riscado (aí o desconto já está no preço mostrado)
      const u = Number(pr.unitPrice);
      const v = u > 0 ? u : regular ? shown : (shown * (100 - off)) / 100;
      if (v < price) { price = v; condition = pr.appExclusive ? 'no app (Clube Extra, só CPF)' : null; }
    }
    if (pr.appExclusive && !condition) condition = 'no app (Clube Extra, só CPF)';
  }
  const list = regular ?? (price < shown ? shown : null);
  return { price: Math.round(price * 100) / 100, listPrice: list, condition, validUntil: list ? ends : null };
}

// categoria grossa: o departamento manda em limpeza/perfumaria; nas fraldas/higiene do "bebê e criança" e em
// itens de limpeza soltos em outros departamentos vale o nome
const HIG = /higi[eê]nico|sabonete|shampoo|condicionador|dental|enxaguante|desodorante|absorvente|protetor solar|fralda|len[cç]o umedecido|algod|hastes|barbear|hidratante/i;
const LIMP = /sab[aã]o em p[óo]|sab[aã]o l[ií]quido|amaciante|alvejante|sanit[aá]ria|desinfet|detergente|lava[- ]?(roupas|lou[cç]as)|esponja|multiuso|saco de lixo|papel toalha|inseticida/i;
function categoryOf(dept, name) {
  if (dept[2] !== 'alimenticios') return dept[2];
  if (dept[0] === 'bebe-e-crianca' || dept[0] === 'bazar') return HIG.test(name) ? 'higiene' : LIMP.test(name) ? 'limpeza' : 'alimenticios';
  return LIMP.test(name) && dept[0] !== 'alimentos' ? 'limpeza' : 'alimenticios';
}

const collectedAt = new Date().toISOString();
const rows = new Map();
const totais = {};
for (const dept of DEPTS) {
  let page = 1, pages = 1, antes = rows.size;
  do {
    const j = await fetchPage(dept[0], page);
    pages = Math.min(j.totalPages || 0, MAX_PAGES);
    for (const p of j.products || []) {
      if (!p.name || !(p.price > 0) || p.stock === false || rows.has(String(p.id))) continue;
      const pr = priceOf(p);
      const name = p.name.replace(/\s+/g, ' ').trim();
      rows.set(String(p.id), {
        market: MARKET,
        externalId: String(p.id),
        name,
        brand: p.brand || null,
        ean: null,
        size: null,
        price: pr.price,
        listPrice: pr.listPrice,
        unitPrice: p.variableWeight ? 'preço por kg' : null,
        category: categoryOf(dept, name),
        categoryRaw: dept[1],
        imageUrl: p.productImages?.[0] ? 'https://static.extramercado.com.br' + p.productImages[0] : null,
        productUrl: p.urlDetails || null,
        validFrom: null,
        validUntil: pr.validUntil,
        validityNote: pr.validUntil ? 'oferta com data de fim informada pelo site' : 'preço vigente no momento da coleta',
        condition: pr.condition,
        storeScope: SCOPE,
        collectedAt,
      });
    }
    page++;
  } while (page <= pages);
  totais[dept[0]] = rows.size - antes;
  console.log(`  ... ${dept[0]}: ${totais[dept[0]]} novos, ${rows.size} no total, ${requests} requisições`);
}
const out = [...rows.values()];
if (out.length < 500) { console.error(`extra: só ${out.length} produtos; não grava`); process.exit(1); }
await fillEans(out);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`extra: ${out.length} produtos (${DEPTS.length} departamentos), ${out.filter((o) => o.listPrice).length} em oferta, ${requests} requisições`);
