// Agrupa ofertas do mesmo produto em mercados diferentes.
// Regra conservadora: mesmo tamanho (em unidade base) E mesmo conjunto de palavras significativas.
// Diferença de uma palavra só vale se for palavra "neutra" (embalagem, marketing). Na dúvida, não junta.
import { normalizeEan } from './ean.mjs';

// "sem" fica de fora: muda o produto (sem gás, sem lactose, sem açúcar).
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'para', 'a', 'o', 'c', 'por']);
const NEUTRAL = new Set([
  'pacote', 'pct', 'pcte', 'embalagem', 'emb', 'unidade', 'unid', 'un', 'tradicional', 'original', 'classico',
  'novo', 'nova', 'oferta', 'especial',
]);

export const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const UNIT = { kg: ['g', 1000], g: ['g', 1], mg: ['g', 0.001], l: ['ml', 1000], lt: ['ml', 1000], ml: ['ml', 1], un: ['un', 1], und: ['un', 1], unid: ['un', 1], m: ['m', 1], cm: ['m', 0.01] };
const SIZE_RE = /(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|lt|l|un|und|unid|m|cm)\b/g;

// "4x90g", "1,5L", "5 kg" -> { key: 'g:360', raw }
export function parseSize(...texts) {
  for (const t of texts) {
    const s = strip(t);
    let best = null;
    for (const m of s.matchAll(SIZE_RE)) {
      const [, mult, num, u] = m;
      const [base, f] = UNIT[u];
      const value = parseFloat(num.replace(',', '.')) * f * (mult ? parseInt(mult) : 1);
      if (value > 0) best = { key: `${base}:${Math.round(value * 1000) / 1000}`, span: m[0] };
    }
    if (best) return best;
  }
  return null;
}

const singular = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export function tokens(name) {
  let s = strip(name).replace(SIZE_RE, ' ').replace(/[^a-z0-9\s]/g, ' ');
  return s.split(/\s+/).filter((w) => w && !STOP.has(w)).map(singular);
}

export function signature(o) {
  const size = parseSize(o.size, o.name);
  const toks = tokens(o.name);
  const core = new Set(toks.filter((w) => !NEUTRAL.has(w)));
  return { size: size?.key ?? null, core, key: size ? `${size.key}|${[...core].sort().join(' ')}` : null };
}

// 1) Mesmo código de barras (EAN) = mesmo produto, sempre.
// 2) A regra de nomes só junta quando nenhum EAN contradiz: se os dois lados têm EAN válido e diferente,
//    são produtos diferentes (ex.: água com gás x sem gás, pacote com 4 x unidade).
export function groupOffers(offers) {
  const n = offers.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const eans = offers.map((o) => normalizeEan(o.ean));
  const groupEans = new Map(); // raiz -> Set de EANs do grupo
  const eansOf = (r) => groupEans.get(r) ?? new Set();
  const union = (a, b, guard) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const ea = eansOf(ra), eb = eansOf(rb);
    if (guard && ea.size && eb.size && ![...ea].some((e) => eb.has(e))) return;
    parent[rb] = ra;
    groupEans.set(ra, new Set([...ea, ...eb]));
    groupEans.delete(rb);
  };
  eans.forEach((e, i) => { if (e) groupEans.set(i, new Set([e])); });

  const sigs = offers.map(signature);
  // EAN cadastrado errado num mercado: tamanho E preço muito diferentes (ex.: 100g por R$ 3,99 x 200g por R$ 8,49).
  // Tamanho diferente com preço parecido é o mesmo produto (peso drenado, 12x5g = 60g) e junta.
  const sizeOf = (i) => { const k = sigs[i].size; if (!k) return null; const [u, v] = k.split(':'); return { u, v: +v }; };
  const ratio = (a, b) => Math.max(a, b) / Math.min(a, b);
  const eanConflict = (a, b) => {
    const sa = sizeOf(a), sb = sizeOf(b);
    if (!sa || !sb || sa.u !== sb.u || !(sa.v > 0 && sb.v > 0)) return false;
    const pa = offers[a].price, pb = offers[b].price;
    return ratio(sa.v, sb.v) > 1.6 && pa > 0 && pb > 0 && ratio(pa, pb) > 1.6;
  };
  const byEan = new Map();
  eans.forEach((e, i) => {
    if (!e) return;
    const first = byEan.get(e);
    if (first === undefined) byEan.set(e, i);
    else if (!eanConflict(first, i)) union(first, i, false);
  });

  const bySig = new Map();
  sigs.forEach((s, i) => { if (!s.key) return; if (bySig.has(s.key)) union(bySig.get(s.key), i, true); else bySig.set(s.key, i); });

  const members = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!members.has(r)) members.set(r, []); members.get(r).push(i); }
  const groups = [];
  for (const [r, idx] of members) {
    if (new Set(idx.map((i) => offers[i].market)).size < 2) continue;
    const ge = [...eansOf(r)].sort();
    // chave estável: menor EAN do grupo; sem EAN, a assinatura do nome
    const key = ge.length ? `ean:${ge[0]}` : sigs[idx.find((i) => sigs[i].key)]?.key;
    groups.push({ key, idx });
  }
  return groups;
}
