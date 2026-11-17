// Monta a conferência dos vereditos "mesmo" do juiz (IA), para o Rafael conferir na página de rotulagem.
// Saída: data/rotulos/conferencia.json (formato de candidatos). Depois: node tools/pagina-rotulos.mjs --entrada=conferencia.json --saida=conferencia.html --titulo="Conferir: mesmo produto"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { pairKey, offerKey } from '../group.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data/extraido');
const { pares } = JSON.parse(fs.readFileSync(path.join(IN, 'juiz-veredictos.json'), 'utf8'));
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) || 20);

const offers = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz/.test(x))) {
  const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000));
}
const byKey = new Map();
for (const o of offers) if (!byKey.has(offerKey(o))) byKey.set(offerKey(o), o);

const mesmo = Object.entries(pares).filter(([, v]) => v.same && v.model !== 'regra');
// amostra fixa (embaralhada com semente pelo hash da chave), para não mudar a cada execução
const h = (s) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
mesmo.sort((x, y) => h(x[0]) - h(y[0]));
const pick = mesmo.slice(0, N);

const side = (o) => ({ market: o.market, name: o.name, price: o.price, image: o.imageUrl || null, ean: o.ean || undefined });
const out = [];
for (const [key] of pick) {
  const [ka, kb] = key.split(' <> ');
  const a = byKey.get(ka), b = byKey.get(kb);
  // oferta que sumiu do site (encarte vencido etc.): fica só o nome e o mercado da chave
  const fallback = (k) => { const [m, ...n] = k.split('|'); return { market: m, name: n.join('|'), price: null, image: null }; };
  if (!a || !b) console.log('sem foto/preço (oferta saiu do site):', key);
  out.push({ id: crypto.createHash('sha1').update(key).digest('hex').slice(0, 16), kind: 'conferencia', why: 'juiz (IA) disse mesmo; confira', diff: [], a: a ? side(a) : fallback(ka), b: b ? side(b) : fallback(kb) });
}
fs.writeFileSync(path.join(ROOT, 'data/rotulos/conferencia.json'), JSON.stringify(out, null, 1));
console.log(`${out.length} de ${mesmo.length} vereditos "mesmo" da IA`);
