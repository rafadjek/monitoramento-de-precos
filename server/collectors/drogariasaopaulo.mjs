// Drogaria São Paulo (drogariasaopaulo.com.br): loja VTEX, API pública sem login.
// Uso: node collectors/drogariasaopaulo.mjs (a partir de server/). Grava data/extraido/drogariasaopaulo.json e
// drogariasaopaulo.meta.json.
//
// Como funciona:
//  1. Catálogo (/api/catalog_system/pub/products/search): no máximo 50 itens por chamada e _from até 2500. Para passar
//     desse limite o coletor fatia o catálogo por faixa de preço (fq=P:[a TO b]), dividindo a faixa ao meio quando ela
//     ainda tem mais de 2500 itens. Começa em R$ 0,01: item de preço 0 no catálogo é cadastro sem venda (~40 mil).
//  2. Disponibilidade e preço vêm da simulação de pedido (orderForms/simulation), nunca do catálogo. Simula-se o vendedor
//     "1" (site) com o CEP 09400110 (Ribeirão Pires): a resposta traz, por item, as opções de retirada (pickup-in-point)
//     das lojas que têm o item. Item só entra se alguma loja de Mauá ou Ribeirão Pires aparecer entre elas.
//     Verificado em 19/11/2026 (amostra de 200 itens): o CEP de Mauá (09310000) acrescentava só 2 itens e perdia 43.
//     O preço é igual entre as lojas. Várias unidades por chamada (100).
//  3. Não usa o campo "Valor Promocional" do catálogo. rx e genérico saem só dos campos da ficha.
//
// Regras do projeto: pausa de 1 s antes de cada requisição, sem login, sem burlar bloqueio (403/429 para a coleta).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const BASE = 'https://www.drogariasaopaulo.com.br';
const MARKET = 'Drogaria São Paulo';
const STORE_SCOPE = 'Drogaria São Paulo (preço do site, com retirada nas lojas de Mauá e Ribeirão Pires)';
const UA = 'Mozilla/5.0 (compatible; BateOfertasColetor/1.0)';
const CEP = process.env.DSP_CEP || '09400110';
const PAUSE_MS = 1000;
const SIM_BATCH = Number(process.env.DSP_SIM_BATCH) > 0 ? Number(process.env.DSP_SIM_BATCH) : 100;
// teto de tempo da coleta (o workflow de farmácias tem ~60 min); DSP_MAX_MIN sobrescreve (teste de medição)
const MAX_MIN = Number(process.env.DSP_MAX_MIN) > 0 ? Number(process.env.DSP_MAX_MIN) : 55;
// teste: para depois de N páginas de catálogo
const MAX_PAGES = Number(process.env.DSP_MAX_PAGES) > 0 ? Number(process.env.DSP_MAX_PAGES) : Infinity;
const OUT_NAME = process.env.DSP_OUT || 'drogariasaopaulo';
const LIMIT_FROM = 2500; // a API não entrega itens além de _from=2500 numa consulta

// pontos de retirada da região (id da simulação -> rótulo curto). O de Mauá Centro (drogariaspmaua_26) não tem
// rótulo fixo: usa o bairro que a própria simulação informa.
const LOCAL = {
  drogariaspmaua_26: null,
  drogariasaopaulobmaua_211: 'Mauá Barão de Mauá',
  drogariaspjardimzaira_629: 'Mauá Jardim Zaira',
  drogariasaopaulovassis_758: 'Mauá Vila Assis',
  drogariasaopauloribeiraopires_927: 'RP Centro',
  drogariaspfranciscomonteiro_2385: 'RP Francisco Monteiro',
};

// Departamentos que não interessam ao site (pets e serviços de balcão). O resto entra: comida, bebida, higiene e
// beleza vendidas em farmácia são onde há comparação com os mercados.
const SKIP_DEPT = new RegExp(process.env.DSP_SKIP || '^(produto pet|cartao presente|consulta online|furar orelha|aferir pressao|aplicacao de injetaveis|vacina|exame)$', 'i');

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const elapsedMin = () => (Date.now() - t0) / 60000;

let requests = 0;
const timing = { catalogMs: 0, simMs: 0, catalogReq: 0, simReq: 0 };
class Stop extends Error {}

