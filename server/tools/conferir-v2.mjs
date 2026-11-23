// Monta a conferência do novo agrupamento (Fase 17.6) no formato da página de rotulagem (pagina-rotulos.mjs):
//  - "v2-junta": pares que a regra v2 junta e a antiga não juntava, com prioridade para mercados sem EAN
//    (Nagumo, Semar, encartes), onde o gabarito de EAN não ajuda;
//  - "v2-recusa": pares quase iguais que a v2 NÃO junta, os mais prováveis, para ver se está recusando demais.
// Saída: data/rotulos/conferir-v2.json (e, com --amostra, imprime os pares para leitura rápida).
// Uso: node tools/conferir-v2.mjs [juntas=30] [recusadas=20] [--amostra]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { brandKeys, signature, offerKey, pairKey } from '../group.mjs';
import { pareQuaseIgual } from '../group.mjs';
import { probabilidade, diferenca } from '../nomes-v2.mjs';
import { normalizeEan } from '../ean.mjs';
import { carregarOfertas, ehFarmacia } from './gabarito.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NJ = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 30);
const NR = Number(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 20);
const SEM_EAN = new Set(['Nagumo', 'Semar']);

const offers = carregarOfertas().filter((o) => !ehFarmacia(o));
const sigs = offers.map(signature), brands = brandKeys(offers), eans = offers.map((o) => normalizeEan(o.ean));
const rotulados = new Set();
try { for (const x of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/rotulos.json'), 'utf8'))) rotulados.add(pairKey(x.a, x.b)); } catch { /* sem rótulos */ }

const baldes = new Map();
offers.forEach((o, i) => { if (!sigs[i].size || !brands[i]) return; const k = sigs[i].size + '|' + brands[i]; (baldes.get(k) ?? baldes.set(k, []).get(k)).push(i); });
const antiga = (a, b) => { const v = process.env.GROUP_V2; process.env.GROUP_V2 = '0'; try { return pareQuaseIgual(sigs[a].core, sigs[b].core, offers[a].price, offers[b].price, offers[a].name, offers[b].name); } finally { if (v === undefined) delete process.env.GROUP_V2; else process.env.GROUP_V2 = v; } };
const nova = (a, b) => pareQuaseIgual(sigs[a].core, sigs[b].core, offers[a].price, offers[b].price, offers[a].name, offers[b].name);

const juntas = [], recusadas = [];
for (const v of baldes.values()) {
  if (v.length > 80) continue;
  for (let x = 0; x < v.length; x++) for (let y = x + 1; y < v.length; y++) {
    const a = v[x], b = v[y];
    if (offers[a].market === offers[b].market || sigs[a].key === sigs[b].key) continue;
    if (eans[a] && eans[b]) continue; // os dois com EAN: o código decide
    if (rotulados.has(pairKey(offers[a], offers[b]))) continue; // já rotulado pelo Rafael
    const semEan = SEM_EAN.has(offers[a].market) || SEM_EAN.has(offers[b].market) || offers[a].source === 'encarte' || offers[b].source === 'encarte' || !eans[a] || !eans[b];
    const p = probabilidade(sigs[a].core, sigs[b].core, offers[a].price, offers[b].price);
    if (nova(a, b) && !antiga(a, b)) juntas.push({ a, b, semEan, p });
    else if (!nova(a, b) && p >= 2) recusadas.push({ a, b, semEan, p });
  }
}
// no máximo 2 pares por (marca, mercado A, mercado B) para não encher a página de uma linha de produtos só
const escolhe = (lista, n) => {
  const cont = new Map(), out = [];
  lista.sort((x, y) => (y.semEan - x.semEan) || (y.p - x.p));
  // embaralha de forma estável dentro do grupo para variar as marcas
  const h = (s) => [...s].reduce((q, c) => (q * 31 + c.charCodeAt(0)) >>> 0, 7);
  lista.sort((x, y) => (y.semEan - x.semEan) || (h(offers[x.a].name) % 997) - (h(offers[y.a].name) % 997));
  for (const c of lista) {
    const k = brands[c.a] + '|' + [offers[c.a].market, offers[c.b].market].sort().join('x');
    if ((cont.get(k) ?? 0) >= 2) continue;
    cont.set(k, (cont.get(k) ?? 0) + 1);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
};
const item = (o) => ({ market: o.market, name: o.name, price: o.price, image: o.imageUrl ?? null });
const id = (a, b) => crypto.createHash('sha1').update(pairKey(offers[a], offers[b])).digest('hex').slice(0, 10);
const pares = [
  ...escolhe(juntas, NJ).map((c) => ({ id: id(c.a, c.b), kind: 'v2-junta', why: 'o novo agrupamento JUNTA (a regra antiga não juntava)', diff: [...diferenca(sigs[c.a].core, sigs[c.b].core).a, ...diferenca(sigs[c.a].core, sigs[c.b].core).b], a: item(offers[c.a]), b: item(offers[c.b]), _i: [c.a, c.b] })),
  ...escolhe(recusadas, NR).map((c) => ({ id: id(c.a, c.b), kind: 'v2-recusa', why: 'o novo agrupamento NÃO junta', diff: [...diferenca(sigs[c.a].core, sigs[c.b].core).a, ...diferenca(sigs[c.a].core, sigs[c.b].core).b], a: item(offers[c.a]), b: item(offers[c.b]), _i: [c.a, c.b] })),
];
console.log(`candidatas: ${juntas.length} novas junções (${juntas.filter((c) => c.semEan).length} com mercado sem EAN) e ${recusadas.length} recusas prováveis; escolhidos ${pares.length}`);
if (process.argv.includes('--amostra')) {
  for (const p of pares) console.log(`${p.kind === 'v2-junta' ? 'JUNTA ' : 'RECUSA'} ${p.a.market.slice(0, 7)}: ${p.a.name.slice(0, 52)} (${p.a.price}) || ${p.b.market.slice(0, 7)}: ${p.b.name.slice(0, 52)} (${p.b.price}) | dif: ${p.diff.join(',')}`);
}
fs.writeFileSync(path.join(ROOT, 'data/rotulos/conferir-v2.json'), JSON.stringify(pares.map(({ _i, ...r }) => r), null, 1));
void offerKey;
