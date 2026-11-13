// Completa o EAN dos produtos do Extra. A busca da API não traz o código; a página de cada produto traz
// ("product":{"id":41329,...,"ean":"7896006711155"} e o gtin do JSON-LD).
// Cada produto é consultado uma vez só: o resultado fica em data/extraido/extra-ean.json (versionado),
// { "<id>": "<ean>" ou "" (página sem EAN) }. Teto por rodada: a primeira carga se completa em alguns dias.
// Falha ou bloqueio só deixa o produto sem EAN; nunca derruba a coleta.
// Uso avulso (preenche o extra.json já salvo): node collectors/extra-ean.mjs
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CACHE = fileURLToPath(new URL('../data/extraido/extra-ean.json', import.meta.url));
const MAX = Number(process.env.EXTRA_EAN_MAX || 1500);
const PAUSE_MS = 700;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// EAN do próprio produto da página (confere o id), com o gtin do JSON-LD como reserva
export function eanFromPage(html, id) {
  const m = html.match(new RegExp(`"product":\\{"id":${id},[^{}]*?"ean":"(\\d{8,14})"`));
  if (m) return m[1];
  const g = html.match(/"gtin(?:8|12|13|14)?"\s*:\s*"(\d{8,14})"/);
  return g ? g[1] : null;
}

export async function fillEans(rows, { log = console.log } = {}) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const todo = rows.filter((r) => !(r.externalId in cache) && r.productUrl);
  let found = 0, requests = 0, stop = null;
  for (const r of todo.slice(0, MAX)) {
    await sleep(PAUSE_MS);
    requests++;
    let res;
    try {
      res = await fetch(r.productUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
    } catch (e) { stop = `rede: ${e.message}`; break; }
    if (res.status === 403 || res.status === 429) { stop = `bloqueio HTTP ${res.status}`; break; }
    if (!res.ok) continue; // tenta de novo na próxima rodada
    const ean = eanFromPage(await res.text(), r.externalId);
    cache[r.externalId] = ean ?? '';
    if (ean) found++;
  }
  for (const r of rows) r.ean = cache[r.externalId] || null;
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  const com = rows.filter((r) => r.ean).length;
  log(`EAN do Extra: ${found} novos em ${requests} páginas; ${com} de ${rows.length} com EAN; faltam ${Math.max(0, todo.length - requests)}${stop ? ` (parou: ${stop})` : ''}`);
  return { found, requests, stop };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = fileURLToPath(new URL('../data/extraido/extra.json', import.meta.url));
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  await fillEans(rows);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}