async function http(path, init, kind) {
  for (let t = 0; t < 3; t++) {
    if (elapsedMin() > MAX_MIN) throw new Stop('teto de tempo atingido');
    await sleep(PAUSE_MS);
    requests++;
    const a = Date.now();
    let r;
    try {
      r = await fetch(`${BASE}${path}`, { ...init, headers: { 'user-agent': UA, ...(init?.headers || {}) } });
    } catch (e) {
      timing[kind + 'Ms'] += Date.now() - a;
      if (t === 2) throw new Error(`rede: ${e.message}`);
      await sleep(3000);
      continue;
    }
    const txt = await r.text();
    timing[kind + 'Ms'] += Date.now() - a;
    timing[kind + 'Req']++;
    if (r.status === 403 || r.status === 429) throw new Stop(`bloqueio HTTP ${r.status}`);
    if (r.status < 300) return { status: r.status, headers: r.headers, body: txt };
    if (r.status < 500) return { status: r.status, headers: r.headers, body: txt }; // 4xx: quem chama decide
    await sleep(3000 * (t + 1));
  }
  return { status: 500, headers: new Headers(), body: '' };
}

// ---------- catálogo ----------
const cents = (c) => (c / 100).toFixed(2);
async function catalog(loC, hiC, from) {
  const fq = `P:[${cents(loC)} TO ${cents(hiC)}]`;
  const r = await http(`/api/catalog_system/pub/products/search?fq=${encodeURIComponent(fq)}&_from=${from}&_to=${from + 49}`, undefined, 'catalog');
  if (r.status >= 300) {
    if (r.status === 400 || r.status === 404) return { total: 0, products: [] };
    throw new Error(`catálogo HTTP ${r.status} em ${fq} _from=${from}`);
  }
  const total = Number((r.headers.get('resources') || '').split('/')[1]) || 0;
  let products = [];
  try { products = JSON.parse(r.body); } catch { throw new Error(`catálogo com resposta inválida em ${fq}`); }
  return { total, products };
}

// Faixas de preço iniciais (em centavos); cada uma é dividida ao meio se passar do limite da API.
const EDGES = [1, 200, 400, 600, 800, 1000, 1200, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000, 10000, 12500, 15000, 20000, 30000, 50000, 10000000];
const stats = { leaves: 0, truncated: [], pages: 0 };

async function* walk(loC, hiC) {
  const first = await catalog(loC, hiC, 0);
  if (!first.total) return;
  if (first.total > LIMIT_FROM && hiC > loC) {
    const mid = Math.floor((loC + hiC) / 2);
    yield* walk(loC, mid);
    yield* walk(mid + 1, hiC);
    return;
  }
  stats.leaves++;
  if (first.total > LIMIT_FROM) stats.truncated.push({ preco: cents(loC), total: first.total });
  console.log(`faixa R$ ${cents(loC)} a ${cents(hiC)}: ${first.total} itens (${elapsedMin().toFixed(1)} min)`);
  yield first.products;
  for (let from = 50; from < first.total && from < LIMIT_FROM; from += 50) {
    const pg = await catalog(loC, hiC, from);
    if (!pg.products.length) break;
    yield pg.products;
  }
}

// ---------- simulação ----------
const labels = { ...LOCAL };
async function simulate(ids) {
  const r = await http('/api/checkout/pub/orderForms/simulation?sc=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: ids.map((id) => ({ id, quantity: 1, seller: '1' })), country: 'BRA', postalCode: CEP }),
  }, 'sim');
  if (r.status >= 300) return null;
  try { return JSON.parse(r.body); } catch { return null; }
}

// Devolve Map(itemId -> {price, listPrice, stores[], status}). Se a chamada falha (5xx), divide o lote ao meio.
async function simBatch(ids, out, fails) {
  const j = await simulate(ids);
  if (!j || !Array.isArray(j.items) || !Array.isArray(j.logisticsInfo)) {
    if (ids.length === 1) { fails.sim++; return; }
    const h = ids.length >> 1;
    await simBatch(ids.slice(0, h), out, fails);
    await simBatch(ids.slice(h), out, fails);
    return;
  }
  for (const pp of j.pickupPoints || []) {
    if (pp.id in LOCAL && !labels[pp.id]) labels[pp.id] = `${/Mau/.test(pp.address?.city) ? 'Mauá' : 'RP'} ${pp.address?.neighborhood || pp.friendlyName}`.trim();
  }
  ids.forEach((id, i) => {
    const it = j.items.find((x) => x.requestIndex === i);
    if (!it || String(it.id) !== String(id)) { out.set(id, { status: 'ausente' }); return; }
    const li = j.logisticsInfo.find((x) => x.itemIndex === i) ?? j.logisticsInfo[i];
    const stores = [...new Set((li?.slas || []).filter((s) => s.deliveryChannel === 'pickup-in-point' && s.pickupPointId in LOCAL).map((s) => s.pickupPointId))];
    out.set(id, { status: it.availability, price: it.price / 100, listPrice: it.listPrice / 100, stores });
  });
}

