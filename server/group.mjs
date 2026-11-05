// Agrupa ofertas do mesmo produto em mercados diferentes.
// Regra conservadora: mesmo tamanho (em unidade base) E mesmo conjunto de palavras significativas.
// Diferença de uma palavra só vale se for palavra "neutra" (embalagem, marketing). Na dúvida, não junta.

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'para', 'a', 'o', 'c', 'sem', 'por']);
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

export function groupOffers(offers) {
  const sigs = offers.map(signature);
  const byKey = new Map();
  offers.forEach((o, i) => {
    const k = sigs[i].key;
    if (!k) return;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(i);
  });
  const groups = [];
  for (const [key, idx] of byKey) {
    const markets = new Set(idx.map((i) => offers[i].market));
    if (markets.size < 2) continue;
    groups.push({ key, idx });
  }
  return groups;
}
