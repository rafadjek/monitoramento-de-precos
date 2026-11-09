// Baronesa Supermercados (loja única, Mauá): o site só publica o encarte em imagens.
// A página /encarte faz POST em /classes/encarte.php, que devolve as <img> das páginas vigentes.
// Grava o manifesto data/extraido/baronesa-encartes.json; quem lê preços e validade é readers/folheto.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/baronesa-encartes.json', import.meta.url));
const BASE = 'https://baronesasupermercados.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const r = await fetch(`${BASE}/classes/encarte.php`, {
  method: 'POST', headers: { 'User-Agent': UA, Referer: `${BASE}/encarte/`, 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(45000),
});
if (!r.ok) { console.error(`baronesa: HTTP ${r.status}`); process.exit(1); }
const html = await r.text();
const images = [...html.matchAll(/<img[^>]+src=['"]([^'"]*encarte\.php\?img=[^'"]+)['"]/gi)]
  .map((m) => new URL(m[1].replace(/&amp;/g, '&'), BASE).href)
  // o parâmetro v muda sem a imagem mudar; o id da imagem basta para o cache de leitura
  .map((u) => { const x = new URL(u); x.searchParams.delete('v'); return x.href; });
if (!images.length) { console.error('baronesa: nenhuma imagem de encarte encontrada'); process.exit(1); }

const manifest = [{
  market: 'Baronesa',
  offerId: 'encarte-' + new Date().toISOString().slice(0, 10),
  validFrom: null, validUntil: null, // impressas nas imagens; o leitor lê
  validityNote: 'ofertas do encarte, enquanto durarem os estoques',
  stores: ['Baronesa Mauá (R. Fernão Dias, 5)'],
  storeScope: 'Encarte da loja de Mauá (R. Fernão Dias, 5, Vila Augusto)',
  referer: `${BASE}/encarte/`,
  images: [...new Set(images)],
  collectedAt: new Date().toISOString(),
}];
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`baronesa: ${manifest[0].images.length} páginas de encarte`);