// ---------- linha ----------
const field = (p, k) => (Array.isArray(p[k]) ? p[k].join('; ') : p[k] ? String(p[k]) : '');
const FARMACIA = /medicament|remedio|vitamina|polivitam|suplemento|complemento alimentar|^teste|curativ|gaze|esparadrapo|termometro|inalador|aparelho de pressao|medidor|tiras|lancetador|seringa|agulha|soro fisiologico|oximetro|ortoped|cadeira de rodas|muleta|bengala|andador|colostomia|coletor|camisinha|lubrificante|agua oxigenada|abaixador|algodao|repelente|bolsa termica|bolsa de primeiros|acessorio para inalador|adesivo|compressa|meia|colar cervical|tala|joelheira|tornozeleira|faixa/;
const HIGIENE = /shampoo|condicionador|sabonete|desodorante|pasta de dente|creme dental|escova de dente|fio dental|enxaguante|absorvente|fralda|lenco|hastes|protetor solar|bronzeador|hidratante|creme|perfume|colonia|esmalte|tinta de cabelo|alisante|mascara|ampola capilar|dermocosmetico|barbeador|oleo|esfoliante|agua micelar|agua termal|gel de cabelo|modelador|depilador|acetona|removedor|sombra|aparador|chapinha|secador|escova secadora|alicate|lixa|base de unha|assadura|vaselina|papel higienico|lencos|chupeta|mamadeira|mordedor/;

function departmentOf(p) {
  return (p.categories?.[0] ?? '').replace(/^\/|\/$/g, '').split('/')[0] || '';
}

function rxOf(p) {
  // só da ficha: Prescrição Médica ("Com/Sem Retenção De Receita") e Classificação ("Tarja Vermelha/Preta", "Sem Tarja")
  const presc = strip(field(p, 'Prescrição Médica'));
  const classe = strip(field(p, 'Classificação'));
  if (/\bcom retencao/.test(presc)) return true;
  if (/tarja (vermelha|preta)/.test(classe)) return true;
  return false;
}

function genericOf(p) {
  return /\bgenerico/.test(strip(field(p, 'Tipo de Medicamento')));
}

function toRow(p, it, sim, collectedAt) {
  const dept = departmentOf(p);
  const rx = rxOf(p);
  const d = strip(dept);
  const category = rx || FARMACIA.test(d) ? 'farmacia' : HIGIENE.test(d) ? 'higiene' : 'outros';
  const nome = (p.items.length > 1 ? it.nameComplete : null) || p.productName;
  const sizeM = [...String(nome).matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l|un)\b/gi)].pop();
  const promo = sim.listPrice > sim.price;
  return {
    market: MARKET,
    segment: 'farmacia',
    externalId: String(it.itemId),
    name: nome,
    brand: p.brand || null,
    ean: it.ean ? String(it.ean).trim() : null,
    size: sizeM ? `${sizeM[1].replace(',', '.')}${sizeM[2].toLowerCase()}` : null,
    price: sim.price,
    listPrice: promo ? sim.listPrice : null,
    unitPrice: null,
    category,
    categoryRaw: (p.categories?.[0] ?? '').replace(/^\/|\/$/g, '').replace(/\//g, ' > ') || null,
    ...(rx ? { rx: true } : {}),
    ...(genericOf(p) ? { generic: true } : {}),
    stores: sim.stores.map((id) => labels[id] || id),
    imageUrl: it.images?.[0]?.imageUrl ?? null,
    productUrl: p.link ?? null,
    validFrom: null,
    validUntil: null,
    validityNote: 'o site não informa até quando o preço vale',
    condition: null,
    storeScope: STORE_SCOPE,
    collectedAt,
  };
}

