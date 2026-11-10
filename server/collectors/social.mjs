// Jornais de ofertas que só saem no Instagram e no Facebook (Nevada, STUK, Lourencini).
// Decisão do Rafael em 10/11/2026: usar serviços de coleta (planos grátis) mesmo sabendo que a coleta automática
// contraria os termos da Meta. Nenhuma conta pessoal é usada: os serviços acessam sem login, com a infraestrutura deles.
// Cadeia de reserva, separada para Instagram e Facebook: Apify -> Bright Data -> ScrapeCreators -> SocialCrawl (só Instagram). Cada serviço só entra
// se a chave dele existir (APIFY_TOKEN, BRIGHTDATA_TOKEN, SCRAPECREATORS_KEY) e passa a vez se falhar
// (crédito acabou, bloqueio, erro) ou não trouxer nada.
// Pega os posts dos últimos 3 dias; post já lido não é lido de novo (cache pelo código do post) e jornal vencido
// é descartado pela validade impressa. Grava data/extraido/social-encartes.json para readers/folheto.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/social-encartes.json', import.meta.url));
const DAYS = 7; // o Lourencini posta com menos frequência; com 6 posts por perfil o custo diário fica parecido com 3 dias x 12
const SINCE = Date.now() - DAYS * 86400e3;
const KEYS = { apify: process.env.APIFY_TOKEN, brightdata: process.env.BRIGHTDATA_TOKEN, scrapecreators: process.env.SCRAPECREATORS_KEY, socialcrawl: process.env.SOCIALCRAWL_KEY };
// STUK: o próprio site diz que sai um jornal novo por dia, então vale no dia do post.
const MARKETS = {
  Nevada: { ig: 'redenevada', fb: 'https://www.facebook.com/redenevada/', daily: false },
  STUK: { ig: 'supermercadostuk', fb: null, daily: true },
  Lourencini: { ig: 'lourencinisupermercados', fb: 'https://www.facebook.com/LourenciniSupermercados/', daily: false },
};
if (!Object.values(KEYS).some(Boolean)) { console.log('social: nenhuma chave de serviço, pulando'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toIso = (t) => { if (t == null || t === '') return null; const n = Number(t); const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(t); return isNaN(d) ? null : d.toISOString(); };
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
    ? { username: Object.values(MARKETS).map((m) => m.ig), resultsLimit: 6, onlyPostsNewerThan: `${DAYS} days` }
    : { startUrls: Object.values(MARKETS).filter((m) => m.fb).map((m) => ({ url: m.fb })), resultsLimit: 6, onlyPostsNewerThan: `${DAYS} days` };
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
  const urls = net === 'ig' ? Object.values(MARKETS).map((m) => `https://www.instagram.com/${m.ig}/`) : Object.values(MARKETS).filter((m) => m.fb).map((m) => m.fb);
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
  for (const [market, m] of Object.entries(MARKETS)) {
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
  for (const [market, m] of Object.entries(MARKETS)) {
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
      out.push({ market, net, code, when: toIso(p.taken_at || p.timestamp || p.created_at || p.published_at), link: p.url || p.permalink || `https://www.instagram.com/p/${code}/`, images: images.length ? images : findImages(p), owner: '@' + m.ig });
    }
    await sleep(1000);
  }
  return out;
}

// ---------- cadeia de reserva ----------
const SERVICES = [['apify', apify], ['brightdata', brightdata], ['scrapecreators', scrapecreators], ['socialcrawl', socialcrawl]];
// SOCIAL_SKIP=apify,brightdata pula serviços (para testar as reservas)
const SKIP = new Set(String(process.env.SOCIAL_SKIP || '').split(',').map((x) => x.trim()).filter(Boolean));
async function collect(net) {
  for (const [name, fn] of SERVICES) {
    if (!KEYS[name] || SKIP.has(name)) continue;
    try {
      const posts = (await fn(net)).filter((p) => p.market && recent(p.when));
      console.log(`  ${net === 'ig' ? 'instagram' : 'facebook'}: ${name} trouxe ${posts.length} posts recentes`);
      if (posts.length) return posts.map((p) => ({ ...p, via: name }));
    } catch (e) {
      console.warn(`  ${net === 'ig' ? 'instagram' : 'facebook'}: ${name} falhou (${e.message}); tentando o próximo`);
    }
  }
  return [];
}

const endOfDay = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 2, 59, 59)).toISOString(); };
const manifest = [];
for (const p of [...(await collect('ig')), ...(await collect('fb'))]) {
  const m = MARKETS[p.market];
  const images = [...new Set(p.images.filter((u) => typeof u === 'string' && /^https?:/.test(u)))].slice(0, 12);
  if (!images.length || !p.code) continue;
  manifest.push({
    market: p.market, offerId: `${p.net}-${p.code}`, validFrom: null,
    validUntil: m.daily ? endOfDay(p.when) : null, // os outros precisam da validade impressa na imagem
    validityNote: m.daily ? 'jornal de ofertas do dia' : `post de ofertas (${p.net === 'ig' ? 'Instagram' : 'Facebook'})`,
    stores: [p.market], storeScope: `Ofertas publicadas no ${p.net === 'ig' ? 'Instagram' : 'Facebook'} ${p.owner || p.market}`,
    via: p.via, link: p.link, images, imageKeys: images.map((_, i) => `${p.net}:${p.code}:${i}`), collectedAt: new Date().toISOString(),
  });
}
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
const by = manifest.reduce((acc, x) => ((acc[x.market] = (acc[x.market] || 0) + x.images.length), acc), {});
console.log(`social: ${manifest.length} posts com imagem`, JSON.stringify(by));
