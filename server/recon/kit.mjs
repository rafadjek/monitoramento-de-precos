// Kit de varredura do Bate Ofertas: descobre as fontes de dados de um site em minutos.
// Uso (a partir da raiz do projeto): node server/recon/kit.mjs <comando> <alvo> [opções]
//
// Comandos:
//   api <url>           abre a página no Chrome (sem login), rola, aceita cookies e lista as chamadas JSON (fetch/XHR)
//   vtex <dominio>      detecta VTEX, conta produtos com estoque, lista sellers e pontos de retirada perto do CEP
//   sitemap <dominio>   robots.txt e sitemaps: URLs por tipo (produto, categoria) e departamentos de topo
//   instagram <perfil>  posts recentes e datas, sem login, pelo texto alternativo
//   folheto <url>       acha PDF/imagem de encarte na página; PDF: tem texto? quantas páginas?
//   tudo <url>          roda o que fizer sentido para o site e junta num único JSON
//
// Opções: --cep 09310000 (vtex)  --cidades "Mauá,Ribeirão Pires" (vtex)  --tempo 90 (segundos)
//         --max 3000 (tamanho máximo da saída em bytes)  --bonito (JSON indentado)
//
// Regras do projeto (AGENTS.md): pausa de 1 s ou mais entre requisições ao mesmo site, sem login, sem burlar bloqueio.
// Se o site responder 403/429, Cloudflare, Akamai ou desafio, o kit só relata (campo "bloqueado").
// Saída: sempre um JSON curto no stdout. Erro e tempo-limite também saem como JSON (nunca trava).
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UA_NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_HTTP = 'Mozilla/5.0 (compatible; BateOfertasKit/1.0)';
const PAUSA_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const [cmd, alvo] = argv;
const opt = {};
for (let i = 2; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  opt[k] = v;
}
const TEMPO_S = Number(opt.tempo) > 0 ? Number(opt.tempo) : cmd === 'tudo' ? 150 : 90;
const MAX_BYTES = Number(opt.max) > 0 ? Number(opt.max) : 3000;