// ---------- principal ----------
async function main() {
  const started = new Date();
  console.log(`CEP da simulação ${CEP}, lote ${SIM_BATCH}, teto ${MAX_MIN} min`);
  const rows = [];
  const seen = new Set();
  const byDept = {};
  const drop = { departamentoIgnorado: 0, repetido: 0, semNomeOuEan: 0, semRetiradaLocal: 0, simFalhou: 0, outros: {} };
  const fails = { sim: 0 };
  const fichas = { prescricao: {}, classificacao: {}, tipo: {} };
  let rawItems = 0, multiItem = 0, rxSemFicha = 0, medSemFicha = 0, simulados = 0;
  let stopped = null;
  let buf = []; // {p, it}
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

  async function flush() {
    if (!buf.length) return;
    const work = buf;
    buf = [];
    const out = new Map();
    await simBatch(work.map((w) => String(w.it.itemId)), out, fails);
    // "maxNumberOfSellersReached": a simulação desistiu por excesso de lojas no carrinho; repete em lotes pequenos
    const retry = work.filter((w) => out.get(String(w.it.itemId))?.status === 'maxNumberOfSellersReached');
    for (let k = 0; k < retry.length; k += 10) await simBatch(retry.slice(k, k + 10).map((w) => String(w.it.itemId)), out, fails);
    const collectedAt = new Date().toISOString();
    for (const { p, it } of work) {
      const s = out.get(String(it.itemId));
      const dept = departmentOf(p) || '(sem departamento)';
      byDept[dept] ??= { vistos: 0, mantidos: 0 };
      byDept[dept].vistos++;
      simulados++;
      if (!s) { drop.simFalhou++; continue; }
      if (s.status !== 'available') { bump(drop.outros, s.status); continue; }
      if (!(s.price > 0)) { bump(drop.outros, 'preco-invalido'); continue; }
      if (!s.stores.length) { drop.semRetiradaLocal++; continue; }
      const row = toRow(p, it, s, collectedAt);
      bump(fichas.prescricao, field(p, 'Prescrição Médica') || '(sem campo)');
      bump(fichas.classificacao, field(p, 'Classificação') || '(sem campo)');
      bump(fichas.tipo, field(p, 'Tipo de Medicamento') || '(sem campo)');
      if (dept === 'Medicamentos' && !field(p, 'Prescrição Médica') && !field(p, 'Classificação')) medSemFicha++;
      byDept[dept].mantidos++;
      rows.push(row);
    }
  }

  try {
    for (let i = 0; i < EDGES.length - 1; i++) {
      const hi = i === EDGES.length - 2 ? EDGES[i + 1] : EDGES[i + 1] - 1;
      for await (const products of walk(EDGES[i], hi)) await consume(products);
    }
    await flush();
  } catch (e) {
    stopped = e.message;
    console.warn('coleta interrompida:', stopped);
    if (!(e instanceof Stop)) console.warn(e.stack);
    try { await flush(); } catch (e2) { console.warn('último lote não simulado:', e2.message); }
  }

  async function consume(products) {
    stats.pages++;
    for (const p of products) {
      for (const it of p.items || []) {
        rawItems++;
        if (p.items.length > 1) multiItem++;
        const id = String(it.itemId);
        if (seen.has(id)) { drop.repetido++; continue; }
        seen.add(id);
        if (SKIP_DEPT.test(strip(departmentOf(p)))) { drop.departamentoIgnorado++; continue; }
        if (!p.productName) { drop.semNomeOuEan++; continue; }
        buf.push({ p, it });
        if (buf.length >= SIM_BATCH) await flush();
      }
    }
    if (stats.pages % 20 === 0) console.log(`  ${stats.pages} páginas, ${rawItems} itens vistos, ${rows.length} com retirada local, ${elapsedMin().toFixed(1)} min`);
    if (stats.pages >= MAX_PAGES) throw new Stop('limite de páginas (teste)');
  }

  const finishedAt = new Date().toISOString();
  if (!rows.length) { console.error('nenhum produto coletado; mantendo arquivos anteriores'); process.exit(1); }
  const byCat = rows.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {});
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = `${OUT_DIR}${OUT_NAME}.json.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows));
  fs.renameSync(tmp, `${OUT_DIR}${OUT_NAME}.json`);
  const meta = {
    startedAt: started.toISOString(), finishedAt, minutes: +elapsedMin().toFixed(1), requests,
    timing: { catalogoMin: +(timing.catalogMs / 60000).toFixed(1), simulacaoMin: +(timing.simMs / 60000).toFixed(1), chamadasCatalogo: timing.catalogReq, chamadasSimulacao: timing.simReq },
    cep: CEP, loteSimulacao: SIM_BATCH, itensVistosNoCatalogo: rawItems, produtosComMaisDeUmItem: multiItem, simulados,
    mantidos: rows.length, descartes: drop, faixasDePreco: stats.leaves, faixasTruncadas: stats.truncated,
    porCategoria: byCat, rx: rows.filter((r) => r.rx).length, generico: rows.filter((r) => r.generic).length,
    comEan: rows.filter((r) => r.ean).length, comImagem: rows.filter((r) => r.imageUrl).length,
    comPrecoDe: rows.filter((r) => r.listPrice).length, medicamentosSemFicha: medSemFicha,
    lojasEncontradas: Object.fromEntries(Object.entries(LOCAL).map(([id]) => [labels[id] || id, rows.filter((r) => r.stores.includes(labels[id] || id)).length])),
    fichas, porDepartamento: Object.fromEntries(Object.entries(byDept).sort((a, b) => b[1].vistos - a[1].vistos)),
    stopped, storeScope: STORE_SCOPE,
  };
  fs.writeFileSync(`${OUT_DIR}${OUT_NAME}.meta.json`, JSON.stringify(meta, null, 2));
  console.log(`${OUT_NAME}: ${rows.length} produtos`, JSON.stringify(byCat), `rx ${meta.rx}, EAN ${meta.comEan} (${requests} requisições, ${meta.minutes} min)`);
  if (stopped && !/limite de páginas/.test(stopped) && rows.length < 500) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
