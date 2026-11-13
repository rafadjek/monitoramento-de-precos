// Gera pares de produtos para o Rafael rotular ("mesmo produto" ou "diferente").
// Três fontes: (a) juntos hoje por nome quase igual (lista SOFT); (b) quase iguais que hoje ficam separados;
// (c) juntos pelo mesmo EAN, mas com nomes bem diferentes. Saída: data/rotulos/candidatos.json
// Uso: node tools/pares-candidatos.mjs [quantidade por tipo, padrão 25]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { groupOffers, brandKeys, signature, strip } from '../group.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(ROOT, 'data/rotulos');
const N = Number(process.argv[2] || 25);
const offers = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura/.test(x))) {
  const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000));
}
const groups = groupOffers(offers);
const gOf = new Map();
groups.forEach((g, k) => g.idx.forEach((i) => gOf.set(i, k)));
const sigs = offers.map(signature);
const brands = brandKeys(offers);
const diffWords = (a, b) => [...a].filter((t) => !b.has(t)).concat([...b].filter((t) => !a.has(t)));
const pairId = (a, b) => crypto.createHash('sha1').update([offers[a].market + offers[a].name, offers[b].market + offers[b].name].sort().join('|')).digest('hex').slice(0, 10);
const item = (i) => ({ market: offers[i].market, name: offers[i].name, price: offers[i].price, image: offers[i].imageUrl && /^https/.test(offers[i].imageUrl) ? offers[i].imageUrl : null, ean: offers[i].ean ?? null });

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const joinedSoft = [], nearMiss = [], eanOdd = [];
const buckets = new Map();
sigs.forEach((s, i) => { const b = brands[i]; if (!s.size || !b) return; const k = s.size + '|' + b; (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i); });
for (const idx of buckets.values()) {
  if (idx.length > 60) continue;
  for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
    const a = idx[x], b = idx[y];
    if (offers[a].market === offers[b].market) continue;
    const d = diffWords(sigs[a].core, sigs[b].core);
    if (!d.length || d.length > 3) continue;
    const r = Math.max(offers[a].price, offers[b].price) / Math.min(offers[a].price, offers[b].price);
    const same = gOf.has(a) && gOf.get(a) === gOf.get(b);
    const eanSame = offers[a].ean && offers[a].ean === offers[b].ean;
    if (same && !eanSame) joinedSoft.push({ a, b, d });
    else if (!same && r <= 1.5) nearMiss.push({ a, b, d });
  }
}
for (const g of groups) {
  for (let x = 0; x < g.idx.length; x++) for (let y = x + 1; y < g.idx.length; y++) {
    const a = g.idx[x], b = g.idx[y];
    if (offers[a].market === offers[b].market || !offers[a].ean || offers[a].ean !== offers[b].ean) continue;
    const d = diffWords(sigs[a].core, sigs[b].core);
    if (d.length >= 3) eanOdd.push({ a, b, d });
  }
}
// palavra que muda: variar os exemplos (no máximo 2 pares com a mesma diferença)
const pick = (list, kind, why) => {
  const seen = new Map(), out = [];
  for (const p of shuffle(list)) {
    const key = p.d.sort().join(' ');
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    out.push({ id: pairId(p.a, p.b), kind, why: why(p), diff: p.d, a: item(p.a), b: item(p.b) });
    if (out.length >= N) break;
  }
  return out;
};
const pairs = [
  ...pick(joinedSoft, 'juntos', (p) => `hoje JUNTOS; diferem em: ${p.d.join(', ')}`),
  ...pick(nearMiss, 'separados', (p) => `hoje SEPARADOS; diferem em: ${p.d.join(', ')}`),
  ...pick(eanOdd, 'ean', (p) => `hoje JUNTOS pelo código de barras; nomes diferem em: ${p.d.slice(0, 6).join(', ')}`),
];
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'candidatos.json'), JSON.stringify(shuffle(pairs), null, 1));
console.log(`candidatos: ${pairs.length} (juntos ${joinedSoft.length}, separados ${nearMiss.length}, ean ${eanOdd.length} no total)`);