// ---------- utilidades ----------
const browsers = [];
async function abrirNavegador(extra = {}) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  browsers.push(browser);
  const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1366, height: 900 }, userAgent: UA_NAV, ...extra });
  ctx.setDefaultTimeout(20000);
  return { browser, ctx };
}
async function fecharTudo() {
  await Promise.race([Promise.all(browsers.map((b) => b.close().catch(() => {}))), sleep(5000)]);
}
const urlDe = (s, base) => { try { return new URL(s, base); } catch { return null; } };
const comEsquema = (s) => (/^https?:\/\//i.test(s) ? s : 'https://' + s);
const origemDe = (s) => urlDe(comEsquema(s)).origin;
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RE_SEGREDO = /token|key|auth|sig|session|secret|passw|jwt|bearer|sid$|^sid|signature|hash|^x-|cookie|^_/i;
// Tira tokens e valores longos; mantém o nome dos parâmetros.
function limpaUrl(u, tam = 140) {
  const x = urlDe(u);
  if (!x) return String(u).slice(0, tam);
  const ps = [];
  for (const [k, v] of x.searchParams) {
    const segredo = RE_SEGREDO.test(k) || (v.length > 32 && /^[\w\-.%=+/]+$/.test(v));
    ps.push(`${k}=${segredo ? '…' : decodeURIComponent(v).slice(0, 40)}`);
  }
  const s = x.origin + x.pathname + (ps.length ? '?' + ps.join('&') : '');
  return s.length > tam ? s.slice(0, tam) + '…' : s;
}

async function http(url, init = {}, ms = 20000) {
  await sleep(PAUSA_MS);
  try {
    const r = await fetch(url, { ...init, headers: { 'user-agent': UA_HTTP, accept: '*/*', ...(init.headers || {}) }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    return r;
  } catch (e) {
    return { status: 0, ok: false, erro: String(e.cause?.code || e.message).slice(0, 80), headers: new Headers(), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  }
}
// Sinais de bloqueio (só relata, nunca contorna).
function sinalBloqueio(status, headers, texto = '') {
  const h = (n) => (headers?.get ? headers.get(n) || '' : '');
  if (status === 403 || status === 429) return `HTTP ${status}`;
  if (h('cf-mitigated')) return 'Cloudflare (desafio)';
  const t = texto.slice(0, 4000).toLowerCase();
  if (/just a moment|attention required|checking your browser|verify you are human|captcha|px-captcha/.test(t)) return 'desafio/captcha';
  if (/access denied|akamai|reference #\d/.test(t) && texto.length < 3000) return 'Akamai/WAF (acesso negado)';
  if (status === 503 && /cloudflare/.test(h('server').toLowerCase())) return 'Cloudflare 503';
  return null;
}

// Encolhe a saída até caber em N bytes: corta os maiores arrays e encurta textos.
function ajusta(obj, max) {
  const tam = (o) => Buffer.byteLength(JSON.stringify(o));
  let o = JSON.parse(JSON.stringify(obj));
  for (let guarda = 0; tam(o) > max && guarda < 200; guarda++) {
    let alvoArr = null, alvoLen = 0;
    const visita = (v) => {
      if (Array.isArray(v)) { if (v.length > 1 && Buffer.byteLength(JSON.stringify(v)) > alvoLen) { alvoArr = v; alvoLen = Buffer.byteLength(JSON.stringify(v)); } v.forEach(visita); }
      else if (v && typeof v === 'object') Object.values(v).forEach(visita);
    };
    visita(o);
    if (!alvoArr) break;
    const novo = Math.max(1, Math.floor(alvoArr.length * 0.7));
    const cortados = alvoArr.length - novo;
    alvoArr.length = novo;
    o._cortado = (o._cortado || 0) + cortados;
  }
  return o;
}

// ---------- detecção de catálogo em JSON ----------
const RE_NOME = /(^|_)(name|nome|title|titulo|productname|descricao|description|desc)$/i;
const RE_PRECO = /price|preco|preço|valor|amount|sellingprice|^pr$|^vl/i;
function achaPreco(v, prof = 0) {
  if (v == null || prof > 6) return undefined;
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (RE_PRECO.test(k) && ((typeof x === "number" && x > 0) || (typeof x === 'string' && /\d/.test(x) && x.length < 20))) return x;
      if (typeof x === 'object') { const r = achaPreco(x, prof + 1); if (r !== undefined) return r; }
    }
  }
  return undefined;
}
function achaNome(o) {
  for (const [k, x] of Object.entries(o)) if (RE_NOME.test(k) && typeof x === 'string' && x.length > 2) return x;
  return undefined;
}
function achaCatalogo(json) {
  let melhor = null;
  const anda = (v, caminho, prof) => {
    if (prof > 6 || v == null) return;
    if (Array.isArray(v)) {
      const objs = v.slice(0, 10).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (v.length >= 2 && objs.length >= Math.min(v.length, 10) * 0.6) {
        const comNome = objs.filter((x) => achaNome(x)).length;
        const comPreco = objs.filter((x) => achaPreco(x) !== undefined).length;
        if (comNome / objs.length >= 0.6 && comPreco / objs.length >= 0.5) {
          const score = v.length * (comPreco / objs.length);
          if (!melhor || score > melhor.score) {
            const p = objs[0];
            melhor = { score, caminho: caminho || '[]', itens: v.length, campos: Object.keys(p).slice(0, 9), ex: { nome: String(achaNome(p)).slice(0, 50), preco: achaPreco(p) } };
          }
        }
      }
      v.slice(0, 3).forEach((x) => anda(x, caminho + '[]', prof + 1));
    } else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) anda(x, caminho ? caminho + '.' + k : k, prof + 1);
    }
  };
  anda(json, '', 0);
  if (!melhor) return null;
  const { score, ...r } = melhor;
  // total declarado perto da raiz
  const RE_TOT = /^(total|totalitems|totalcount|count|totalresults|nbhits|numfound|totalprodutos|total_items|totalrecords|recordcount)$/i;
  const procTot = (v, prof) => {
    if (!v || typeof v !== 'object' || prof > 3 || Array.isArray(v)) return undefined;
    for (const [k, x] of Object.entries(v)) if (RE_TOT.test(k) && typeof x === 'number') return x;
    for (const x of Object.values(v)) { const t = procTot(x, prof + 1); if (t !== undefined) return t; }
  };
  const tot = procTot(json, 0);
  if (tot !== undefined) r.total = tot;
  return r;
}
const chavesTopo = (j) => {
  if (Array.isArray(j)) return ['[]', ...Object.keys(j[0] && typeof j[0] === 'object' ? j[0] : {}).slice(0, 7)];
  if (j && typeof j === 'object') return Object.keys(j).slice(0, 9);
  return [];
};

// analytics, consentimento, anúncios e afins: não interessam
const RUIDO = new RegExp('cookielaw|onetrust|google-analytics|googletagmanager|doubleclick|facebook[.]|fbcdn|hotjar|clarity[.]ms|segment[.]io|newrelic|sentry|datadog|criteo|tiktok|snapchat|taboola|hubspot|zendesk|intercom|cloudflareinsights|/_v/private/|analytics|/collect|/gtm|bat[.]bing|adsrvr|rdstation|pinterest|linkedin|twitter[.]com|youtube', 'i');
const PLATAFORMAS = [
  [/vtex|myvtex|vteximg|vtexassets|vtexcommerce/i, 'VTEX'], [/osuper/i, 'oSuper'], [/vipcommerce/i, 'VipCommerce'],
  [/demandware|dwstatic|\/on\/demandware/i, 'Salesforce Commerce'], [/shopify/i, 'Shopify'], [/magento|mage-cache/i, 'Magento'],
  [/linximpulse|linx\.com/i, 'Linx'], [/algolia/i, 'Algolia'], [/tiendeo/i, 'Tiendeo'], [/instaleap/i, 'Instaleap'],
  [/carrefour\.com\.br|apigw\.cloud/i, 'Carrefour API'], [/wake|fbits/i, 'Wake/Fbits'], [/tray\.com|traycdn/i, 'Tray'],
];

// ---------- ajudantes de página ----------
async function aceitaCookies(page) {
  try {
    return await page.evaluate(() => {
      const re = /^(aceitar( todos)?( os)?( cookies)?|aceito( todos)?|concordo( e continuar)?|entendi|ok,? entendi|permitir (todos|tudo)|accept( all)?( cookies)?|prosseguir|continuar|fechar e aceitar)$/i;
      const cand = [...document.querySelectorAll('button, a, [role=button], div[class*=cookie] *, div[id*=cookie] *, div[class*=consent] *')];
      for (const el of cand) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t && t.length < 40 && re.test(t) && el.offsetParent !== null) { el.click(); return true; }
      }
      return false;
    });
  } catch { return false; }
}
async function rola(page, vezes = 6) {
  for (let i = 0; i < vezes; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.max(500, window.innerHeight * 0.9))).catch(() => {});
    await sleep(700);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}
async function abrePagina(ctx, url, st) {
  const page = await ctx.newPage();
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch((e) => { st.erroPagina = String(e.message).split(String.fromCharCode(10))[0].slice(0, 100); return null; });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const status = resp ? resp.status() : null;
  let titulo = '';
  try { titulo = (await page.title()).slice(0, 80); } catch {}
  const corpo = await page.evaluate(() => (document.body?.innerText || '').slice(0, 1500)).catch(() => '');
  const motivo = sinalBloqueio(status, resp?.headers ? { get: (n) => resp.headers()[n.toLowerCase()] } : null, titulo + ' ' + corpo);
  return { page, status, titulo, bloqueio: motivo };
}

