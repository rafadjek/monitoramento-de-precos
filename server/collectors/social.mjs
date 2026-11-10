// Jornais de ofertas que só saem no Instagram (Nevada, STUK, Lourencini), lidos pela Apify.
// Decisão do Rafael em 10/11/2026: usar a Apify (crédito grátis mensal) mesmo sabendo que a coleta automática
// contraria os termos da Meta. Nenhuma conta pessoal é usada: a Apify acessa sem login, com a infraestrutura dela.
// Pede só os posts dos últimos 2 dias de cada perfil (poucos resultados = cabe no crédito grátis).
// Grava data/extraido/social-encartes.json para readers/folheto.mjs. Sem APIFY_TOKEN, não faz nada.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/social-encartes.json', import.meta.url));
const TOKEN = process.env.APIFY_TOKEN;
const ACTOR = 'apify~instagram-post-scraper';
// perfil -> mercado. STUK: o próprio site diz que sai um jornal novo por dia, então vale no dia do post.
const PROFILES = {
  redenevada: { market: 'Nevada', daily: false },
  supermercadostuk: { market: 'STUK', daily: true },
  lourencinisupermercados: { market: 'Lourencini', daily: false },
};
if (!TOKEN) { console.log('social: sem APIFY_TOKEN, pulando'); process.exit(0); }

const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}&timeout=240`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: Object.keys(PROFILES), resultsLimit: 8, onlyPostsNewerThan: '2 days' }),
  signal: AbortSignal.timeout(300000),
});
if (!r.ok) { console.error(`social: Apify HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const posts = await r.json();
// registro por perfil: quantos posts vieram e de que tipo (ajuda a conferir a coleta)
for (const u of Object.keys(PROFILES)) {
  const mine = (Array.isArray(posts) ? posts : []).filter((p) => String(p.ownerUsername || '').toLowerCase() === u);
  console.log(`  @${u}: ${mine.length} posts (${mine.map((p) => p.type).join(', ') || 'nenhum'})`);
}

// fim do dia do post em Brasília
const endOfDay = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 2, 59, 59)).toISOString(); };
const manifest = [];
for (const p of Array.isArray(posts) ? posts : []) {
  const prof = PROFILES[String(p.ownerUsername || '').toLowerCase()];
  if (!prof || !p.timestamp) continue;
  // só imagem (carrossel: todas as fotos); vídeo/reels não têm o jornal legível
  const imgs = [...(p.childPosts || []).filter((c) => c.type !== 'Video').map((c) => c.displayUrl), ...(p.images || [])]
    .filter(Boolean);
  if (!imgs.length && p.type !== 'Video' && p.displayUrl) imgs.push(p.displayUrl);
  const images = [...new Set(imgs)].slice(0, 10);
  if (!images.length) continue;
  const code = p.shortCode || p.id;
  manifest.push({
    market: prof.market,
    offerId: `ig-${code}`,
    validFrom: null,
    // jornal diário (STUK) vale no dia do post; os outros precisam da validade impressa na imagem
    validUntil: prof.daily ? endOfDay(p.timestamp) : null,
    validityNote: prof.daily ? 'jornal de ofertas do dia (Instagram)' : 'post de ofertas no Instagram',
    stores: [prof.market],
    storeScope: `Ofertas publicadas no Instagram @${p.ownerUsername}`,
    link: p.url || `https://www.instagram.com/p/${code}/`,
    images,
    imageKeys: images.map((_, i) => `ig:${code}:${i}`),
    collectedAt: new Date().toISOString(),
  });
}
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
const by = manifest.reduce((m, x) => ((m[x.market] = (m[x.market] || 0) + x.images.length), m), {});
console.log(`social: ${posts.length} posts, ${manifest.length} com imagem`, JSON.stringify(by));
