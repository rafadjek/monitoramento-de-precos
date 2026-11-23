// Monta, sem IA, a mesma fila de pares duvidosos do juiz (judge.mjs, etapa 2) e escolhe os com mais chance de serem
// o mesmo produto, para o Rafael responder à mão (as respostas valem direto no site e entram na prova do juiz).
// Mantenha a montagem dos candidatos igual à de judge.mjs.
// Saída: data/rotulos/fila-provavel.json, no formato de pagina-rotulos.mjs.
// Uso: node tools/fila-provavel.mjs [quantidade=60] [--amostra]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pairKey, offerKey, brandKeys, signature, groupOffers } from '../group.mjs';
import { conflitoDeRegra } from '../variacao.mjs';
import { probabilidade, diferenca } from '../nomes-v2.mjs';
import { normalizeEan } from '../ean.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data/extraido');
const N = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 60);
const agora = new Date();

const offers = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz/.test(x))) {
  const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000 && o.segment !== 'farmacia' && (!o.validUntil || new Date(o.validUntil) > agora)));
}
const fmt = (o) => `${o.market} | ${o.name}${o.price ? ` | R$ ${Number(o.price).toFixed(2)}` : ''}`;
const state = JSON.parse(fs.readFileSync(path.join(IN, 'juiz-veredictos.json'), 'utf8'));
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/rotulos.json'), 'utf8'));
const rotulados = new Set(labels.map((x) => pairKey(x.a, x.b)));

const sigs = offers.map(signature), brands = brandKeys(offers), eans = offers.map((o) => normalizeEan(o.ean));
const ratio = (x, y) => Math.max(x, y) / Math.min(x, y);
const diffOf = (a, b) => { const ca = sigs[a].core, cb = sigs[b].core; return [...ca].filter((t) => !cb.has(t)).length + [...cb].filter((t) => !ca.has(t)).length; };
const cand = new Map();
const add = (a, b, d) => {
  const key = pairKey(offers[a], offers[b]);
  if (!state.pares[key] && !rotulados.has(key)) cand.set(key, { key, a: fmt(offers[a]), b: fmt(offers[b]), d, ia: a, ib: b });
};
const buckets = new Map();
sigs.forEach((s, i) => { const b = brands[i]; if (!s.size || !b) return; const k = s.size + '|' + b; (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i); });
for (const idx of buckets.values()) {
  if (idx.length > 80) continue;
  for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
    const a = idx[x], b = idx[y];
    if (offers[a].market === offers[b].market || ratio(offers[a].price, offers[b].price) > 1.5) continue;
    if (eans[a] && eans[b]) continue;
    const d = diffOf(a, b);
    if (d >= 1 && d <= 4) add(a, b, d);
  }
}
// par que não muda o site: já estão no mesmo grupo, ou cada lado já tem comparação com o mercado do outro
const vered = new Map(Object.entries(state.ativo ? state.pares : {}).map(([k, v]) => [k, v.same]));
for (const x of labels) if (x.label === 'mesmo' || x.label === 'diferente') vered.set(pairKey(x.a, x.b), x.label === 'mesmo');
const grupos = groupOffers(offers, (i, j) => vered.get(pairKey(offers[i], offers[j])));
const grupoDe = new Array(offers.length);
grupos.forEach((g, gi) => g.idx.forEach((i) => { grupoDe[i] = gi; }));
const mercadosDo = grupos.map((g) => new Set(g.idx.map((i) => offers[i].market)));
for (const c of cand.values()) {
  const ga = grupoDe[c.ia], gb = grupoDe[c.ib];
  if (ga === undefined || gb === undefined) continue;
  if (ga === gb || (mercadosDo[ga].has(offers[c.ib].market) && mercadosDo[gb].has(offers[c.ia].market))) cand.delete(c.key);
}
for (const [k, c] of cand) if (conflitoDeRegra(c.a, c.b)) cand.delete(k); // sabor/versão diferente: a regra já decide

const fila = [...cand.values()];
for (const c of fila) c.prob = probabilidade(sigs[c.ia].core, sigs[c.ib].core, offers[c.ia].price, offers[c.ib].price);
// os mais prováveis primeiro; no máximo 1 par por oferta e 2 por (marca, par de mercados), para variar a página
fila.sort((x, y) => (y.prob - x.prob) || (x.d - y.d));
const usada = new Set(), cont = new Map(), escolhidos = [];
for (const c of fila) {
  if (usada.has(c.ia) || usada.has(c.ib)) continue;
  const k = brands[c.ia] + '|' + [offers[c.ia].market, offers[c.ib].market].sort().join('x');
  if ((cont.get(k) ?? 0) >= 2) continue;
  cont.set(k, (cont.get(k) ?? 0) + 1); usada.add(c.ia); usada.add(c.ib);
  escolhidos.push(c);
  if (escolhidos.length >= N) break;
}
const item = (o) => ({ market: o.market, name: o.name, price: o.price, image: o.imageUrl ?? null });
const pares = escolhidos.map((c) => {
  const { a, b } = diferenca(sigs[c.ia].core, sigs[c.ib].core);
  return { id: crypto.createHash('sha1').update(c.key).digest('hex').slice(0, 10), kind: 'fila', why: 'hoje o site mostra separados', diff: [...a, ...b], a: item(offers[c.ia]), b: item(offers[c.ib]) };
});
const nomes = new Set(fila.flatMap((c) => [offers[c.ia].name, offers[c.ib].name]).map((n) => n.toLowerCase().trim()));
// --nomes: grava os nomes da fila, do par mais provável ao menos provável, para o leitor de fichas (fichas.mjs) ler primeiro
if (process.argv.includes('--nomes')) fs.writeFileSync(path.join(ROOT, 'data/rotulos/fila-nomes.json'), JSON.stringify([...new Set(fila.flatMap((c) => [offers[c.ia].name, offers[c.ib].name]))]));
console.log(`fila: ${fila.length} pares que mudariam o site (${fila.filter((c) => c.prob >= 2).length} sem palavra de variante), com ${nomes.size} nomes distintos; escolhidos ${pares.length}`);
if (process.argv.includes('--amostra')) for (const p of pares) console.log(`${p.a.market.slice(0, 8)}: ${p.a.name.slice(0, 50)} (${p.a.price}) || ${p.b.market.slice(0, 8)}: ${p.b.name.slice(0, 50)} (${p.b.price}) | dif: ${p.diff.join(',')}`);
fs.writeFileSync(path.join(ROOT, 'data/rotulos/fila-provavel.json'), JSON.stringify(pares, null, 1));
void offerKey;