// ================= COMANDO: api =================
async function cmdApi(url, st) {
  url = comEsquema(url);
  const { ctx } = await abrirNavegador();
  const achados = new Map();
  const hosts = new Set();
  const plat = new Set();
  const pendentes = [];
  let cdn = null, ignorados = 0;
  ctx.on('request', (rq) => {
    const u = rq.url();
    for (const [re, nome] of PLATAFORMAS) if (re.test(u)) plat.add(nome);
    try { hosts.add(new URL(u).host); } catch {}
  });
  ctx.on('response', (res) => {
    pendentes.push((async () => {
      try {
        const rq = res.request();
        const tipo = rq.resourceType();
        if (tipo !== 'fetch' && tipo !== 'xhr') return;
        const ct = res.headers()['content-type'] || '';
        const u = res.url();
        if (RUIDO.test(u)) { ignorados++; return; }
        if (!/json|javascript|text\/plain|graphql/.test(ct) && !/graphql|\/api\/|search|catalog|product/i.test(u)) return;
        const buf = await res.body().catch(() => null);
        if (!buf || buf.length > 8_000_000 || buf.length < 2) return;
        let json;
        try { json = JSON.parse(buf.toString('utf8')); } catch { return; }
        const metodo = rq.method();
        let op = null, corpoChaves = null;
        if (metodo !== 'GET') {
          const pd = rq.postData() || '';
          try { const b = JSON.parse(pd); op = b.operationName || null; corpoChaves = Object.keys(b).slice(0, 6); } catch { op = null; }
        }
        const x = urlDe(u);
        const chave = metodo + ' ' + x.origin + x.pathname + (op ? '#' + op : '');
        const cat = achaCatalogo(json);
        const ant = achados.get(chave);
        if (ant) { ant.n++; if (cat && !ant.catalogo) { ant.catalogo = cat; ant.url = limpaUrl(u); } return; }
        achados.set(chave, { metodo, url: limpaUrl(u), status: res.status(), bytes: buf.length, n: 1, ...(op ? { op } : {}), ...(corpoChaves ? { corpo: corpoChaves } : {}), chaves: chavesTopo(json), catalogo: cat });
      } catch {}
    })());
  });

  // monta o resultado a partir do que já foi visto; também é chamada se o tempo acabar (resultado parcial)
  const finalizar = () => {
    const lista = [...achados.values()];
    lista.sort((a, b) => (b.catalogo ? 1 : 0) - (a.catalogo ? 1 : 0) || (b.catalogo?.total || b.catalogo?.itens || 0) - (a.catalogo?.total || a.catalogo?.itens || 0) || b.bytes - a.bytes);
    st.plataformas = [...plat];
    const cats = lista.filter((a) => a.catalogo).slice(0, 6).map(({ catalogo, ...r }) => ({ ...r, catalogo: true, produtos: catalogo }));
    // sem catálogo: só os maiores e mais úteis (POST/GraphQL e respostas grandes), com poucas chaves
    const outros = lista.filter((a) => !a.catalogo && a.bytes > 600).sort((a, b) => b.bytes - a.bytes).slice(0, cats.length ? 2 : 4).map(({ catalogo, chaves, ...r }) => ({ ...r, catalogo: false, chaves: chaves.slice(0, 5) }));
    st.endpoints = [...cats, ...outros];
    st.totalEndpointsJson = lista.length;
    if (ignorados) st.ruidoIgnorado = ignorados;
    st.achouCatalogo = lista.some((a) => a.catalogo) || !!st.vtexBusca;
  };
  Object.defineProperty(st, '__fin', { value: finalizar, enumerable: false, writable: true });
  const { page, status, titulo, bloqueio } = await abrePagina(ctx, url, st);
  st.pagina = { status, titulo };
  if (bloqueio) { st.bloqueado = true; st.motivo = bloqueio; }
  else {
    await sleep(1500);
    st.cookies = await aceitaCookies(page);
    await rola(page, 6);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Sem catálogo ainda? Tenta a busca do site com um termo comum (uma vez).
    await Promise.all(pendentes.splice(0));
    const temCatalogo = () => [...achados.values()].some((a) => a.catalogo);
    if (!temCatalogo()) {
      try {
        const caixa = page.locator('input[type=search], input[placeholder*="usc" i], input[name*="search" i], input[name="q"], input[id*="search" i]').first();
        if (await caixa.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sleep(PAUSA_MS);
          await caixa.fill('arroz');
          await caixa.press('Enter');
          st.buscou = 'arroz';
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await sleep(2500);
          await rola(page, 3);
        }
      } catch {}
    }
    // Ainda sem catálogo? Abre uma página de categoria/departamento (lista paginada costuma chamar a API) e clica em "ver mais".
    await Promise.all(pendentes.splice(0));
    if (!temCatalogo()) {
      try {
        const origem = new URL(page.url()).origin;
        const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
        const cand = [...new Set(hrefs)].filter((h) => h.startsWith(origem) && /categor|departament|\/c\/|mercearia|bebidas|ofertas|hortifruti|limpeza|higiene/i.test(h) && !/#|login|conta|cart|carrinho/i.test(h));
        const alvoCat = cand.find((h) => /categor|departament/i.test(h)) || cand[0];
        if (alvoCat) {
          await sleep(PAUSA_MS);
          await page.goto(alvoCat, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
          st.categoriaAberta = limpaUrl(alvoCat, 110);
          for (let i = 0; i < 5; i++) {
            await rola(page, 2);
            const clicou = await page.evaluate(() => {
              const b = [...document.querySelectorAll('button, a')].find((e) => /^(ver mais|carregar mais|mostrar mais|mais produtos|ver mais produtos)/i.test((e.innerText || '').trim()) && e.offsetParent !== null);
              if (b) { b.click(); return true; }
              return false;
            }).catch(() => false);
            if (clicou) { await sleep(PAUSA_MS); await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); }
            await Promise.all(pendentes.splice(0));
            if (temCatalogo()) break;
          }
          const precos = await page.evaluate(() => ((document.body?.innerText || '').match(/R\$\s?\d{1,4}[.,]\d{2}/g) || []).length).catch(() => 0);
          st.precosNoHtmlDaCategoria = precos;
        }
      } catch {}
    }
    // links úteis para os outros comandos
    st.links = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('a[href]')].map((a) => a.href);
      return {
        instagram: [...new Set(hs.filter((h) => /instagram\.com\/[^/?]+/i.test(h) && !/\/(p|reel|explore)\//.test(h)))].slice(0, 2),
        encarte: [...new Set(hs.filter((h) => /encarte|folheto|tabloide|jornal-de-ofertas|ofertas?(\/|$)/i.test(h)))].slice(0, 4),
      };
    }).catch(() => ({}));
  }
  await Promise.all(pendentes.splice(0));
  // VTEX: sondagem direta da busca pública (a página nem sempre a chama durante a visita)
  if (plat.has('VTEX') && !bloqueio) {
    try {
      await sleep(PAUSA_MS);
      const origem = new URL(page.url()).origin;
      const rv = await ctx.request.get(origem + '/api/catalog_system/pub/products/search?_from=0&_to=0', { timeout: 15000 });
      const total = Number((rv.headers()['resources'] || '').split('/')[1]);
      if (rv.status() < 300 && total >= 0) st.vtexBusca = { url: origem + '/api/catalog_system/pub/products/search?_from=0&_to=49', produtos: total, nota: 'API pública VTEX; rode o comando vtex para estoque, sellers e retirada' };
    } catch {}
  }
  finalizar();
  void hosts; void cdn;
}

// ================= COMANDO: vtex =================
async function cmdVtex(dominio, st) {
  const cep = String(opt.cep || '09310000').replace(/\D/g, '');
  const cidades = String(opt.cidades || 'Mauá,Ribeirão Pires').split(',').map((c) => semAcento(c.trim())).filter(Boolean);
  let base = origemDe(dominio);
  const busca = (q = '') => `/api/catalog_system/pub/products/search?_from=0&_to=0${q}`;
  let r = await http(base + busca());
  if (r.status === 0 && !/\/\/www\./.test(base)) { base = base.replace('://', '://www.'); r = await http(base + busca()); }
  if (r.url) { try { base = new URL(r.url).origin; } catch {} } // segue o redirecionamento (apex -> www), senão o POST vira GET
  st.base = base;
  const texto0 = r.status === 403 || r.status === 429 ? '' : await r.text().catch(() => '');
  const bloq = sinalBloqueio(r.status, r.headers, texto0);
  if (bloq) { st.vtex = null; st.bloqueado = true; st.motivo = bloq; return; }
  let ehVtex = false;
  const resources = r.headers.get('resources');
  if ((r.status === 200 || r.status === 206) && resources) { try { ehVtex = Array.isArray(JSON.parse(texto0)); } catch {} }
  st.vtex = ehVtex;
  if (!ehVtex) { st.status = r.status; if (r.erro) st.erro = r.erro; st.dica = 'sem /api/catalog_system/pub/products/search (pode ser VTEX IO ou outra plataforma; rode "api")'; return; }
  st.catalogoTotal = Number((resources || '').split('/')[1]) || null; // inclui itens sem estoque e com preço 0
  const rs = await http(base + busca('&fq=isAvailablePerSalesChannel_1:1&sc=1'));
  const total2 = Number((rs.headers.get('resources') || '').split('/')[1]);
  if (total2 >= 0) st.emEstoque = total2; // produtos disponíveis no canal de vendas 1 (o campo "resources" do filtro)
  if (st.emEstoque != null && st.catalogoTotal) st.emEstoquePct = Math.round((100 * st.emEstoque) / st.catalogoTotal);

  // amostra de produtos (3 faixas) para achar sellers e testar estoque/retirada pela simulação
  const amostra = [];
  const sellers = new Map();
  for (const de of [0, 500, 1000, 1500, 2400]) {
    const ra = await http(`${base}/api/catalog_system/pub/products/search?_from=${de}&_to=${de + 19}&fq=isAvailablePerSalesChannel_1:1&sc=1`);
    let arr = [];
    try { arr = JSON.parse(await ra.text()); } catch {}
    if (!Array.isArray(arr)) arr = [];
    for (const p of arr) {
      const it = p.items?.[0];
      if (it?.itemId) amostra.push(it.itemId);
      for (const s of it?.sellers || []) if (s.sellerId) sellers.set(String(s.sellerId), s.sellerName || '');
    }
  }
  st.amostra = { n: amostra.length };
  let regiaoIds = new Set();
  // pontos de retirada perto do CEP
  const pontos = [];
  let totalPontos = null;
  for (let pg = 1; pg <= 3; pg++) {
    const rp = await http(`${base}/api/checkout/pub/pickup-points?postalCode=${cep}&countryCode=BRA&page=${pg}&pageSize=30`);
    let j = null;
    try { j = JSON.parse(await rp.text()); } catch {}
    if (!j?.items) { if (pg === 1) st.pickupPoints = rp.status === 404 ? 'indisponível (404)' : `HTTP ${rp.status}`; break; }
    totalPontos = j.paging?.total ?? totalPontos;
    for (const it of j.items) {
      if (pontos.some((p) => p.id === it.pickupPoint?.id)) continue;
      const a = it.pickupPoint?.address || {};
      pontos.push({ id: it.pickupPoint?.id, nome: String(it.pickupPoint?.friendlyName || '').replace(/\s*-\s*$/, ''), cidade: a.city, bairro: a.neighborhood, rua: `${a.street || ''}, ${a.number || ''}`.trim(), cep: String(a.postalCode || '').replace(/[^0-9]/g, ''), km: Math.round((it.distance || 0) * 10) / 10 });
    }
    if (pg >= (j.paging?.pages || 1)) break;
  }
  if (pontos.length) {
    const naRegiao = pontos.filter((p) => cidades.includes(semAcento(p.cidade)));
    regiaoIds = new Set(naRegiao.map((p) => p.id));
    const sellerDe = (id) => String(id || '').split('_')[0];
    st.pontosDeRetirada = {
      totalNoPais: totalPontos, lidos: pontos.length,
      naRegiao: naRegiao.map((p) => `${p.nome} | ${p.cidade}, ${p.bairro} | ${p.rua} | ${p.km} km | seller ${sellerDe(p.id)}`),
      ...(naRegiao.length ? {} : { maisPerto: pontos.slice(0, 3).map((p) => `${p.nome} | ${p.cidade} | ${p.km} km`) }),
    };
    for (const p of naRegiao) { const sid = sellerDe(p.id); if (!sellers.has(sid)) sellers.set(sid, '@loja'); }
  }
  // simulação: estoque e retirada na região
  if (amostra.length) {
    // CEPs a tentar: o informado e um de cada cidade da região (a simulação só mostra as lojas mais próximas do CEP)
    const porCidade = new Map();
    for (const p of pontos) if (regiaoIds.has(p.id) && p.cep && !porCidade.has(p.cidade)) porCidade.set(p.cidade, p.cep);
    const ceps = [cep, ...[...porCidade.values()].filter((c) => c !== cep)].slice(0, 3);
    let j = null, sim = null, cepUsado = cep, melhorN = -1;
    const conta = (jj) => jj.items.filter((it, i) => (jj.logisticsInfo?.[i]?.slas || []).some((s) => s.deliveryChannel === 'pickup-in-point' && (regiaoIds.has(s.pickupPointId) || cidades.includes(semAcento(s.pickupStoreInfo?.address?.city))))).length;
    for (const c of ceps) {
      const rr = await http(`${base}/api/checkout/pub/orderForms/simulation?sc=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: amostra.slice(0, 100).map((id) => ({ id, quantity: 1, seller: '1' })), country: 'BRA', postalCode: c }) });
      let jj = null;
      try { jj = JSON.parse(await rr.text()); } catch {}
      sim ??= rr;
      if (jj?.items) { const n = conta(jj); if (n > melhorN) { melhorN = n; j = jj; cepUsado = c; } if (n > 0) break; }
    }
    if (j?.items) {
      let disp = 0, retiradaRegiao = 0;
      j.items.forEach((it, i) => {
        if (it.availability === 'available') disp++;
        const slas = j.logisticsInfo?.[i]?.slas || [];
        if (slas.some((s) => s.deliveryChannel === 'pickup-in-point' && (regiaoIds.has(s.pickupPointId) || cidades.includes(semAcento(s.pickupStoreInfo?.address?.city))))) retiradaRegiao++;
      });
      st.amostra = { n: j.items.length, disponiveis: disp, comRetiradaNaRegiao: retiradaRegiao, cep: cepUsado, ...(cepUsado !== cep ? { aviso: `com o CEP ${cep} a simulação não mostra retirada; usei o CEP de uma loja da região` } : {}) };
      for (const s of j.sellers || []) if (s.id) sellers.set(String(s.id), s.name || '');
    } else st.amostra.simulacao = `HTTP ${sim.status}`;
  }
  st.sellers = [...sellers.entries()].filter(([, n]) => n !== '@loja').slice(0, 8).map(([id, nome]) => ({ id, nome }));
  const sellersLoja = [...sellers.entries()].filter(([, n]) => n === '@loja').map(([id]) => id);
  if (sellersLoja.length) st.sellersDeLoja = sellersLoja;
}

// ================= COMANDO: sitemap =================
async function lerXml(url) {
  let r = await http(url, { headers: { 'accept-encoding': 'gzip' } }, 25000);
  // 404/500 com o nosso User-Agent: tenta uma vez com o de navegador (não é bloqueio, só servidor exigente). 403/429 nunca é contornado.
  if (r.status === 404 || r.status >= 500) r = await http(url, { headers: { 'accept-encoding': 'gzip', 'user-agent': UA_NAV } }, 25000);
  if (r.status !== 200) return { status: r.status, bloqueio: sinalBloqueio(r.status, r.headers, ''), erro: r.erro };
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch {} }
  return { status: 200, xml: buf.toString('utf8') };
}
// Tipo da URL. O nome do arquivo de sitemap manda (VTEX: product-N, category-N, brand-N); sem pista, vale o formato do caminho.
const tipoDaUrl = (u, arquivo) => {
  let p;
  try { p = new URL(u).pathname.toLowerCase(); } catch { return 'outro'; }
  if (/^(product|produto)/.test(arquivo)) return 'produto';
  if (/^(category|categor|department|departamento)/.test(arquivo)) return 'categoria';
  if (/^(brand|marca)/.test(arquivo)) return 'marca';
  if (/\/p$|\/p\/|\/produto|\/product|\/pd\/|\/prod\/|-p-?[0-9]|\/item\/|[.]html$|\/dp\//.test(p) && !/categor/.test(p)) return 'produto';
  if (/categor|departamento|\/c\/|\/category|\/dept|\/secao|\/colecao|\/collections?\//.test(p)) return 'categoria';
  if (/^\/[^/]+\/?$/.test(p) && p.length > 1 && !/sobre|contato|blog|politica|termos|institucional|lojas|faq/.test(p)) return 'categoria?';
  return 'outro';
};
let PRAZO_SITEMAP_MS = 60000;
async function cmdSitemap(dominio, st) {
  const ini = Date.now();
  const base = origemDe(dominio);
  const rb = await http(base + '/robots.txt');
  let sitemaps = [];
  const bloqRobots = rb.status === 403 || rb.status === 429 ? sinalBloqueio(rb.status, rb.headers) : null;
  if (bloqRobots) { st.bloqueado = true; st.motivo = bloqRobots; return; }
  if (rb.status === 200) {
    const t = await rb.text();
    st.robots = { ok: true, proibeTudo: /disallow:\s*\/\s*$/im.test(t) && /user-agent:\s*\*/i.test(t) };
    sitemaps = [...t.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  } else st.robots = { ok: false, status: rb.status };
  st.sitemapsNoRobots = sitemaps.length;
  if (!sitemaps.length) sitemaps = [base + '/sitemap.xml', base + '/sitemap_index.xml'];

  let fila = [...new Set(sitemaps)];
  const vistos = new Set();
  const cont = { produto: 0, categoria: 0, 'categoria?': 0, marca: 0, outro: 0 };
  const dept = new Map();
  const arquivos = [];
  const nomeDe = (sm) => sm.split('/').pop().split('?')[0].toLowerCase();
  let lidos = 0, naoLidos = 0, produtosNaoLidos = 0, arqProdLidos = 0;
  const LIMITE = 30;
  while (fila.length) {
    // lê primeiro o que não é arquivo de produto (categorias, índices); arquivos de produto vão por último
    fila.sort((a, b) => (/^product|^produto/.test(nomeDe(a)) ? 1 : 0) - (/^product|^produto/.test(nomeDe(b)) ? 1 : 0));
    const sm = fila.shift();
    if (vistos.has(sm)) continue;
    vistos.add(sm);
    const nome = nomeDe(sm);
    if (lidos >= LIMITE || Date.now() - ini > PRAZO_SITEMAP_MS) { naoLidos++; if (/^product|^produto/.test(nome)) produtosNaoLidos++; continue; }
    lidos++;
    const x = await lerXml(sm);
    if (!x.xml) { arquivos.push({ f: nome, status: x.status, ...(x.bloqueio ? { bloqueio: x.bloqueio } : {}) }); if (x.bloqueio) st.bloqueado = true; continue; }
    const locs = [...x.xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/g)].map((m) => m[1].trim().replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(x.xml)) {
      for (const l of locs) fila.push(l);
      arquivos.push({ f: nome, indice: locs.length });
      continue;
    }
    const porTipo = { produto: 0, categoria: 0, 'categoria?': 0, marca: 0, outro: 0 };
    for (const l of locs) {
      const t = tipoDaUrl(l, nome);
      porTipo[t]++; cont[t]++;
      if (t === 'categoria') {
        const seg = (urlDe(l)?.pathname || '/').split('/').filter(Boolean);
        const k = ['categoria', 'c', 'departamentos', 'categorias', 'departamento'].includes(seg[0]) ? seg[1] : seg[0];
        if (k && (seg.length <= 3 || seg[0] === k)) dept.set(k, (dept.get(k) || 0) + 1);
      }
    }
    if (/^product|^produto/.test(nome)) arqProdLidos++;
    arquivos.push({ f: nome, urls: locs.length, ...Object.fromEntries(Object.entries(porTipo).filter(([, v]) => v)) });
  }
  st.urlsPorTipo = Object.fromEntries(Object.entries(cont).filter(([, v]) => v));
  st.totalUrls = Object.values(cont).reduce((a, b) => a + b, 0);
  // arquivos: resumo curto (os de produto repetidos entram como um só)
  const prods = arquivos.filter((a) => /^product|^produto/.test(a.f));
  const resto = arquivos.filter((a) => !/^product|^produto/.test(a.f));
  st.arquivos = [...resto.slice(0, 8), ...(prods.length ? [{ f: `${prods[0].f.replace(/[0-9]+/, 'N')} (${prods.length} arquivos)`, urls: prods.reduce((s, a) => s + (a.urls || 0), 0), produto: prods.reduce((s, a) => s + (a.produto || 0), 0) }] : [])];
  if (naoLidos) {
    st.naoLidos = naoLidos;
    if (produtosNaoLidos && arqProdLidos) st.produtosEstimados = cont.produto + Math.round((produtosNaoLidos * cont.produto) / arqProdLidos);
  }
  st.departamentosTopo = [...dept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `${n} (${c})`);
  if (!st.totalUrls) st.dica = 'sem sitemap legível; rode "api" ou "folheto"';
}

// ================= COMANDO: instagram =================
const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
function dataDoAlt(alt) {
  const s = semAcento(alt);
  let m = s.match(/\bon ([a-z]+) (\d{1,2}),? (\d{4})/), d, mo, y;
  if (m) { mo = MESES[m[1]]; d = +m[2]; y = +m[3]; }
  else if ((m = s.match(/(\d{1,2}) de ([a-z]+)(?: de)? (\d{4})/))) { mo = MESES[m[2]]; d = +m[1]; y = +m[3]; }
  return mo ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
async function cmdInstagram(perfil, st) {
  const h = String(perfil).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?]/)[0];
  st.perfil = '@' + h;
  const { ctx } = await abrirNavegador({ viewport: { width: 1200, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`https://www.instagram.com/${h}/`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch((e) => { st.erro = String(e.message).slice(0, 100); });
  await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 12000 }).catch(() => {});
  await sleep(1000);
  const url = page.url();
  const dados = await page.evaluate(() => ({
    posts: [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map((a) => ({ h: a.getAttribute('href'), alt: a.querySelector('img')?.alt || '' })),
    login: !!document.querySelector('input[name=username], form[id*=loginForm]'),
    texto: (document.body?.innerText || '').slice(0, 600),
    titulo: document.title,
  })).catch(() => ({ posts: [], login: false, texto: '', titulo: '' }));
  const posts = dados.posts.map((r) => ({
    codigo: (r.h.match(/\/(?:p|reel)\/([^/?]+)/) || [])[1],
    data: dataDoAlt(r.alt),
    tipo: /\/reel\//.test(r.h) || /^video by/i.test(r.alt) ? 'video' : 'foto',
    alt: r.alt.replace(/^.*? (on [A-Za-z]+ \d+, \d{4}|em \d+ de [a-zç]+ de \d{4})[.]?\s*/i, '').slice(0, 70),
  })).filter((p) => p.codigo);
  const vistos = new Set();
  const unicos = posts.filter((p) => !vistos.has(p.codigo) && vistos.add(p.codigo));
  if (/accounts\/login/.test(url) || (!unicos.length && (dados.login || /log in|entrar|sign up|cadastr/i.test(dados.texto)))) {
    st.bloqueado = true; st.motivo = 'tela de login do Instagram'; return;
  }
  if (!unicos.length) {
    st.bloqueado = !/page isn.?t available|n[aã]o est[aá] dispon[ií]vel|sorry/i.test(dados.titulo + dados.texto);
    st.motivo = st.bloqueado ? 'nenhum post visível (login/bloqueio?)' : 'perfil não existe ou está indisponível';
    return;
  }
  const datas = unicos.map((p) => p.data).filter(Boolean).sort();
  st.posts = unicos.slice(0, 12);
  st.total = unicos.length;
  st.maisRecente = datas[datas.length - 1] || null;
  st.maisAntigo = datas[0] || null;
  st.semData = unicos.filter((p) => !p.data).length;
  if (st.maisRecente) st.diasDesdeUltimo = Math.round((Date.now() - new Date(st.maisRecente + 'T12:00:00').getTime()) / 86400000);
}

// ================= COMANDO: folheto =================
let _pdfjs;
async function pdfjs() {
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}
async function analisaPdf(ctx, url) {
  const info = { url: limpaUrl(url, 150) };
  try {
    await sleep(PAUSA_MS);
    const r = await ctx.request.get(url, { timeout: 30000 });
    info.status = r.status();
    if (!r.ok()) return info;
    const buf = await r.body();
    info.bytes = buf.length;
    if (buf.subarray(0, 5).toString() !== '%PDF-') { info.erro = 'não é PDF'; return info; }
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
    info.paginas = doc.numPages;
    let chars = 0, amostra = '';
    const n = Math.min(doc.numPages, 3);
    for (let i = 1; i <= n; i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      const t = tc.items.map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim();
      chars += t.length;
      if (!amostra && t.length > 20) amostra = t.slice(0, 120);
    }
    info.textoExtraivel = chars / n > 80;
    info.caracteresPag1a3 = chars;
    if (amostra) info.amostra = amostra;
    const precos = (amostra + '').match(/\d+[.,]\d{2}/g);
    void precos;
    if (!info.textoExtraivel) info.dica = 'PDF só imagem: precisa de OCR/IA de visão';
    try { await doc.destroy?.(); } catch {}
  } catch (e) { info.erro = String(e.message).slice(0, 80); }
  return info;
}
async function cmdFolheto(url, st) {
  url = comEsquema(url);
  const { ctx } = await abrirNavegador();
  const pdfsRede = new Set();
  ctx.on('response', (res) => {
    try { if (/application\/pdf/i.test(res.headers()['content-type'] || '')) pdfsRede.add(res.url()); } catch {}
  });
  const { page, status, titulo, bloqueio } = await abrePagina(ctx, url, st);
  st.pagina = { status, titulo };
  if (bloqueio) { st.bloqueado = true; st.motivo = bloqueio; return; }
  await sleep(1500);
  await aceitaCookies(page);
  await rola(page, 5);
  const RE_ENC = /encarte|folheto|tabloide|jornal|oferta|promo|revista|catalogo|flyer|panfleto|semana/i;
  const dom = await page.evaluate(() => {
    const abs = (s) => { try { return new URL(s, location.href).href; } catch { return null; } };
    const links = [...document.querySelectorAll('a[href]')].map((a) => ({ h: abs(a.getAttribute('href')), t: (a.innerText || a.title || a.getAttribute('aria-label') || '').trim().slice(0, 50) })).filter((x) => x.h);
    const imgs = [...document.querySelectorAll('img')].map((i) => ({ s: abs(i.currentSrc || i.src || i.getAttribute('data-src') || ''), w: i.naturalWidth, h: i.naturalHeight, alt: (i.alt || '').slice(0, 40), cls: (i.className || '').toString().slice(0, 40) })).filter((x) => x.s && x.w);
    const frames = [...document.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean);
    const html = document.documentElement.outerHTML;
    const emHtml = [...html.matchAll(/https?:[^"'\s<>\\]+?\.pdf(?:\?[^"'\s<>\\]*)?/gi)].map((m) => m[0].replace(/\\u0026/g, '&'));
    const bgs = [...document.querySelectorAll('[style*="background"]')].map((e) => (e.getAttribute('style').match(/url\(["']?([^"')]+)/) || [])[1]).filter(Boolean).map(abs);
    return { links, imgs, frames, emHtml, bgs };
  }).catch(() => ({ links: [], imgs: [], frames: [], emHtml: [], bgs: [] }));

  const pdfs = new Set([...pdfsRede, ...dom.emHtml, ...dom.links.map((l) => l.h).filter((h) => /\.pdf(\?|#|$)/i.test(h))]);
  const ehImg = (h) => /\.(jpe?g|png|webp)(\?|#|$)/i.test(h);
  const validadeDe = (s) => { const m = String(s).match(/(\d{2})(\d{2})(\d{4})-(\d{2})(\d{2})(\d{4})/); return m ? `${m[1]}/${m[2]}/${m[3]} a ${m[4]}/${m[5]}/${m[6]}` : undefined; };
  const linksOk = dom.links.filter((l) => /^https?:/.test(l.h) && l.h.split('#')[0] !== url.split('#')[0]);
  // links que apontam direto para a imagem do encarte (versão grande, ex.: pagN-full-tabloide-...jpg)
  const imgLinks = [...new Set(linksOk.filter((l) => ehImg(l.h) && (RE_ENC.test(l.h) || RE_ENC.test(l.t))).map((l) => l.h))];
  const linksEnc = linksOk.filter((l) => !/\.pdf(\?|#|$)/i.test(l.h) && !ehImg(l.h) && (RE_ENC.test(l.h) || RE_ENC.test(l.t)));
  const linksUnicos = [...new Map(linksEnc.map((l) => [l.h, l])).values()];
  // imagens da página candidatas a encarte: grandes (>=700 px) ou com nome de encarte; as com nome de encarte vêm primeiro
  const imgsEnc = [];
  const vistas = new Set();
  for (const i of [...dom.imgs, ...dom.bgs.filter(Boolean).map((s) => ({ s, w: 0, h: 0, alt: '', cls: '' }))]) {
    if (!/^https?:/.test(i.s) || vistas.has(i.s) || /\.(svg|gif)(\?|$)/i.test(i.s) || /logo|icon|sprite|banner-?app|avatar|blog|receita/i.test(i.s + ' ' + i.alt)) continue;
    const grande = Math.max(i.w, i.h) >= 700 && Math.min(i.w, i.h) >= 400;
    const nome = RE_ENC.test(i.s) || RE_ENC.test(i.alt) || RE_ENC.test(i.cls);
    if (grande || nome) { vistas.add(i.s); imgsEnc.push({ ...i, nome }); }
  }
  imgsEnc.sort((a, b) => (b.nome ? 1 : 0) - (a.nome ? 1 : 0));
  st.pdfs = [];
  for (const p of [...pdfs].slice(0, 3)) st.pdfs.push(await analisaPdf(ctx, p));
  if (pdfs.size > 3) st.pdfsOmitidos = pdfs.size - 3;
  st.imagensGrandes = imgLinks.slice(0, 8).map((h) => ({ url: limpaUrl(h, 130), validade: validadeDe(h) }));
  if (imgLinks.length > 8) st.imagensGrandesTotal = imgLinks.length;
  st.imagens = imgsEnc.slice(0, 5).map((i) => ({ url: limpaUrl(i.s, 120), tam: i.w ? `${i.w}x${i.h}` : '?', validade: validadeDe(i.s), ...(i.alt ? { alt: i.alt } : {}) }));
  st.totalImagens = imgsEnc.length;
  st.linksDeEncarte = linksUnicos.slice(0, 5).map((l) => ({ url: limpaUrl(l.h, 110), texto: l.t }));
  const incorporados = dom.frames.filter((f) => /issuu|tiendeo|calameo|yumpu|flipsnack|publuu|kimbino|folhetos|pdf/i.test(f));
  if (incorporados.length) st.incorporados = incorporados.slice(0, 3).map((f) => limpaUrl(f, 130));
  if (!st.pdfs.length && !st.imagens.length && !imgLinks.length && !linksUnicos.length) st.dica = 'nada com cara de encarte nesta página; veja os links ou o Instagram (comando instagram)';
  else if (!st.pdfs.length && (st.imagens.length || imgLinks.length)) st.dica = 'encarte em imagem (precisa de leitor de visão/OCR)';
}

// ================= COMANDO: tudo =================
async function cmdTudo(url, st) {
  url = comEsquema(url);
  const u = new URL(url);
  const dominio = u.origin;
  const partes = st.partes = {};
  const orcamento = Math.max(20, TEMPO_S - 5);
  const t0 = Date.now();
  const restante = () => orcamento - (Date.now() - t0) / 1000;
  const roda = async (nome, fn, arg, fatia) => {
    if (restante() < 8) { partes[nome] = { pulado: 'sem tempo' }; return; }
    const sub = {};
    const lim = Math.min(restante(), fatia);
    let timer;
    try {
      await Promise.race([fn(arg, sub), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('tempo-limite')), lim * 1000); })]);
    } catch (e) { sub.erro = String(e.message).slice(0, 80); if (e.message === 'tempo-limite') sub.tempoLimite = true; }
    try { sub.__fin?.(); } catch {}
    clearTimeout(timer);
    await fecharTudo(); browsers.length = 0;
    partes[nome] = sub;
  };
  await roda('api', cmdApi, url, 50);
  const api = partes.api;
  // VTEX: plataforma detectada na rede ou domínio de farmácia conhecido; custa pouco, então tenta sempre que o site não bloqueou
  if (!api.bloqueado && (api.plataformas?.includes('VTEX') || api.vtexBusca)) await roda('vtex', cmdVtex, dominio, 45);
  if (partes.vtex && partes.vtex.vtex === false) partes.vtex = { vtex: false };
  PRAZO_SITEMAP_MS = 14000;
  await roda('sitemap', cmdSitemap, dominio, 22);
  const pareceFolheto = /encarte|folheto|oferta|tabloide|jornal|promo/i.test(u.pathname) || (api.links?.encarte?.length > 0) || !api.achouCatalogo;
  if (pareceFolheto && !api.bloqueado) await roda('folheto', cmdFolheto, url, 25);
  const ig = (api.links?.instagram || []).find((l) => /instagram\.com\/[^/]+/.test(l));
  if (ig && !api.bloqueado) await roda('instagram', cmdInstagram, ig, 20);
  // resumo
  const fontes = [];
  if (api.achouCatalogo) fontes.push('api: ' + (api.endpoints || []).filter((e) => e.catalogo).slice(0, 2).map((e) => `${e.metodo} ${e.url.slice(0, 80)}`).join(' | '));
  if (partes.vtex?.vtex) fontes.push(`vtex: ${partes.vtex.emEstoque ?? partes.vtex.catalogoTotal} produtos`);
  if (partes.sitemap?.urlsPorTipo?.produto) fontes.push(`sitemap: ${partes.sitemap.urlsPorTipo.produto} urls de produto`);
  if (partes.folheto?.pdfs?.length) fontes.push(`folheto pdf (${partes.folheto.pdfs.map((p) => (p.textoExtraivel ? 'com texto' : 'sem texto')).join(',')})`);
  else if (partes.folheto?.imagens?.length) fontes.push('folheto em imagem');
  if (partes.instagram?.posts) fontes.push(`instagram: último post ${partes.instagram.maisRecente}`);
  const bloqueios = Object.entries(partes).filter(([, v]) => v.bloqueado).map(([k, v]) => `${k}: ${v.motivo}`);
  // versão compacta de cada parte (o detalhe completo sai pelo comando individual)
  if (api.endpoints) {
    const cats = api.endpoints.filter((e) => e.catalogo);
    api.outrosEndpoints = api.endpoints.length - cats.length;
    api.endpoints = cats.slice(0, 3).map(({ chaves, corpo, ...r }) => r);
    delete api.links;
  }
  if (partes.vtex?.vtex) {
    const v = partes.vtex;
    if (v.pontosDeRetirada) v.pontosDeRetirada = { naRegiao: (v.pontosDeRetirada.naRegiao || []).map((p) => { const a = p.split(' | '); return a[0] + ' (' + a[1] + ', ' + a[3] + ')'; }) };
    v.sellers = (v.sellers || []).map((s) => s.id);
  }
  if (partes.sitemap) { delete partes.sitemap.arquivos; delete partes.sitemap.robots; delete partes.sitemap.sitemapsNoRobots; }
  if (partes.folheto) { partes.folheto.imagens = (partes.folheto.imagens || []).slice(0, 2); delete partes.folheto.linksDeEncarte; delete partes.folheto.pagina; }
  if (partes.instagram?.posts) partes.instagram.posts = partes.instagram.posts.slice(0, 3).map((p) => `${p.data} ${p.tipo}`);
  st.site = u.host;
  st.fontes = fontes;
  if (bloqueios.length) st.bloqueios = bloqueios;
  st.partes = partes;
}

// ---------- principal ----------
const COMANDOS = { api: cmdApi, vtex: cmdVtex, sitemap: cmdSitemap, instagram: cmdInstagram, folheto: cmdFolheto, tudo: cmdTudo };
const AJUDA = 'uso: node server/recon/kit.mjs <api|vtex|sitemap|instagram|folheto|tudo> <alvo> [--cep 09310000] [--cidades "Mauá,Ribeirão Pires"] [--tempo 90] [--max 3000] [--bonito]';

async function main() {
  const t0 = Date.now();
  const st = {};
  const saida = async (extra = {}) => {
    try { st.__fin?.(); } catch {}
    const corpo = { comando: cmd, alvo, ...st, ...extra, segundos: Math.round((Date.now() - t0) / 100) / 10 };
    const max = cmd === 'tudo' ? Math.max(MAX_BYTES, 6000) : MAX_BYTES;
    const j = ajusta(corpo, max);
    process.stdout.write(JSON.stringify(j, null, opt.bonito ? 2 : 0) + '\n');
  };
  if (!COMANDOS[cmd] || !alvo) { process.stdout.write(JSON.stringify({ erro: 'argumentos inválidos', ajuda: AJUDA }) + '\n'); process.exit(2); }
  // vigia: passou do tempo, imprime o que já tem e encerra
  const vigia = setTimeout(async () => {
    await saida({ tempoLimite: true, aviso: `passou de ${TEMPO_S}s; resultado parcial` });
    await fecharTudo();
    process.exit(0);
  }, TEMPO_S * 1000);
  try {
    await COMANDOS[cmd](alvo, st);
    clearTimeout(vigia);
    await saida();
  } catch (e) {
    clearTimeout(vigia);
    await saida({ erro: String(e.message).slice(0, 160) });
  }
  await fecharTudo();
  process.exit(0);
}
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
void fileURLToPath; void pathToFileURL;
main();
