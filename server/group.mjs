// Agrupa ofertas do mesmo produto em mercados diferentes.
// Regra conservadora: mesmo tamanho (em unidade base) E mesmo conjunto de palavras significativas.
// Diferença de uma palavra só vale se for palavra "neutra" (embalagem, marketing). Na dúvida, não junta.
import { normalizeEan } from './ean.mjs';

// "sem" fica de fora: muda o produto (sem gás, sem lactose, sem açúcar).
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'para', 'a', 'o', 'c', 'por']);
const NEUTRAL = new Set([
  'pacote', 'pct', 'pcte', 'embalagem', 'emb', 'unidade', 'unid', 'un', 'tradicional', 'original', 'classico',
  'novo', 'nova', 'oferta',
  // embalagem, como os encartes escrevem ("POTE 400G", "GALÃO 5L", "TP 1L"); não muda o produto.
  // Lata, pet, vidro, garrafa e sachê ficam de fora: distinguem produtos (óleo lata x pet, refil x frasco).
  'pote', 'galao', 'frasco', 'tp', 'bisnaga', 'bandeja', 'caixa', 'cx', 'zip', 'iqf',
]);

// Palavras que só descrevem o que o produto já é (tipo de produto, fabricante, embalagem equivalente).
// Nomes da mesma marca e do mesmo tamanho que diferem SÓ por elas são o mesmo produto, mesmo com EAN diferente
// ("Café Melitta Tradicional 500g" x "Café Torrado e Moído Melitta Tradicional Vácuo 500g").
// Lista fechada de propósito: qualquer outra palavra a mais (sem, zero, light, integral, um sabor) separa.
const SOFT = new Set([
  'torrado', 'moido', 'vacuo', 'almofada', 'soluvel', 'vidro',
  'nestle', 'elma', 'chip', 'chips', 'danone',
  'cerveja', 'lager', 'pilsen', 'long', 'neck', 'refrigerante', 'garrafa', 'pet',
  'biscoito', 'bolacha', 'salgadinho', 'achocolatado', 'po',
  'tipo', '1', 'economico', 'economica',
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

// Quantas unidades vêm na embalagem, lido do nome. Sem número no nome, 1 (nunca chuta).
// "36x56g", "2x32,9ml", "3 pack de 100,8g": sempre caixa/kit.
// "c/12", "com 2 unidades", "fardo 12", "2un": só é caixa quando o produto também tem peso ou volume
// ("Cerveja 350ml c/12", "Bolinho 70g com 2 unidades"). Sem peso/volume a contagem É o produto
// ("Fralda com 58 unidades", "Escova c/2") e fica 1, para comparar igual com "58 un" de outro mercado.
const MEASURE = /\d\s*(?:kg|g|mg|ml|lt|l)\b/;
const PACK_ALWAYS = [
  /\b(\d{1,3})\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|lt|l)\b/,
  /\b(\d{1,3})\s*pack\b/,
];
const PACK_WITH_MEASURE = [
  /(?:\bc\/|\b(?:com|cx|caixa|fardo|pack|kit|display|bandeja)\b)\s*(?:com\s*)?(\d{1,3})\b(?!\s*(?:%|kg|g|mg|ml|lt|l|cm|m)\b|\s*%)/,
  /\b(\d{1,3})\s*(?:un|unid|unidade|unidades|und)\b/,
  /^(\d{1,2})\s+(?=[a-z])/, // "2 Inseticida Elétrico ... 35ml"
];
export function parsePack(name, size = '') {
  const s = strip(name);
  const ok = (m) => { if (!m) return 0; const n = parseInt(m[1]); return n > 1 && n <= 100 ? n : 0; };
  for (const re of PACK_ALWAYS) { const n = ok(s.match(re)); if (n) return n; }
  // "sacola ... 50% na segunda (unidade)": o Spani vende assim o pacote com 2
  if (/\bsacola\b/.test(s) && /\b(?:na|a) segunda\b/.test(s)) return 2;
  // kit de iguais: "1,2L + 1,2L"
  const kit = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|lt|l)\b/g)].map((m) => m[1].replace(',', '.') + m[2]);
  if (kit.length >= 2 && s.includes('+') && new Set(kit).size === 1) return kit.length;
  if (!MEASURE.test(s) && !MEASURE.test(strip(size))) return 1;
  for (const re of PACK_WITH_MEASURE) { const n = ok(s.match(re)); if (n) return n; }
  return 1;
}

