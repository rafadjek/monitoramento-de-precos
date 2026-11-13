// Extra Mercado (GPA). As lojas de Mauá e Ribeirão Pires não vendem pelo site; a loja online mais
// próxima é a 1867 Demarchi, em São Bernardo do Campo (storeId 1162, 12,6 km de Mauá), achada pela
// própria API de retirada do site (delivery-v2/ecom/driveThru com a latitude/longitude de Mauá).
// A busca (POST api.vendas.gpa.digital/ex/search/search) não aceita termo vazio e devolve 21 por página,
// então o coletor busca uma lista de itens comuns de mercado e junta tudo sem repetir.
// Saída: server/data/extraido/extra.json
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fillEans } from './extra-ean.mjs';

const OUT = fileURLToPath(new URL('../data/extraido/extra.json', import.meta.url));
const API = 'https://api.vendas.gpa.digital/ex/search/search';
const SITE = 'https://www.extramercado.com.br';
const STORE_ID = 1162;
const MARKET = 'Extra';
const SCOPE = 'Loja online 1867 Demarchi, São Bernardo do Campo (as lojas de Mauá e Ribeirão Pires não vendem pelo site)';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PER_PAGE = 21;
const MAX_PAGES = 12;
const PAUSE_MS = 1000;
const MAX_REQ = 2500;
const TERMS = `arroz, feijão, macarrão, espaguete, farinha de trigo, farinha de mandioca, açúcar, sal, óleo, azeite, vinagre, café, filtro de café,
achocolatado, leite, leite condensado, creme de leite, manteiga, margarina, requeijão, queijo, presunto, mortadela, salame, iogurte,
bebida láctea, ovos, pão, bisnaguinha, torrada, biscoito, bolacha, cookies, wafer, bolo, chocolate, bombom, bala, chiclete, pipoca,
salgadinho, batata palha, amendoim, castanha, granola, aveia, cereal, geleia, mel, doce de leite, gelatina, pudim, mistura para bolo,
fermento, leite em pó, fórmula infantil, papinha, molho de tomate, extrato de tomate, ketchup, maionese, mostarda, tempero, caldo,
azeitona, palmito, milho, ervilha, atum, sardinha, salsicha, linguiça, bacon, hambúrguer, nuggets, empanado, frango, carne bovina,
carne moída, costela, peixe, tilápia, camarão, lasanha, pizza, pão de queijo, batata congelada, sorvete, polpa de fruta, refrigerante,
coca-cola, guaraná, suco, néctar, água mineral, água de coco, chá, energético, isotônico, cerveja, vinho, espumante, vodka, whisky,
cachaça, gin, licor, sabão em pó, sabão líquido, lava-roupas, amaciante, alvejante, água sanitária, desinfetante, detergente,
lava-louças, esponja, limpador, multiuso, limpa vidros, cera, saco de lixo, papel toalha, guardanapo, papel alumínio, filme plástico,
inseticida, repelente, papel higiênico, sabonete, sabonete líquido, shampoo, condicionador, creme para cabelo, creme dental,
escova dental, fio dental, enxaguante bucal, desodorante, absorvente, protetor diário, fralda, lenço umedecido, algodão, hastes,
aparelho de barbear, protetor solar, hidratante, ração cachorro, ração gato, areia sanitária, pilha, lâmpada, vela, fósforo, carvão,
copo descartável, prato descartável`.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
async function search(terms, page) {
  if (++requests > MAX_REQ) throw new Error(`teto de ${MAX_REQ} requisições`);
  await sleep(PAUSE_MS);
  const body = { terms, page, sortBy: 'relevance', resultsPerPage: PER_PAGE, allowRedirect: true, storeId: STORE_ID, department: 'ecom', customerPlus: true, partner: 'fallback' };
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(API, {
      method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: SITE + '/' },
    }).catch((e) => ({ ok: false, status: 0, e }));
    if (r.ok) return r.json();
    if (r.status === 404) return { products: [], totalPages: 0 }; // termo sem resultado
    if (r.status === 403 || r.status === 429) throw new Error(`bloqueio ${r.status}`);
    await sleep(3000 * t);
  }
  return { products: [], totalPages: 0 };
}

// Menor preço sem cartão da loja: oferta, app (Clube Extra, só CPF), "leve X pague Y" e desconto na Nª unidade.
function priceOf(p) {
  const shown = Number(p.price);
  const regular = Number(p.priceFrom) > shown ? Number(p.priceFrom) : null;
  let price = shown, condition = null, ends = null;
  for (const pr of p.productPromotions || []) {
    ends = pr.endDate ? new Date(pr.endDate + (pr.endDate.endsWith('Z') ? '' : '-03:00')).toISOString() : ends;
    if (pr.paymentFormName && /cart/i.test(pr.paymentFormName)) continue; // cartão da loja não conta
    const buy = Number(pr.promotionQuantityBuy), pay = Number(pr.promotionQuantityPayFor);
    const nth = Number(pr.promotionPercentOffOnUnity), off = Number(pr.promotionPercentOff);
    if (buy > 1 && pay > 0 && pay < buy) {
      const v = (shown * pay) / buy;
      if (v < price) { price = v; condition = `cada levando ${buy} (leve ${buy} pague ${pay})`; }
    } else if (nth > 1 && off > 0) {
      const v = (shown * (nth - 1 + (1 - off / 100))) / nth;
      if (v < price) { price = v; condition = `cada levando ${nth} (${off}% off na ${nth}ª)`; }
    }
    if (pr.appExclusive && !condition) condition = 'no app (Clube Extra, só CPF)';
  }
  const list = regular ?? (price < shown ? shown : null);
  return { price: Math.round(price * 100) / 100, listPrice: list, condition, validUntil: list ? ends : null };
}

const CAT = [[/sab[aã]o|amaciante|alvejante|sanit[aá]ria|desinfet|detergente|lava|esponja|limpa|multiuso|cera|lixo|inseticida|papel toalha|guardanapo/i, 'limpeza'],
  [/higi[eê]nico|sabonete|shampoo|condicionador|creme de cabelo|dental|enxaguante|desodorante|absorvente|protetor|fralda|len[cç]o|algod|hastes|barbear|hidratante/i, 'higiene']];
const categoryOf = (term) => (CAT.find(([re]) => re.test(term)) || [null, 'alimenticios'])[1];

const collectedAt = new Date().toISOString();
const rows = new Map();
for (const term of TERMS) {
  let page = 1, pages = 1;
  do {
    const j = await search(term, page);
    pages = Math.min(j.totalPages || 0, MAX_PAGES);
    for (const p of j.products || []) {
      if (!p.name || !(p.price > 0) || p.stock === false || rows.has(String(p.id))) continue;
      const pr = priceOf(p);
      rows.set(String(p.id), {
        market: MARKET,
        externalId: String(p.id),
        name: p.name.replace(/\s+/g, ' ').trim(),
        brand: p.brand || null,
        ean: null,
        size: null,
        price: pr.price,
        listPrice: pr.listPrice,
        unitPrice: p.variableWeight ? 'preço por kg' : null,
        category: categoryOf(term),
        categoryRaw: `busca: ${term}`,
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
  if (rows.size && TERMS.indexOf(term) % 20 === 0) console.log(`  ... "${term}": ${rows.size} produtos, ${requests} requisições`);
}
const out = [...rows.values()];
if (out.length < 500) { console.error(`extra: só ${out.length} produtos; não grava`); process.exit(1); }
await fillEans(out);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`extra: ${out.length} produtos (${TERMS.length} termos), ${out.filter((o) => o.listPrice).length} em oferta, ${requests} requisições`);
