import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const [name, base] = process.argv.slice(2);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const KEYS = /oferta|promo|encarte|folheto|categoria|departamento|produto|hortifruti|mercearia|limpeza|higiene|bebida|atacado|clube|super|catalogo|busca|search|\/c\/|\/p\/|\/pd\//i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { name, base, robots: null, sitemaps: [], homeStatus: null, apis: [], pages: [], links: [], error: null };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' });
const apiSeen = new Map();
ctx.on('response', async (res) => {
  try {
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    const url = res.url();
    const body = await res.text();
    if (/price|preco|preço|sellingPrice|"name"/i.test(body) && body.length > 400) {
      if (!apiSeen.has(url)) apiSeen.set(url, { url: url.slice(0, 300), bytes: body.length, hasPrice: /price|preco|preço|sellingPrice/i.test(body) });
    }
  } catch {}
});

try {
  const origin = new URL(base).origin;
  const rb = await ctx.request.get(origin + '/robots.txt', { timeout: 20000 }).catch(() => null);
  if (rb && rb.ok()) {
    const t = await rb.text();
    report.robots = t.slice(0, 1500);
    report.sitemaps = [...t.matchAll(/sitemap:\s*(\S+)/gi)].map((m) => m[1]).slice(0, 5);
  }
  if (!report.sitemaps.length) report.sitemaps = [origin + '/sitemap.xml'];
  const smInfo = [];
  for (const sm of report.sitemaps.slice(0, 3)) {
    const r = await ctx.request.get(sm, { timeout: 20000 }).catch(() => null);
    if (r && r.ok()) {
      const x = await r.text();
      const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      smInfo.push({ url: sm, locs: locs.length, sample: locs.slice(0, 8) });
    } else smInfo.push({ url: sm, status: r ? r.status() : 'erro' });
  }
  report.sitemaps = smInfo;

  const page = await ctx.newPage();
  const resp = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  report.homeStatus = resp ? resp.status() : null;
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: OUT + name + '-home.png' });
  const links = await page.$$eval('a[href]', (as) => as.map((a) => ({ h: a.href, t: (a.textContent || '').trim().slice(0, 50) })));
  const uniq = new Map();
  for (const l of links) {
    try {
      const u = new URL(l.h);
      if (u.origin !== origin) continue;
      u.hash = '';
      if (!uniq.has(u.href)) uniq.set(u.href, l.t);
    } catch {}
  }
  report.links = [...uniq.entries()].slice(0, 80).map(([h, t]) => ({ h, t }));
  const cand = [...uniq.entries()].filter(([h, t]) => KEYS.test(h) || KEYS.test(t)).slice(0, 14);

  for (const [h, t] of cand) {
    await sleep(1200);
    const p = await ctx.newPage();
    try {
      const r = await p.goto(h, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await sleep(800);
      const txt = await p.evaluate(() => document.body.innerText || '');
      const prices = (txt.match(/R\$\s?\d{1,4}[.,]\d{2}/g) || []).length;
      const imgs = await p.$$eval('img', (is) => is.length);
      const jsonld = await p.$$eval('script[type="application/ld+json"]', (s) => s.filter((x) => /Product|Offer/.test(x.textContent || '')).length);
      report.pages.push({ url: h, label: t, status: r ? r.status() : null, title: (await p.title()).slice(0, 80), prices, imgs, jsonld });
    } catch (e) {
      report.pages.push({ url: h, label: t, error: String(e.message).slice(0, 100) });
    }
    await p.close();
  }
  report.apis = [...apiSeen.values()].slice(0, 25);
} catch (e) {
  report.error = String(e.message).slice(0, 300);
}
await browser.close();
fs.writeFileSync(OUT + name + '.json', JSON.stringify(report, null, 2));
console.log(name, 'ok', 'paginas:', report.pages.length, 'apis:', report.apis.length, report.error || '');
