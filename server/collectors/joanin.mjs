// Joanin Supermercados: o site só publica o tabloide em imagens, na página /ofertas/.
// Os arquivos seguem o padrão pagN-full-tabloide[-NOME]-DDMMAAAA-DDMMAAAA[-sufixo].jpg; a segunda data é o fim
// da validade. Entram só os vigentes; o tabloide de drogarias fica de fora (é a farmácia, não o mercado).
// Grava o manifesto data/extraido/joanin-encartes.json; quem lê preços é readers/folheto.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/joanin-encartes.json', import.meta.url));
const BASE = 'https://www.joanin.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const r = await fetch(`${BASE}/ofertas/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) });
if (!r.ok) { console.error(`joanin: HTTP ${r.status}`); process.exit(1); }
const html = await r.text();
const RE = /https?:\/\/www\.joanin\.com\.br\/wp-content\/uploads\/[0-9/]+pag(\d+)-full-tabloide-((?:[A-Za-z]+-)?)(\d{8})-(\d{8})(-[a-z]+)?\.(?:jpe?g|png|webp)/g;
const dmy = (s) => ({ d: +s.slice(0, 2), m: +s.slice(2, 4), y: +s.slice(4) });
// fim do dia em Brasília (23:59:59 -03:00)
const endIso = (s) => { const { d, m, y } = dmy(s); return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59)).toISOString(); };
const now = Date.now();
const byOffer = new Map();
for (const m of html.matchAll(RE)) {
  const [url, page, name, , end, suffix] = m;
  if (/drogaria/i.test(suffix || '') || /drogaria/i.test(name)) continue;
  const validUntil = endIso(end);
  if (Date.parse(validUntil) < now) continue;
  const offerId = `tabloide-${name}${end}`;
  const o = byOffer.get(offerId) ?? byOffer.set(offerId, { validUntil, pages: new Map() }).get(offerId);
  o.pages.set(+page, url.replace(/^http:/, 'https:'));
}
const manifest = [...byOffer].map(([offerId, o]) => ({
  market: 'Joanin',
  offerId,
  validFrom: null, // a data de início do nome do arquivo às vezes vem trocada; vale a impressa na imagem
  validUntil: o.validUntil,
  validityNote: `tabloide válido até ${new Date(o.validUntil).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  stores: ['Joanin Mauá', 'Joanin Ribeirão Pires'],
  storeScope: 'Tabloide das lojas Joanin (vale para as lojas de Mauá e Ribeirão Pires)',
  referer: `${BASE}/ofertas/`,
  images: [...o.pages].sort((a, b) => a[0] - b[0]).map(([, u]) => u),
  collectedAt: new Date().toISOString(),
}));
if (!manifest.length) { console.error('joanin: nenhum tabloide vigente'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`joanin: ${manifest.length} tabloide(s), ${manifest.reduce((n, x) => n + x.images.length, 0)} páginas`);
