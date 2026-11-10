// Roldão Atacadista: as ofertas só existem como encarte. A página /ofertas/ lista campanhas (cartões do
// JetEngine) com título, período ("09.11 a 11.11") e, às vezes, "Exclusivamente nas lojas: ...".
// Entram as campanhas que citam Mauá ou que não restringem lojas (valem para a rede). O encarte inteiro
// é um PDF, cujo endereço o próprio site pede em admin-ajax.php (action=elem_get_pdf_oferta_iframe).
// O Roldão não tem loja em Ribeirão Pires. Grava data/extraido/roldao-encartes.json para readers/folheto.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/roldao-encartes.json', import.meta.url));
const BASE = 'https://roldao.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u, opt = {}) => fetch(u, { ...opt, headers: { 'User-Agent': UA, Referer: `${BASE}/ofertas/`, ...(opt.headers || {}) }, signal: AbortSignal.timeout(45000) });

const r = await get(`${BASE}/ofertas/`);
if (!r.ok) { console.error(`roldao: HTTP ${r.status}`); process.exit(1); }
const html = await r.text();
const now = new Date();
// "09.11" -> fim do dia em Brasília; ano corrente, ou o seguinte se a data já passou há mais de 2 meses (virada de ano)
const endOf = (dm) => {
  const [d, m] = dm.split('.').map(Number);
  let y = now.getUTCFullYear();
  if (m < now.getUTCMonth() + 1 - 2) y++;
  return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59)).toISOString();
};

const cards = html.split('jet-listing-grid__item ').slice(1).map((p) => ({
  id: (p.match(/data-post-id="(\d+)"/) || [])[1],
  title: ((p.match(/dynamic-field__content" ?>([^<]+)/) || [])[1] || '').trim(),
  period: ((p.match(/periodo-oferta">([^<]+)/) || [])[1] || '').trim(),
  stores: ((p.match(/Exclusivamente nas lojas:([^<]+)/) || [])[1] || '').trim(),
})).filter((c) => c.id && c.title && /\d{2}\.\d{2}/.test(c.period));

const manifest = [];
for (const c of cards) {
  const forMaua = !c.stores || /mau[aá]/i.test(c.stores);
  if (!forMaua) { console.log(`fora (lojas: ${c.stores.slice(0, 60)}...): ${c.title}`); continue; }
  const dates = c.period.match(/\d{2}\.\d{2}/g);
  const validUntil = endOf(dates[dates.length - 1]);
  if (Date.parse(validUntil) < now) continue;
  await sleep(1200);
  const a = await get(`${BASE}/wp-admin/admin-ajax.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `action=elem_get_pdf_oferta_iframe&post_id=${c.id}`,
  }).then((x) => x.json()).catch(() => null);
  const pdf = a?.success && a.data?.url;
  if (!pdf) { console.warn(`sem PDF: ${c.title}`); continue; }
  manifest.push({
    market: 'Roldão',
    offerId: `${c.id}-${dates.join('-')}`,
    validFrom: null,
    validUntil,
    validityNote: `${c.title}: ${c.period}`,
    stores: c.stores ? ['Roldão Mauá'] : ['todas as lojas Roldão'],
    storeScope: c.stores ? `Encarte "${c.title}" das lojas que incluem Mauá` : `Encarte "${c.title}" da rede (vale em Mauá)`,
    referer: `${BASE}/ofertas/`,
    images: [pdf],
    collectedAt: now.toISOString(),
  });
  console.log(`entra: ${c.title} (${c.period}) ${pdf}`);
}
if (!manifest.length) { console.error('roldao: nenhuma campanha para Mauá'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`roldao: ${manifest.length} encartes`);
