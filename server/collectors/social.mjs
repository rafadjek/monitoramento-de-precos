// Jornais de ofertas que só saem no Instagram e no Facebook (Nevada, STUK, Lourencini), lidos pela Apify.
// Decisão do Rafael em 10/11/2026: usar a Apify (crédito grátis mensal) mesmo sabendo que a coleta automática
// contraria os termos da Meta. Nenhuma conta pessoal é usada: a Apify acessa sem login, com a infraestrutura dela.
// Pega os posts dos últimos 3 dias (o jornal nem sempre é o último post); post já lido não é lido de novo
// (cache pelo código do post) e jornal vencido é descartado pela validade impressa.
// Grava data/extraido/social-encartes.json para readers/folheto.mjs. Sem APIFY_TOKEN, não faz nada.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/social-encartes.json', import.meta.url));
const TOKEN = process.env.APIFY_TOKEN;
const DAYS = 3; // cada post volta no máximo 3 vezes (a Apify cobra por post devolvido); o jornal costuma ser de 0 a 2 dias atrás
// STUK: o próprio site diz que sai um jornal novo por dia, então vale no dia do post.
const MARKETS = {
  Nevada: { ig: 'redenevada', fb: 'https://www.facebook.com/redenevada/', daily: false },
  STUK: { ig: 'supermercadostuk', fb: null, daily: true },
  Lourencini: { ig: 'lourencinisupermercados', fb: 'https://www.facebook.com/LourenciniSupermercados/', daily: false },
};
if (!TOKEN) { console.log('social: sem APIFY_TOKEN, pulando'); process.exit(0); }

async function runActor(actor, input) {
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}&timeout=280`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(320000),
  });
  if (!r.ok) throw new Error(`${actor} HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// fim do dia do post em Brasília
const endOfDay = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 2, 59, 59)).toISOString(); };
const manifest = [];
const add = (market, net, code, when, link, images, owner) => {
  const m = MARKETS[market];
  images = [...new Set(images.filter(Boolean))].slice(0, 12);
  if (!images.length || !when) return;
  manifest.push({
    market, offerId: `${net}-${code}`, validFrom: null,
    validUntil: m.daily ? endOfDay(when) : null, // os outros precisam da validade impressa na imagem
    validityNote: m.daily ? 'jornal de ofertas do dia' : `post de ofertas (${net === 'ig' ? 'Instagram' : 'Facebook'})`,
    stores: [market], storeScope: `Ofertas publicadas no ${net === 'ig' ? 'Instagram' : 'Facebook'} ${owner}`,
    link, images, imageKeys: images.map((_, i) => `${net}:${code}:${i}`), collectedAt: new Date().toISOString(),
  });
};

const [ig, fb] = await Promise.allSettled([
  runActor('apify~instagram-post-scraper', { username: Object.values(MARKETS).map((m) => m.ig), resultsLimit: 12, onlyPostsNewerThan: `${DAYS} days` }),
  runActor('apify~facebook-posts-scraper', { startUrls: Object.values(MARKETS).filter((m) => m.fb).map((m) => ({ url: m.fb })), resultsLimit: 12, onlyPostsNewerThan: `${DAYS} days` }),
]);

if (ig.status === 'fulfilled') {
  const byIg = Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [v.ig, k]));
  for (const p of ig.value) {
    const market = byIg[String(p.ownerUsername || '').toLowerCase()];
    if (!market) continue;
    // só imagem (carrossel: todas as fotos); vídeo/reels não têm o jornal legível
    const imgs = [...(p.childPosts || []).filter((c) => c.type !== 'Video').map((c) => c.displayUrl), ...(p.images || [])];
    if (!imgs.length && p.type !== 'Video') imgs.push(p.displayUrl);
    const code = p.shortCode || p.id;
    add(market, 'ig', code, p.timestamp, p.url || `https://www.instagram.com/p/${code}/`, imgs, '@' + p.ownerUsername);
  }
  console.log(`  instagram: ${ig.value.length} posts`);
} else console.warn('  instagram falhou:', ig.reason?.message);

if (fb.status === 'fulfilled') {
  for (const p of fb.value) {
    const page = String(p.pageName || p.facebookUrl || p.inputUrl || p.url || '').toLowerCase();
    const market = Object.entries(MARKETS).find(([, v]) => v.fb && page.includes(v.fb.split('/')[3].toLowerCase()))?.[0];
    if (!market) continue;
    const media = Array.isArray(p.media) ? p.media : [];
    const imgs = media.map((x) => x?.photo_image?.uri || x?.image?.uri || x?.thumbnail || x?.url).filter((u) => typeof u === 'string' && /^https?:/.test(u));
    const code = p.postId || p.id || (p.url || '').split('/').filter(Boolean).pop();
    add(market, 'fb', code, p.time || p.timestamp, p.url || p.topLevelUrl, imgs, p.pageName || market);
  }
  console.log(`  facebook: ${fb.value.length} posts`);
} else console.warn('  facebook falhou:', fb.reason?.message);

if (ig.status === 'rejected' && fb.status === 'rejected') process.exit(1);
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
const by = manifest.reduce((m, x) => ((m[x.market] = (m[x.market] || 0) + x.images.length), m), {});
console.log(`social: ${manifest.length} posts com imagem`, JSON.stringify(by));
