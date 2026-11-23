// Mede o agrupamento de produtos iguais contra dois gabaritos, para saber se uma mudança melhora ou piora:
//  A) EAN: dois produtos de mercados diferentes, mesma marca e mesmo tamanho, os dois com código de barras.
//     Mesmo EAN = mesmo produto; EAN diferente = diferente (com os "negativos" limpos: EAN diferente não prova
//     que é outro produto quando o nome é igual e o preço parecido). Dividido por marca inteira em treino e teste,
//     sempre igual, para que um método que aprenda não veja no treino as marcas do teste.
//  B) Mercados sem EAN (Nagumo, Semar, encartes): os rótulos do Rafael e os vereditos do juiz de IA.
//     Os vereditos "regra" (marcados pela trava de variação, não por IA) ficam de fora: seriam circulares.
// Uso: node tools/gabarito.mjs [--salvar=nome]   (grava data/rotulos/gabarito-<nome>.json; GROUP_V2=0 mede a regra antiga)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandKeys, signature, mesmoPorNome, offerKey, pairKey, strip } from '../group.mjs';
import { normalizeEan } from '../ean.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data/extraido');
const ROT = path.join(ROOT, 'data/rotulos');

export const ehFarmacia = (o) => o.category === 'farmacia' || !!o.rx || o.section === 'farmacia' || o.segment === 'farmacia';

export function carregarOfertas(dir = IN) {
  const offers = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz|social|vistos|agrupamento/.test(x)).sort()) {
    const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000 && (!o.validUntil || new Date(o.validUntil) > new Date())));
  }
  return offers;
}

const hash = (s) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 'teste' para 1 de cada 5 marcas (sempre as mesmas), 'treino' para o resto. */
export const dobra = (marca) => (hash(marca) % 5 === 0 ? 'teste' : 'treino');

const razao = (a, b) => Math.max(a, b) / Math.min(a, b);
const sem = (core, neutros) => [...core].filter((t) => !neutros.has(t)).sort().join(' ');

/**
 * Pares com gabarito de EAN. `ctx` = { offers, sigs, brands, eans } (índices alinhados).
 * Devolve [{ a, b, mesmo, dobra, marca }].
 */
export function gabaritoEan({ offers, sigs, brands, eans }, neutros = new Set(), maxBalde = 60) {
  const baldes = new Map();
  offers.forEach((o, i) => {
    if (!sigs[i].size || !brands[i] || !eans[i] || ehFarmacia(o)) return;
    const k = sigs[i].size + '|' + brands[i];
    (baldes.get(k) ?? baldes.set(k, []).get(k)).push(i);
  });
  const pares = [];
  for (const [k, v] of baldes) {
    if (v.length > maxBalde) continue;
    const marca = k.split('|')[1];
    for (let x = 0; x < v.length; x++) for (let y = x + 1; y < v.length; y++) {
      const a = v[x], b = v[y];
      if (offers[a].market === offers[b].market) continue;
      const mesmo = eans[a] === eans[b];
      // EAN diferente com nome igual (fora palavras neutras) e preço parecido: provável mesmo produto com outro cadastro
      if (!mesmo && sem(sigs[a].core, neutros) === sem(sigs[b].core, neutros) && razao(offers[a].price, offers[b].price) <= 1.3) continue;
      pares.push({ a, b, mesmo, dobra: dobra(marca), marca });
    }
  }
  return pares;
}

export function medir(pares, preve) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const p of pares) {
    const r = preve(p);
    if (r && p.mesmo) tp++; else if (r && !p.mesmo) fp++; else if (!r && p.mesmo) fn++; else tn++;
  }
  const precisao = tp + fp ? tp / (tp + fp) : null;
  const cobertura = tp + fn ? tp / (tp + fn) : null;
  return { pares: pares.length, mesmo: tp + fn, tp, fp, fn, tn, precisao: precisao == null ? null : +precisao.toFixed(4), cobertura: cobertura == null ? null : +cobertura.toFixed(4) };
}

