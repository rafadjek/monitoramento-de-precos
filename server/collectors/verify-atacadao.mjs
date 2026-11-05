import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openSession } from './atacadao.mjs';

const OUT_DIR = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const FIELDS = ['market', 'externalId', 'name', 'brand', 'size', 'price', 'listPrice', 'unitPrice', 'category', 'categoryRaw', 'imageUrl', 'productUrl', 'validFrom', 'validUntil', 'validityNote', 'storeScope', 'collectedAt'];
const rows = JSON.parse(fs.readFileSync(OUT_DIR + 'atacadao.json', 'utf8'));
const problems = [];
const ids = new Set();
for (const r of rows) {
  const keys = Object.keys(r);
  if (keys.length !== FIELDS.length || !FIELDS.every((f) => f in r)) problems.push(`campos errados em ${r.externalId}`);
  if (typeof r.price !== 'number' || !(r.price > 0)) problems.push(`preço inválido em ${r.externalId}`);
  if (r.listPrice !== null && typeof r.listPrice !== 'number') problems.push(`listPrice inválido em ${r.externalId}`);
  if (!r.name) problems.push(`sem nome ${r.externalId}`);
  if (!['alimenticios', 'higiene', 'limpeza', 'outros'].includes(r.category)) problems.push(`categoria inválida ${r.externalId}`);
  if (ids.has(r.externalId)) problems.push(`duplicado ${r.externalId}`);
  ids.add(r.externalId);
}
const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
const stats = { total: rows.length, byCat, comImagem: rows.filter((r) => r.imageUrl).length, comValidade: rows.filter((r) => r.validUntil).length, comListPrice: rows.filter((r) => r.listPrice).length, problems: problems.length };
console.log('ESTRUTURA', JSON.stringify(stats), problems.slice(0, 5));

// 5 produtos aleatórios (semente fixa por data para reproduzir) comparados com a página do site
const pick = [];
const pool = [...rows];
for (let i = 0; i < 5; i++) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
const s = await openSession();
const checks = [];
for (const r of pick) {
  await new Promise((x) => setTimeout(x, 1200));
  await s.page.goto(r.productUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await s.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await s.page.waitForTimeout(1500);
  const text = (await s.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const h1 = (await s.page.locator('h1').first().innerText().catch(() => '')).trim();
  const priceStr = r.price.toFixed(2).replace('.', ',');
  const nameOk = h1.toLowerCase() === r.name.toLowerCase() || text.toLowerCase().includes(r.name.toLowerCase());
  const priceOk = text.includes(priceStr);
  checks.push({ id: r.externalId, name: r.name, price: r.price, h1, nameOk, priceOk });
  console.log(nameOk && priceOk ? 'OK ' : 'DIF', r.externalId, '|', r.name, '| R$', priceStr, '| h1:', h1);
}
await s.browser.close();
fs.writeFileSync(OUT_DIR + 'atacadao.verificacao.json', JSON.stringify({ stats, problems: problems.slice(0, 20), checks, verifiedAt: new Date().toISOString() }, null, 1));
