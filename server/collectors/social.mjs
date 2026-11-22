// Jornais de ofertas que só saem no Instagram e no Facebook (Nevada, STUK, Lourencini).
// Decisão do Rafael em 10/11/2026: usar serviços de coleta (planos grátis) mesmo sabendo que a coleta automática
// contraria os termos da Meta. Nenhuma conta pessoal é usada: os serviços acessam sem login, com a infraestrutura deles.
// Cadeia de reserva, separada para Instagram e Facebook: Apify -> Bright Data -> ScrapeCreators -> SocialCrawl (só Instagram) -> Crawlbase. Cada serviço só entra
// se a chave dele existir (APIFY_TOKEN, BRIGHTDATA_TOKEN, SCRAPECREATORS_KEY) e passa a vez se falhar
// (crédito acabou, bloqueio, erro) ou não trouxer nada.
// Pega os posts dos últimos 3 dias; post já lido não é lido de novo (cache pelo código do post) e jornal vencido
// é descartado pela validade impressa. Grava data/extraido/social-encartes.json para readers/folheto.mjs.
// Comércio de bairro (segment: 'bairro'): antes de gastar crédito do serviço, uma pré-checagem grátis abre o perfil
// público do Instagram (sem login, 1 perfil por vez, pausa de 1,5 s) e olha os 12 posts recentes e a data de cada um
// (texto alternativo da foto). Só chama o serviço pago se houver post novo desde a última coleta; se a pré-checagem
// falhar (bloqueio, página mudou, sem Chrome), segue como antes e chama o serviço. Estado em data/extraido/social-vistos.json.
// Lojas com teste: true saem em social-encartes-teste.json (o workflow não lê), até o Rafael aprovar.
import { dataDoCodigo } from './instagram-data.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SOCIAL_OUT_DIR e SOCIAL_MOCK existem só para testar sem chaves nem serviço pago (SOCIAL_MOCK = JSON com posts prontos)
const DIR = process.env.SOCIAL_OUT_DIR || fileURLToPath(new URL('../data/extraido/', import.meta.url));
const OUT = path.join(DIR, 'social-encartes.json');
const OUT_TESTE = path.join(DIR, 'social-encartes-teste.json');
const VISTOS = path.join(DIR, 'social-vistos.json');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SEM_VALIDADE_DIAS = 3; // arte de bairro sem data impressa vale até 3 dias após o post
const DAYS = 7; // o Lourencini posta com menos frequência; com 6 posts por perfil o custo diário fica parecido com 3 dias x 12
const SINCE = Date.now() - DAYS * 86400e3;
const KEYS = { apify: process.env.APIFY_TOKEN, brightdata: process.env.BRIGHTDATA_TOKEN, scrapecreators: process.env.SCRAPECREATORS_KEY, socialcrawl: process.env.SOCIALCRAWL_KEY, crawlbase: process.env.CRAWLBASE_TOKEN };
// STUK: o próprio site diz que sai um jornal novo por dia, então vale no dia do post.
const MARKETS = {
  Nevada: { ig: 'redenevada', fb: 'https://www.facebook.com/redenevada/', daily: false },
  STUK: { ig: 'supermercadostuk', fb: 'https://www.facebook.com/SuperMercadoStuk/', daily: true },
  Lourencini: { ig: 'lourencinisupermercados', fb: 'https://www.facebook.com/LourenciniSupermercados/', daily: false },
  // Comércio de bairro: segment 'bairro' vai ao manifesto; cidades = onde ficam as lojas.
  'Família Lima': { ig: 'supermercadofamilialima', fb: 'https://www.facebook.com/supermercadofamilialima/', daily: false, segment: 'bairro', cidades: ['Mauá', 'Ribeirão Pires'] },
  'Mercado Capital': { ig: 'mercadocapitalmaua', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'] },
  'Mercadinho Parceiro': { ig: 'mercadinhoparceiro', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'] },
  'Mercado Baratinho': { ig: 'mercadobaratinhooficial', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'] }, // 3 lojas
  'Carnes Santana': { ig: '_carnessantanamaua', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'] },
  // Em teste (saem à parte, não vão para o site):
  'Sacolão São Jorge': { ig: 'sacolaosaojorge', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'], teste: true }, // Guapituba
  'Consulado do Churrasco': { ig: 'consuladodochurrascopremium', fb: null, daily: false, segment: 'bairro', cidades: ['Mauá'], teste: true },
  // Açougues Grupo Parati (Ribeirão Pires, só Facebook): a URL da página não consta na pesquisa em D:\Temp\pesquisa-14.
  // Preencher fb com a URL confirmada e descomentar.
  // 'Açougues Grupo Parati': { ig: null, fb: 'https://www.facebook.com/<página>/', daily: false, segment: 'bairro', cidades: ['Ribeirão Pires'], teste: true },
};
let TARGETS = MARKETS; // perfis que o serviço pago vai consultar nesta rodada (muda depois da pré-checagem)
const MOCK = process.env.SOCIAL_MOCK;
if (!MOCK && !process.env.SOCIAL_PRECHECK_ONLY && !Object.values(KEYS).some(Boolean)) { console.log('social: nenhuma chave de serviço, pulando'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toIso = (t) => { if (t == null || t === '') return null; const n = Number(t); const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(t); return isNaN(d) ? null : d.toISOString(); };
// data do post em qualquer campo com nome de data/hora (cada serviço usa um nome: taken_at, timestamp, created_time, date...)
function findWhen(p) {
  for (const [k, v] of Object.entries(p || {})) {
    if (!/time|date|taken|created|published|posted/i.test(k) || v == null || typeof v === 'object') continue;
    const iso = toIso(v);
    if (iso && Date.parse(iso) > Date.parse('2015-01-01') && Date.parse(iso) < Date.now() + 86400e3) return iso;
  }
  return null;
}
const recent = (iso) => iso && Date.parse(iso) >= SINCE;
const marketOfIg = (u) => Object.entries(MARKETS).find(([, v]) => v.ig === String(u || '').toLowerCase())?.[0];
const marketOfFb = (s) => Object.entries(MARKETS).find(([, v]) => v.fb && String(s || '').toLowerCase().includes(v.fb.split('/')[3].toLowerCase()))?.[0];
// imagens de post (CDN do Instagram/Facebook) achadas em qualquer campo; foto de perfil fica de fora
function findImages(obj, out = []) {
  if (typeof obj === 'string') { if (/^https:\/\/[^ ]*(cdninstagram|fbcdn|scontent)[^ ]*/.test(obj) && !/s150x150|p50x50|profile_pic|\/v\/t1\.30497/.test(obj)) out.push(obj); }
  else if (Array.isArray(obj)) obj.forEach((x) => findImages(x, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (!/profile|avatar|owner|author|user_pic/i.test(k)) findImages(v, out);
  return out;
}

// ---------- serviços: cada um devolve posts no formato { market, net, code, when, link, images, owner } ----------
async function apify(net) {
  const actor = net === 'ig' ? 'apify~instagram-post-scraper' : 'apify~facebook-posts-scraper';
  const input = net === 'ig'
    ? { username: Object.values(TARGETS).map((m) => m.ig), resultsLimit: 6, onlyPostsNewerThan: `${DAYS} days` }
    : { startUrls: Object.values(TARGETS).filter((m) => m.fb).map((m) => ({ url: m.fb })), resultsLimit: 6, onlyPostsNewerThan: `${DAYS} days` };
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${KEYS.apify}&timeout=280`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(320000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const items = await r.json();
  return (Array.isArray(items) ? items : []).map((p) => {
    if (net === 'ig') {
      const imgs = [...(p.childPosts || []).filter((c) => c.type !== 'Video').map((c) => c.displayUrl), ...(p.images || [])];
      if (!imgs.length && p.type !== 'Video') imgs.push(p.displayUrl);
      const code = p.shortCode || p.id;
      return { market: marketOfIg(p.ownerUsername), net, code, when: toIso(p.timestamp), link: p.url || `https://www.instagram.com/p/${code}/`, images: imgs, owner: '@' + p.ownerUsername };
    }
    const imgs = (p.media || []).map((x) => x?.photo_image?.uri || x?.image?.uri || x?.thumbnail);
    return { market: marketOfFb(p.facebookUrl || p.inputUrl || p.pageName || p.url), net, code: p.postId || p.id, when: toIso(p.time || p.timestamp), link: p.url, images: imgs, owner: p.pageName };
  });
}

async function brightdata(net) {
  // Web Scraper API: posts recentes de cada perfil ("discover by url"); se demorar, vira snapshot e é consultado depois
  const ds = net === 'ig' ? 'gd_lk5ns7kz21pck8jpis' : 'gd_lkaxegm826bjpoo9m5';
  const urls = net === 'ig' ? Object.values(TARGETS).map((m) => `https://www.instagram.com/${m.ig}/`) : Object.values(TARGETS).filter((m) => m.fb).map((m) => m.fb);
  const d = new Date(SINCE);
  const start = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
  const H = { Authorization: `Bearer ${KEYS.brightdata}`, 'Content-Type': 'application/json' };
  let r = await fetch(`https://api.brightdata.com/datasets/v3/scrape?dataset_id=${ds}&format=json&type=discover_new&discover_by=url&include_errors=true`, {
    method: 'POST', headers: H, body: JSON.stringify(urls.map((url) => ({ url, num_of_posts: 6, start_date: start }))), signal: AbortSignal.timeout(120000),
  });
  if (r.status === 202) {
    const { snapshot_id: id } = await r.json();
    for (let i = 0; i < 30; i++) {
      await sleep(10000);
      r = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${id}?format=json`, { headers: H, signal: AbortSignal.timeout(60000) });
      if (r.status !== 202) break;
    }
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const items = await r.json();
  return (Array.isArray(items) ? items : []).filter((p) => !p.error).map((p) => {
    const owner = p.user_posted || p.page_name || p.profile_name || '';
    const market = net === 'ig' ? marketOfIg(owner) || marketOfIg(String(p.input?.url || '').split('/')[3]) : marketOfFb(p.page_url || p.input?.url || p.url);
    const images = [...(p.photos || []), ...(p.attachments || []).filter((a) => !/video/i.test(a?.type || '')).map((a) => a.url || a.attachment_url), p.post_image]
      .filter((u) => typeof u === 'string');
    return { market, net, code: p.shortcode || p.post_id || p.id || String(p.url || '').split('/').filter(Boolean).pop(), when: toIso(p.date_posted || p.timestamp), link: p.url, images: images.length ? images : findImages(p), owner };
  });
}

async function scrapecreators(net) {
  const H = { 'x-api-key': KEYS.scrapecreators };
  const out = [];
  for (const [market, m] of Object.entries(TARGETS)) {
    if (net === 'fb' && !m.fb) continue;
    const url = net === 'ig'
      ? `https://api.scrapecreators.com/v2/instagram/user/posts?handle=${m.ig}&trim=false`
      : `https://api.scrapecreators.com/v1/facebook/profile/posts?url=${encodeURIComponent(m.fb)}`;
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    for (const p of j.items || j.posts || j.data || []) {
      if (net === 'ig') {
        if (p.media_type === 2) continue; // vídeo
        const media = p.carousel_media?.length ? p.carousel_media.filter((c) => c.media_type !== 2) : [p];
        const images = media.map((c) => c.image_versions2?.candidates?.[0]?.url || c.display_url).filter(Boolean);
        out.push({ market, net, code: p.code || p.shortcode || p.id, when: toIso(p.taken_at || p.taken_at_timestamp), link: `https://www.instagram.com/p/${p.code || p.shortcode}/`, images, owner: '@' + m.ig });
      } else {
        out.push({ market, net, code: p.id || p.post_id, when: toIso(p.publishTime || p.creation_time || p.timestamp), link: p.url || p.permalink, images: findImages(p), owner: market });
      }
    }
    await sleep(1000);
  }
  return out;
}

async function socialcrawl(net) {
  // só Instagram (não achei endpoint de posts de página do Facebook na documentação)
  if (net !== 'ig') return [];
  const out = [];
  for (const [market, m] of Object.entries(TARGETS)) {
    const since = new Date(SINCE).toISOString().slice(0, 10);
    const r = await fetch(`https://www.socialcrawl.dev/v1/instagram/profile/posts?handle=${m.ig}&since=${since}`, { headers: { 'x-api-key': KEYS.socialcrawl }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    const items = j.data?.items || j.items || j.data?.posts || [];
    for (const p of items) {
      if (/video|reel|clip/i.test(String(p.media_type ?? p.type ?? p.product_type ?? ''))) continue;
      const code = p.shortcode || p.code || p.id;
      const imgs = [...(p.carousel || p.carousel_media || p.children || []).map((c) => c.image_url || c.display_url || c.url || c.image_versions2?.candidates?.[0]?.url), p.image_url, p.display_url, p.thumbnail_url];
      const images = imgs.filter((u) => typeof u === 'string');
      out.push({ market, net, code, when: toIso(p.taken_at || p.timestamp || p.created_at || p.published_at) || findWhen(p), link: p.url || p.permalink || `https://www.instagram.com/p/${code}/`, images: images.length ? images : findImages(p), owner: '@' + m.ig });
    }
    await sleep(1000);
  }
  return out;
}

async function crawlbase(net) {
  // Crawling API com os extratores prontos do Crawlbase (instagram-profile e facebook-page).
  // A documentação não detalha os campos: as imagens dos posts são achadas em qualquer campo (findImages).
  const out = [];
  for (const [market, m] of Object.entries(TARGETS)) {
    const page = net === 'ig' ? `https://www.instagram.com/${m.ig}/` : m.fb;
    if (!page) continue;
    const scraper = net === 'ig' ? 'instagram-profile' : 'facebook-page';
    // Perfil que volta vazio é comum (22/11: Família Lima, Mercado Capital e Carnes Santana vieram com 0 posts): uma segunda tentativa
    let posts = [], tentativas = 0;
    while (!posts.length && tentativas < 2) {
      if (tentativas++) await sleep(5000);
      const r = await fetch(`https://api.crawlbase.com/?token=${KEYS.crawlbase}&scraper=${scraper}&url=${encodeURIComponent(page)}`, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      const j = await r.json();
      const body = j.body || j;
      posts = body.posts || body.feed || body.timeline || [];
    }
    // diagnóstico por perfil (vai para social-status.json): onde se perdem os posts de cada mercado
    const diag = { net, tentativas, recebidos: posts.length, video: 0, semCodigo: 0, semImagem: 0, aproveitados: 0 };
    (STATUS.crawlbasePerfis ??= {})[market + (net === 'fb' ? ' (fb)' : '')] = diag;
    for (const p of posts) {
      const link = p.link || p.url || p.postUrl || '';
      const code = (link.match(/\/(?:p|reel|posts)\/([^/?]+)/) || [])[1] || p.id || p.shortcode;
      if (!code) { diag.semCodigo++; continue; }
      if (/video|reel/i.test(String(p.type || p.mediaType || '')) || /\/reel\//.test(link)) { diag.video++; continue; }
      // sem data na resposta, conta como recente: a validade impressa no jornal decide se vale
      // o Crawlbase não manda a data: sai do código do post (instagram-data.mjs), sem custo
      const real = toIso(p.dateTime || p.date || p.timestamp || p.postDate || p.publishedAt) || findWhen(p) || (net === 'ig' ? dataDoCodigo(code) : null);
      const imgs = findImages(p);
      if (!imgs.length) diag.semImagem++; else diag.aproveitados++;
      out.push({ market, net, code, when: real || new Date().toISOString(), noDate: !real, link: link || page, images: imgs, owner: net === 'ig' ? '@' + m.ig : market });
    }
    await sleep(1500);
  }
  return out;
}

// ---------- pré-checagem grátis (Instagram público, sem login) ----------
const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
// "Photo by X on November 16, 2026." (inglês) ou "... 16 de novembro de 2026" (português) -> 'AAAA-MM-DD'
function dateOfAlt(alt) {
  const s = String(alt || '').toLowerCase();
  let m = s.match(/\bon ([a-zç]+) (\d{1,2}),? (\d{4})/), d, mo, y;
  if (m) { mo = MESES[m[1]]; d = +m[2]; y = +m[3]; }
  else if ((m = s.match(/(\d{1,2}) de ([a-zç]+)(?: de)? (\d{4})/))) { mo = MESES[m[2]]; d = +m[1]; y = +m[3]; }
  return mo ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
// Devolve { handle: { ok, posts: [{ code, date }], latest } }; ok:false quando não deu para ler (aí o serviço é chamado)
async function precheck(handles) {
  const out = {};
  let browser;
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1200, height: 1000 } });
    for (const h of handles) {
      const page = await ctx.newPage();
      try {
        await page.goto(`https://www.instagram.com/${h}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('a[href*="/p/"]', { timeout: 10000 }).catch(() => {});
        const raw = await page.evaluate(() => [...document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map((a) => ({ h: a.getAttribute('href'), alt: a.querySelector('img')?.alt || '' })));
        const posts = raw.map((r) => ({ code: (r.h.match(/\/(?:p|reel)\/([^/?]+)/) || [])[1], date: dateOfAlt(r.alt), video: /\/reel\//.test(r.h) || /^video by/i.test(r.alt) })).filter((p) => p.code);
        const dates = posts.map((p) => p.date).filter(Boolean).sort();
        // sem posts, ou nenhum com data legível: página bloqueada ou mudou -> não confiar
        out[h] = posts.length && dates.length ? { ok: true, posts, latest: dates[dates.length - 1] } : { ok: false, motivo: posts.length ? 'sem data no texto alternativo' : 'nenhum post visível (login/bloqueio?)' };
      } catch (e) { out[h] = { ok: false, motivo: String(e.message).slice(0, 100) }; }
      await page.close();
      await sleep(1500);
    }
  } catch (e) { for (const h of handles) out[h] ??= { ok: false, motivo: 'navegador indisponível: ' + String(e.message).slice(0, 80) }; }
  finally { await browser?.close().catch(() => {}); }
  return out;
}
// Há post novo? Sem estado anterior ou sem leitura válida: sim (chama o serviço). Post antigo que só entrou na janela
// dos 12 (apagaram um mais novo) não conta: exige código não visto E data >= último visto. Vídeo/reel não conta (o coletor ignora vídeo).
function hasNew(res, state) {
  if (!res?.ok || !state) return true;
  const seen = new Set(state.codes || []);
  return res.posts.some((p) => !p.video && !seen.has(p.code) && (!p.date || p.date >= state.latest));
}
const vistos = readJson(VISTOS, {});
let PRE = {}; // resultado da pré-checagem desta rodada, por handle

// ---------- cadeia de reserva ----------
const SERVICES = [['apify', apify], ['brightdata', brightdata], ['scrapecreators', scrapecreators], ['socialcrawl', socialcrawl], ['crawlbase', crawlbase]];
// SOCIAL_SKIP=apify,brightdata pula serviços (para testar as reservas)
const STATUS = { em: new Date().toISOString(), servicos: [] };
const SKIP = new Set(String(process.env.SOCIAL_SKIP || '').split(',').map((x) => x.trim()).filter(Boolean));
async function collect(net) {
  // perfis de bairro do Instagram só entram se a pré-checagem achou post novo
  TARGETS = Object.fromEntries(Object.entries(MARKETS).filter(([, m]) => (net === 'ig' ? m.ig : m.fb) && (net !== 'ig' || m.segment !== 'bairro' || hasNew(PRE[m.ig], vistos[m.ig]))));
  if (!Object.keys(TARGETS).length) { console.log(`  ${net === 'ig' ? 'instagram' : 'facebook'}: nenhum perfil para consultar`); return []; }
  if (MOCK) return readJson(MOCK, []).filter((p) => p.net === net && TARGETS[p.market] && recent(p.when)).map((p) => ({ ...p, via: 'mock' }));
  for (const [name, fn] of SERVICES) {
    if (!KEYS[name] || SKIP.has(name)) continue;
    try {
      const posts = (await fn(net)).filter((p) => p.market && recent(p.when));
      console.log(`  ${net === 'ig' ? 'instagram' : 'facebook'}: ${name} trouxe ${posts.length} posts recentes`);
      STATUS.servicos.push({ net, name, posts: posts.length });
      if (posts.length) return posts.map((p) => ({ ...p, via: name }));
    } catch (e) {
      console.warn(`  ${net === 'ig' ? 'instagram' : 'facebook'}: ${name} falhou (${e.message}); tentando o próximo`);
      STATUS.servicos.push({ net, name, erro: String(e.message).slice(0, 200) });
    }
  }
  return [];
}

const endOfDay = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 2, 59, 59)).toISOString(); };
// Jornal diário: o STUK posta o jornal à tarde/noite da véspera do dia impresso. Usar o dia do post fazia
// todo jornal chegar vencido à coleta da madrugada (STUK com 0 itens). Post a partir das 12h (Brasília)
// vale até o fim do dia seguinte; antes disso, até o fim do próprio dia.
const dailyUntil = (iso) => {
  const t = new Date(iso).getTime();
  const horaBrt = new Date(t - 3 * 3600e3).getUTCHours();
  return endOfDay(new Date(t + (horaBrt >= 12 ? 24 * 3600e3 : 0)).toISOString());
};
// Pré-checagem dos perfis de bairro (grátis). SOCIAL_SEM_PRECHECK=1 desliga (volta a chamar o serviço sempre).
const bairroHandles = Object.values(MARKETS).filter((m) => m.segment === 'bairro' && m.ig).map((m) => m.ig);
if (bairroHandles.length && !process.env.SOCIAL_SEM_PRECHECK) {
  PRE = await precheck(bairroHandles);
  for (const [market, m] of Object.entries(MARKETS)) {
    if (m.segment !== 'bairro' || !m.ig) continue;
    const r = PRE[m.ig];
    const novo = hasNew(r, vistos[m.ig]);
    console.log(`  pré-checagem ${m.ig}: ${r.ok ? `${r.posts.length} posts, último ${r.latest}` : `falhou (${r.motivo})`} -> ${novo ? 'consultar serviço' : 'sem post novo, não gasta crédito'}`);
  }
}
if (process.env.SOCIAL_PRECHECK_ONLY) { console.log(JSON.stringify(PRE, null, 1)); process.exit(0); }

const dm = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const manifest = [], manifestTeste = [];
const calledIg = new Set(Object.values(MARKETS).filter((m) => m.ig && m.segment === 'bairro').map((m) => m.ig));
const igPosts = await collect('ig');
const calledNow = new Set(Object.values(TARGETS).map((m) => m.ig)); // quem o serviço consultou de fato
for (const p of [...igPosts, ...(await collect('fb'))]) {
  const m = MARKETS[p.market];
  const images = [...new Set(p.images.filter((u) => typeof u === 'string' && /^https?:/.test(u)))].slice(0, 12);
  if (!images.length || !p.code) continue;
  // jornal diário (STUK) sem data do post não entra: não dá para saber de que dia é
  if (m.daily && p.noDate) continue;
  const rede = p.net === 'ig' ? 'Instagram' : 'Facebook';
  const bairro = m.segment === 'bairro';
  const entry = {
    market: p.market, offerId: `${p.net}-${p.code}`, validFrom: null,
    validUntil: m.daily ? dailyUntil(p.when) : null, // os outros precisam da validade impressa na imagem
    validityNote: m.daily ? 'jornal de ofertas do dia' : bairro ? `post do ${rede} de ${dm(p.when)}` : `post de ofertas (${rede})`,
    // Bairro sem data impressa na arte: vale até o fim do 3º dia após o post. O leitor deve usar só se a arte não tiver
    // validade (ver relatório: readers/folheto.mjs precisa ler fallbackUntil/fallbackNote e repassar segment).
    ...(bairro && !p.noDate ? { fallbackUntil: endOfDay(new Date(Date.parse(p.when) + SEM_VALIDADE_DIAS * 86400e3).toISOString()), fallbackNote: `post de ${dm(p.when)}, sem validade impressa` } : {}),
    ...(bairro ? { segment: m.segment, cidades: m.cidades } : {}),
    stores: [p.market], storeScope: `Ofertas publicadas no ${rede} ${p.owner || p.market}`,
    via: p.via, link: p.link, images, imageKeys: images.map((_, i) => `${p.net}:${p.code}:${i}`), collectedAt: new Date().toISOString(),
  };
  (m.teste ? manifestTeste : manifest).push(entry);
}
// Guarda o que a pré-checagem viu, só dos perfis que o serviço consultou nesta rodada com resposta, ou dos que não tinham novidade
if (igPosts.length || MOCK) {
  for (const h of calledIg) if (calledNow.has(h) && PRE[h]?.ok) vistos[h] = { latest: PRE[h].latest, codes: PRE[h].posts.map((x) => x.code), checkedAt: new Date().toISOString() };
}
for (const h of calledIg) if (!calledNow.has(h) && PRE[h]?.ok && vistos[h]) vistos[h].checkedAt = new Date().toISOString();
if (Object.keys(vistos).length) fs.writeFileSync(VISTOS, JSON.stringify(vistos, null, 1));
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
fs.writeFileSync(OUT_TESTE, JSON.stringify(manifestTeste, null, 2));
// SOCIAL_TEST=socialcrawl,crawlbase: chama esses serviços à parte só para diagnóstico (não entram no resultado)
for (const name of String(process.env.SOCIAL_TEST || '').split(',').map((x) => x.trim()).filter(Boolean)) {
  const fn = SERVICES.find(([n]) => n === name)?.[1];
  if (!fn || !KEYS[name]) { STATUS.servicos.push({ teste: name, erro: 'sem chave ou serviço desconhecido' }); continue; }
  try { const ps = await fn('ig'); STATUS.servicos.push({ teste: name, net: 'ig', exemploData: ps[0]?.when ?? null, posts: ps.length, recentes: ps.filter((p) => recent(p.when)).length, comImagem: ps.filter((p) => p.images.length).length }); }
  catch (e) { STATUS.servicos.push({ teste: name, net: 'ig', erro: String(e.message).slice(0, 200) }); }
}
fs.writeFileSync(OUT.replace('social-encartes.json', 'social-status.json'), JSON.stringify(STATUS, null, 1));
const by = manifest.reduce((acc, x) => ((acc[x.market] = (acc[x.market] || 0) + x.images.length), acc), {});
console.log(`social: ${manifest.length} posts com imagem`, JSON.stringify(by));