/** Gabarito B: rótulos do Rafael e vereditos de IA, achados nas ofertas de hoje pela chave mercado|nome. */
export function gabaritoSemEan(offers, rotulos, veredictos) {
  const porChave = new Map(offers.map((o, i) => [offerKey(o), i]));
  const pares = [];
  const ja = new Set();
  const poe = (ka, kb, mesmo, fonte) => {
    const a = porChave.get(ka), b = porChave.get(kb);
    if (a === undefined || b === undefined || a === b) return;
    const k = [a, b].sort().join('-');
    if (ja.has(k)) return; // o rótulo do Rafael vem primeiro e vale mais que o veredito de IA
    ja.add(k);
    pares.push({ a, b, mesmo, fonte });
  };
  for (const r of rotulos) if (r.label === 'mesmo' || r.label === 'diferente') poe(offerKey(r.a), offerKey(r.b), r.label === 'mesmo', 'rafael');
  for (const [k, v] of Object.entries(veredictos)) {
    if (v.model === 'regra') continue;
    const [ka, kb] = k.split(' <> ');
    poe(ka, kb, !!v.same, 'ia');
  }
  return pares;
}

function ler(arq, vazio) { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return vazio; } }

export function medirTudo() {
  const offers = carregarOfertas();
  const sigs = offers.map(signature), brands = brandKeys(offers), eans = offers.map((o) => normalizeEan(o.ean));
  const preve = (p) => mesmoPorNome(offers[p.a], offers[p.b], brands[p.a], brands[p.b]);
  const ean = gabaritoEan({ offers, sigs, brands, eans });
  const rotulos = ler(path.join(ROT, 'rotulos.json'), []);
  const juiz = ler(path.join(IN, 'juiz-veredictos.json'), {}).pares ?? {};
  const semEan = gabaritoSemEan(offers, rotulos, juiz);
  // quem nem entra na comparação (sem tamanho ou sem marca)
  const fora = {};
  offers.forEach((o, i) => {
    if (ehFarmacia(o)) return;
    const f = (fora[o.market] ??= { ofertas: 0, fora: 0 });
    f.ofertas++;
    if (!sigs[i].size || !brands[i]) f.fora++;
  });
  for (const f of Object.values(fora)) f.pctFora = +(100 * f.fora / f.ofertas).toFixed(1);
  return {
    gerado: new Date().toISOString(),
    metodo: process.env.GROUP_V2 === '0' ? 'atual (GROUP_V2=0)' : 'atual',
    ean: { treino: medir(ean.filter((p) => p.dobra === 'treino'), preve), teste: medir(ean.filter((p) => p.dobra === 'teste'), preve) },
    semEan: { rafael: medir(semEan.filter((p) => p.fonte === 'rafael'), preve), ia: medir(semEan.filter((p) => p.fonte === 'ia'), preve), tudo: medir(semEan, preve) },
    foraDaComparacao: fora,
  };
}

const direto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direto) {
  const r = medirTudo();
  const linha = (n, m) => console.log(`${n.padEnd(22)} pares ${String(m.pares).padStart(6)}  mesmo ${String(m.mesmo).padStart(5)}  juntou certo ${String(m.tp).padStart(5)}  errado ${String(m.fp).padStart(4)}  precisão ${m.precisao ?? '-'}  cobertura ${m.cobertura ?? '-'}`);
  console.log(`método: ${r.metodo}`);
  linha('EAN (treino)', r.ean.treino); linha('EAN (teste)', r.ean.teste);
  linha('sem EAN: Rafael', r.semEan.rafael); linha('sem EAN: juiz (IA)', r.semEan.ia); linha('sem EAN: tudo', r.semEan.tudo);
  console.table(Object.fromEntries(Object.entries(r.foraDaComparacao).filter(([, f]) => f.ofertas > 100).map(([m, f]) => [m, { ofertas: f.ofertas, '% fora da comparação': f.pctFora }])));
  const salvar = process.argv.find((x) => x.startsWith('--salvar='))?.slice(9);
  if (salvar) {
    fs.writeFileSync(path.join(ROT, `gabarito-${salvar}.json`), JSON.stringify(r, null, 1));
    console.log(`gravado data/rotulos/gabarito-${salvar}.json`);
  }
}
void pairKey; void strip;
