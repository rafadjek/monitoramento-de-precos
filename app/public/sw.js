// Service worker do Bate Ofertas: deixa o site instalável e abrindo sem internet.
// - páginas e dados (data/*.json): busca na rede primeiro; sem rede, usa a última cópia guardada
// - arquivos do site com nome versionado (assets/), fontes, logos e ícones: guardados na primeira vez
// - imagens de outros sites (fotos dos mercados) não são guardadas
const CACHE = 'bate-ofertas-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'app.webmanifest', 'app-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('./')) || Response.error();
    return Response.error();
  }
};

const cacheFirst = async (req) => {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname.includes('/data/')) e.respondWith(networkFirst(req));
  else e.respondWith(cacheFirst(req));
});
