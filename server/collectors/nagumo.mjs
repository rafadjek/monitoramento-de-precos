// Coletor do Nagumo (Salesforce Commerce). Lê o JSON de Search-UpdateGrid dentro de uma sessão
// de navegador com a loja 038-MAUA selecionada. Saída: server/data/extraido/nagumo.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.nagumo.com.br';
const SITE = BASE + '/on/demandware.store/Sites-Nagumo-Site/pt_BR/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OSUA = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
const OUT = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const MARKET = 'Nagumo';
const CEP = '09310000';
const STORE_ID = '38';
const PAUSE_MS = 1100; // intervalo mínimo entre o início de duas requisições, somando todos os trabalhadores
const WORKERS = 3;
const PAGE_SIZE = 100;
const MAX_REQUESTS = 700;

// ofertas-dia primeiro; higiene-e-perfumaria já contém "higiene", então higiene não entra à parte.
const SECTIONS = [
  'ofertas-dia', 'hortifruti', 'acougue', 'peixaria', 'padaria',
  'basicos-e-matinais', 'frios-e-laticinios', 'bebidas', 'limpeza', 'higiene-e-perfumaria',
];
const DEPT_CATEGORY = {
  hortifruti: 'alimenticios', acougue: 'alimenticios', peixaria: 'alimenticios', padaria: 'alimenticios',
  'basicos-e-matinais': 'alimenticios', 'frios-e-laticinios': 'alimenticios', bebidas: 'alimenticios',
  limpeza: 'limpeza', 'higiene-e-perfumaria': 'higiene', higiene: 'higiene',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let nextSlot = 0;
async function gate() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + PAUSE_MS;
  if (at > now) await sleep(at - now);
}
let browser, ctx, page;

