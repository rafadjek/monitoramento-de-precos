import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const dir = fileURLToPath(new URL('../data/extraido/', import.meta.url));
const data = JSON.parse(fs.readFileSync(dir + 'spani.json', 'utf8'));
const FIELDS = ['market', 'externalId', 'name', 'brand', 'size', 'price', 'listPrice', 'unitPrice', 'category', 'categoryRaw', 'imageUrl', 'productUrl', 'validFrom', 'validUntil', 'validityNote', 'storeScope', 'collectedAt'];
const problems = [];
const ids = new Set();
for (const p of data) {
  const keys = Object.keys(p);
  if (keys.length !== FIELDS.length || FIELDS.some((f) => !(f in p))) problems.push(`campos errados em ${p.externalId}`);
  if (!(typeof p.price === 'number' && p.price > 0)) problems.push(`preço inválido em ${p.externalId}`);
  if (p.listPrice !== null && !(typeof p.listPrice === 'number' && p.listPrice > p.price)) problems.push(`listPrice inválido em ${p.externalId}`);
  if (!p.name) problems.push(`sem nome ${p.externalId}`);
  if (!['alimenticios', 'higiene', 'limpeza', 'outros'].includes(p.category)) problems.push(`categoria ${p.externalId}`);
  if (!/^https:\/\//.test(p.productUrl)) problems.push(`url ${p.externalId}`);
  if (ids.has(p.externalId)) problems.push(`duplicado ${p.externalId}`);
  ids.add(p.externalId);
}
const byCat = {};
for (const p of data) byCat[p.category] = (byCat[p.category] || 0) + 1;
const stats = {
  total: data.length,
  porCategoria: byCat,
  comImagem: data.filter((p) => p.imageUrl).length,
  comValidade: data.filter((p) => p.validUntil).length,
  comTamanho: data.filter((p) => p.size).length,
  comListPrice: data.filter((p) => p.listPrice).length,
  multiCompra: data.filter((p) => /compra de \d+ ou mais/.test(p.validityNote)).length,
  problemas: problems.length,
};
console.log('ESTRUTURA', JSON.stringify(stats), problems.slice(0, 5));

// 5 produtos aleatórios, conferidos na página do site com a loja de Mauá selecionada
const pick = [...data].sort(() => Math.random() - 0.5).slice(0, 5);
const b = await chromium.launch({ executablePath: (process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'), headless: true });
const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('cdSelecionado', '17'); localStorage.setItem('formaEntregaSelecionada', '2'); } catch {} });
const results = [];
for (const p of pick) {
  const page = await ctx.newPage();
  await page.goto(p.productUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const br = (n) => n.toFixed(2).replace('.', ',');
  const nameOk = txt.toLowerCase().includes(p.name.toLowerCase());
  const priceOk = new RegExp('R\\$\\s?' + br(p.price).replace(',', '\\,') + '(?!\\d)').test(txt);
  const loja = /Barão de Mauá/.test(txt);
  const prices = [...txt.matchAll(/R\$\s?\d+,\d{2}[^\n]{0,25}/g)].slice(0, 4).map((m) => m[0]);
  results.push({ id: p.externalId, name: p.name, price: p.price, nomeConfere: nameOk, precoConfere: priceOk, lojaMaua: loja, precosNaPagina: prices, nota: p.validityNote.slice(0, 70) });
  await page.close();
}
await b.close();
console.log('SITE', JSON.stringify(results, null, 1));
fs.writeFileSync(dir + 'spani.verificacao.json', JSON.stringify({ stats, problemas: problems, conferencia: results }, null, 2));
