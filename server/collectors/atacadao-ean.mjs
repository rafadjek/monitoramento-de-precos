// Completa o EAN dos produtos do Atacadão pela API pública de catálogo da VTEX (a mesma que o site usa).
// Lotes de 50 SKUs, pausa de 1,1 s. Falha ou bloqueio só deixa o produto sem EAN; nunca derruba a coleta.
// Uso avulso (preenche o atacadao.json já salvo): node collectors/atacadao-ean.mjs
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = 'https://www.atacadao.com.br';
const BATCH = 50;
const PAUSE_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fillEans(rows, { log = console.log } = {}) {
  const missing = rows.filter((r) => !r.ean);
  const bySku = new Map(missing.map((r) => [String(r.externalId), r]));
  const skus = [...bySku.keys()];
  let found = 0, requests = 0, stop = null;
  for (let i = 0; i < skus.length; i += BATCH) {
    const part = skus.slice(i, i + BATCH);
    const qs = part.map((s) => `fq=skuId:${encodeURIComponent(s)}`).join('&');
    await sleep(PAUSE_MS);
    requests++;
    let res;
    try {
      res = await fetch(`${BASE}/api/catalog_system/pub/products/search?${qs}&_from=0&_to=${BATCH - 1}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', Accept: 'application/json' },
      });
    } catch (e) { stop = `rede: ${e.message}`; break; }
    if (res.status === 403 || res.status === 429) { stop = `bloqueio HTTP ${res.status}`; break; }
    if (!res.ok && res.status !== 206) continue;
    const products = await res.json().catch(() => []);
    for (const p of products) for (const it of p.items || []) {
      const r = bySku.get(String(it.itemId));
      if (r && it.ean && !r.ean) { r.ean = String(it.ean).trim(); found++; }
    }
  }
  for (const r of rows) if (!('ean' in r)) r.ean = null;
  log(`EAN do Atacadão: ${found} de ${missing.length} completados em ${requests} requisições${stop ? ` (parou: ${stop})` : ''}`);
  return { found, missing: missing.length, requests, stop };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = fileURLToPath(new URL('../data/extraido/atacadao.json', import.meta.url));
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  // mantém a ordem de campos dos coletores: ean logo depois de brand
  const shaped = rows.map(({ market, externalId, name, brand, ean = null, ...rest }) => ({ market, externalId, name, brand, ean, ...rest }));
  await fillEans(shaped);
  fs.writeFileSync(file, JSON.stringify(shaped, null, 1));
}