export function signature(o) {
  const size = parseSize(o.size, o.name);
  const toks = tokens(o.name);
  const core = new Set(toks.filter((w) => !NEUTRAL.has(w)));
  return { size: size?.key ?? null, core, key: size ? `${size.key}|${[...core].sort().join(' ')}` : null };
}

// Marca de cada oferta (primeira palavra, sem acento). Quem não informa a marca (Semar, Spani, encartes)
// ganha a marca deduzida do nome: uma palavra do nome que, nos mercados que informam marca, é a marca
// em >= 60% dos nomes onde aparece (e em >= 3 ofertas). Mais de uma marca no nome (combo, kit) = sem marca.
export function brandKeys(offers) {
  const first = (o) => strip(o.brand ?? '').split(/\s+/)[0] || null;
  const asBrand = new Map(), inName = new Map();
  const toks = offers.map((o) => new Set(tokens(o.name)));
  offers.forEach((o, i) => {
    const b = first(o);
    if (!b) return;
    if (toks[i].has(b)) asBrand.set(b, (asBrand.get(b) ?? 0) + 1);
    for (const w of toks[i]) inName.set(w, (inName.get(w) ?? 0) + 1);
  });
  const dict = new Set([...asBrand].filter(([b, n]) => n >= 3 && b.length >= 3 && !/^\d+$/.test(b) && n / inName.get(b) >= 0.6).map(([b]) => b));
  return offers.map((o, i) => {
    const b = first(o);
    if (b) return b;
    const found = [...toks[i]].filter((w) => dict.has(w));
    return found.length === 1 ? found[0] : null;
  });
}

// Chave estável de um par de ofertas (mercado + nome normalizado), igual nos dois sentidos.
// Usada pelos vereditos (rótulos do Rafael e juiz com IA).
export const offerKey = (o) => `${o.market}|${strip(o.name).replace(/\s+/g, ' ').trim()}`;
export const pairKey = (o1, o2) => [offerKey(o1), offerKey(o2)].sort().join(' <> ');

// 1) Mesmo código de barras (EAN) = mesmo produto, salvo veredito contrário.
// 2) A regra de nomes só junta quando nenhum EAN contradiz: se os dois lados têm EAN válido e diferente,
//    são produtos diferentes (ex.: água com gás x sem gás, pacote com 4 x unidade).
// decide(i, j): veredito para o par (true = mesmo produto, false = diferente, undefined = sem veredito).
// Vem dos rótulos do Rafael e do juiz com IA (server/judge.mjs) e vale mais que as regras de nome e de EAN.
export function groupOffers(offers, decide = () => undefined) {
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
    else if (!eanConflict(first, i) && decide(first, i) !== false) union(first, i, false);
  });

  const bySig = new Map();
  sigs.forEach((s, i) => { if (!s.key) return; if (bySig.has(s.key)) { if (decide(bySig.get(s.key), i) !== false) union(bySig.get(s.key), i, true); } else bySig.set(s.key, i); });

  // Nomes quase iguais: mesma marca, mesmo tamanho, preço parecido, e as palavras que sobram de um lado
  // ou do outro são todas da lista SOFT. Junta por cima do EAN (são cadastros diferentes do mesmo produto).
  const brands = brandKeys(offers);
  const near = new Map();
  sigs.forEach((sg, i) => {
    const b = brands[i];
    if (!sg.size || !b) return;
    const k = sg.size + '|' + b;
    (near.get(k) ?? near.set(k, []).get(k)).push(i);
  });
  for (const idx of near.values()) {
    if (idx.length < 2 || idx.length > 200) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = idx[x], b = idx[y];
      if (find(a) === find(b)) continue;
      const pa = offers[a].price, pb = offers[b].price;
      const verdict = decide(a, b);
      if (verdict === false) continue;
      // veredito "mesmo produto": junta mesmo com palavras diferentes (preço até 50% de diferença, por segurança)
      if (verdict === true) { if (!(pa > 0 && pb > 0 && ratio(pa, pb) > 1.5)) union(a, b, false); continue; }
      const ca = sigs[a].core, cb = sigs[b].core;
      const diff = [...ca].filter((t) => !cb.has(t)).concat([...cb].filter((t) => !ca.has(t)));
      if (!diff.length || !diff.every((t) => SOFT.has(t))) continue;
      if (pa > 0 && pb > 0 && ratio(pa, pb) > 1.3) continue;
      union(a, b, false);
    }
  }

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