async function openSession() {
  if (browser) await browser.close().catch(() => {});
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const major = browser.version().split('.')[0];
  const UA = `Mozilla/5.0 (${OSUA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  ctx = await browser.newContext({ locale: 'pt-BR', userAgent: UA, viewport: { width: 1366, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const sel = await page.evaluate(async ([s, id]) => {
    const r = await fetch(s + 'Stores-SelectStore?storeId=' + id + '&method=Retirada', { credentials: 'include' });
    return r.status;
  }, [SITE, STORE_ID]);
  if (sel !== 200) throw new Error('SelectStore falhou: HTTP ' + sel);
  const active = await page.evaluate(async (s) => {
    const j = await (await fetch(s + 'Stores-AvailableStores', { credentials: 'include' })).json();
    return j.stores.filter((x) => x.active).map((x) => x.storeName);
  }, SITE);
  if (!active.includes('038-MAUA')) throw new Error('Loja ativa inesperada: ' + active.join(','));
}

class Blocked extends Error {}

async function gridPage(cgid, start) {
  if (requests >= MAX_REQUESTS) throw new Error('Teto de ' + MAX_REQUESTS + ' requisições atingido');
  for (let attempt = 1; attempt <= 3; attempt++) {
    requests++;
    await gate();
    try {
      const res = await page.evaluate(async ([s, cgid, start, sz]) => {
        const r = await fetch(s + 'Search-UpdateGrid?cgid=' + cgid + '&start=' + start + '&sz=' + sz, { credentials: 'include' });
        const text = await r.text();
        return { status: r.status, text };
      }, [SITE, cgid, start, PAGE_SIZE]);
      if ([403, 429].includes(res.status) || /captcha|access denied|unusual traffic/i.test(res.text.slice(0, 3000))) {
        throw new Blocked(`${cgid} start=${start}: HTTP ${res.status} (bloqueio/captcha)`);
      }
      if (res.status >= 500) throw new Error('HTTP ' + res.status);
      const j = JSON.parse(res.text);
      return { count: j.productSearch.count, items: j.productsSearchResult || [] };
    } catch (e) {
      if (e instanceof Blocked) throw e;
      if (/Target (page, context or browser has been )?(closed|crashed)/i.test(e.message)) await openSession();
      if (attempt === 3) throw e;
      await sleep(3000 * attempt);
    }
  }
}

function saoPauloDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // YYYY-MM-DD
}

function sizeFromName(name) {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|lt|litros?|un|unid|unidades?|m|cm)\b/i);
  if (!m) return null;
  const unit = m[2].toLowerCase().replace(/^lt$|^litros?$/, 'L').replace(/^unid$|^unidades?$/, 'un');
  return `${m[1].replace(',', '.')}${unit === 'L' ? 'L' : unit}`;
}

function categoryFromUrl(url) {
  try {
    const segs = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean);
    if (segs[0] !== 'categoria') return { dept: null, raw: null };
    const path = segs.slice(1, -1); // sem o slug do produto
    const rest = path[0] === 'departamentos' ? path.slice(1) : path;
    return { dept: rest[0] || null, raw: rest.join(' > ') || null };
  } catch { return { dept: null, raw: null }; }
}

function normalize(p, ctxInfo) {
  const price = p.price && p.price.sales && Number(p.price.sales.value);
  const name = (p.productName || '').replace(/\s+/g, ' ').trim();
  if (!name || !(price > 0)) return null;
  // esgotado na loja escolhida não entra
  if (p.available === false || p.readyToOrder === false || p.availability?.available === false) return null;
  const listV = p.price.list && Number(p.price.list.value);
  const productUrl = p.productShowFullUrl;
  const { dept, raw } = categoryFromUrl(productUrl);
  const img = p.images && p.images.large && p.images.large[0];
  const notes = ['O Nagumo informa que preços e ofertas valem no dia da consulta, só para compra online/aplicativo e sujeitos a estoque; sem data de fim de oferta no site'];
  if (ctxInfo.inOfertaDia) notes.push('listado em "Ofertas do dia"');
  if (p.isAccelerator === true) notes.push('item com selo "Meu Nagumo" no site (condição do selo não detalhada)');
  return {
    market: MARKET,
    externalId: String(p.id),
    name,
    brand: p.brand ? String(p.brand).trim() : null,
    size: sizeFromName(name),
    price: Math.round(price * 100) / 100,
    listPrice: listV && listV > price ? Math.round(listV * 100) / 100 : null,
    unitPrice: null,
    category: DEPT_CATEGORY[dept] || 'outros',
    categoryRaw: raw || ctxInfo.sectionFallback,
    imageUrl: img ? (img.src && img.src.disUrl) || img.absURL || null : null,
    productUrl,
    validFrom: ctxInfo.validFrom,
    validUntil: ctxInfo.validUntil,
    validityNote: notes.join('; '),
    storeScope: ctxInfo.storeScope,
    collectedAt: ctxInfo.collectedAt,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  await openSession();

  // Região: mecanismo público do site (CEP -> lojas que atendem).
  const lookup = await page.evaluate(async ([s, cep]) => {
    const r = await fetch(s + 'Instaleap-getStoresByCepAndNumber?cep=' + cep + '&number=100', { credentials: 'include' });
    return r.json();
  }, [SITE, CEP]);
  const lojas = (lookup.lojas || []).map((l) => l.id + ':' + l.name);
  console.log('CEP 09310-000 -> lojas do site:', lojas.join(', ') || '(nenhuma)');
  if (!lojas.some((l) => l.startsWith(STORE_ID + ':'))) throw new Error('Loja 038-MAUA não atende o CEP 09310-000 segundo o site');
  const rp = await page.evaluate(async ([s]) => (await (await fetch(s + 'Instaleap-getStoresByCepAndNumber?cep=09400000&number=100', { credentials: 'include' })).json()), [SITE]);
  console.log('CEP 09400-000 (Ribeirão Pires) -> lojas:', (rp.lojas || []).length, rp.errorMsg || '');

  const today = saoPauloDay();
  const info = {
    validFrom: `${today}T00:00:00-03:00`,
    validUntil: null,
    collectedAt: new Date().toISOString(),
    storeScope: 'Loja Nagumo 038-MAUA (Av. Barão de Mauá, 3232, Jd. Maringá, Mauá/SP), escolhida pelo CEP 09310-000 via Instaleap-getStoresByCepAndNumber e fixada com Stores-SelectStore (retirada). Para o CEP 09400-000 (Ribeirão Pires) o site informa que a opção não está disponível.',
    inOfertaDia: false,
    sectionFallback: null,
  };

  const byId = new Map();
  const ofertaIds = new Set();
  const stats = {};
  let aborted = null;

  const doSection = async (cgid) => {
      let start = 0;
      let total = null;
      let got = 0;
      while (true) {
        const { count, items } = await gridPage(cgid, start);
        if (total === null) total = count;
        if (!items.length) break;
        for (const p of items) {
          if (cgid === 'ofertas-dia') ofertaIds.add(String(p.id));
          const norm = normalize(p, { ...info, inOfertaDia: cgid === 'ofertas-dia' || ofertaIds.has(String(p.id)), sectionFallback: cgid });
          if (!norm) continue;
          if (!byId.has(norm.externalId)) byId.set(norm.externalId, norm);
          else if (ofertaIds.has(norm.externalId) && !/Ofertas do dia/.test(byId.get(norm.externalId).validityNote)) {
            byId.get(norm.externalId).validityNote += '; listado em "Ofertas do dia"';
          }
        }
        got += items.length;
        start += PAGE_SIZE;
        if (start >= total + PAGE_SIZE) break;
        if (requests % 25 === 0) console.log(`  ... ${requests} requisições, ${byId.size} produtos únicos`);
      }
      stats[cgid] = { siteCount: total, lidos: got };
      console.log(`${cgid}: site informa ${total}, lidos ${got}, únicos acumulados ${byId.size}`);
  };

  try {
    // "Ofertas do dia" primeiro e sozinha: os demais departamentos usam esses ids para marcar o selo.
    await doSection(SECTIONS[0]);
    const queue = SECTIONS.slice(1);
    await Promise.all(Array.from({ length: WORKERS }, async () => {
      while (queue.length && !aborted) {
        const cgid = queue.shift();
        try { await doSection(cgid); } catch (e) { aborted = aborted || e.message; console.error('ABORTADO em', cgid + ':', e.message); }
      }
    }));
  } catch (e) {
    aborted = e.message;
    console.error('ABORTADO:', aborted);
  }

  const rows = [...byId.values()];
  // Coleta interrompida e pequena não substitui uma anterior melhor.
  const prev = (() => { try { return JSON.parse(fs.readFileSync(OUT + 'nagumo.json', 'utf8')).length; } catch { return 0; } })();
  if (!aborted || (rows.length > 0 && rows.length >= prev * 0.5)) {
    fs.writeFileSync(OUT + 'nagumo.json', JSON.stringify(rows, null, 2));
  } else {
    console.error(`Resultado parcial (${rows.length}) menor que o anterior (${prev}); mantendo o arquivo existente.`);
  }
  fs.writeFileSync(OUT + 'nagumo.meta.json', JSON.stringify({ stats, requests, aborted, seconds: Math.round((Date.now() - t0) / 1000), ofertaDia: ofertaIds.size, produtos: rows.length }, null, 2));
  console.log(`\nOK ${rows.length} produtos em ${requests} requisições, ${Math.round((Date.now() - t0) / 1000)}s${aborted ? ' (INCOMPLETO: ' + aborted + ')' : ''}`);
  await browser.close();
  process.exit(aborted ? 2 : 0);
}

main().catch(async (e) => { console.error('ERRO:', e.message); if (browser) await browser.close().catch(() => {}); process.exit(1); });
