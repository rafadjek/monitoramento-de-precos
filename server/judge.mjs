// Juiz de "mesmo produto?" com IA (Gemini grátis), para os pares duvidosos do agrupamento.
// 1. PROVA: julga os pares que o Rafael rotulou (data/rotulos/rotulos.json) e compara com as respostas dele.
//    Os vereditos só passam a valer no site (ativo: true) se o juiz acertar >= 95% e mais que a regra atual.
// 2. Se ativo, julga pares candidatos ainda sem veredito, em lotes de 40, com teto por rodada e prazo.
// Vereditos ficam em data/extraido/juiz-veredictos.json (versionado): cada par é julgado uma vez só.
// Uso: node judge.mjs [--so-prova]   Segredo: GEMINI_API_KEY
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairKey, signature, strip } from './group.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(IN, 'juiz-veredictos.json');
const LABELS = path.join(ROOT, 'data/rotulos/rotulos.json');
const KEY = process.env.GEMINI_API_KEY;
const MODELS = (process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-3.8-flash,gemini-2.5-flash,gemini-flash-lite-latest,gemini-2.5-flash-lite').split(',');
const BATCH = 40;
const MAX_LOTES = Number(process.env.JUIZ_MAX_LOTES || 30);
const DEADLINE = Date.now() + Number(process.env.JUIZ_BUDGET_MIN || 15) * 60e3;
const META = 0.95;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!KEY) { console.log('juiz: sem GEMINI_API_KEY, pulando'); process.exit(0); }

const RULES = `Você decide se dois anúncios de supermercado são o MESMO produto, a ponto de dar para comparar o preço.
Mesmo produto = mesma marca, mesmo tipo, mesma variação (sabor, fragrância, cor, versão) e mesmo tamanho/quantidade.
Considere IGUAIS quando só muda a forma de escrever: palavras que só descrevem o tipo ou a embalagem equivalente
(ex.: "torrado e moído", "vácuo" x "almofada", "pet" x "garrafa", "embalagem econômica"), nome do fabricante dito de um lado só,
sinônimos e grafias diferentes do mesmo termo, abreviações, ordem diferente das palavras, "tipo 1", "original"/"tradicional"
de um lado só, nome de linha que só um mercado escreve.
Considere DIFERENTES: sabor, fragrância ou cor diferente; versão diferente (ex.: zero, light, diet, integral, desnatado,
sem sal x com sal, com gás x sem gás); formato ou linha diferente do mesmo fabricante; produto composto x simples;
quantidade diferente no pacote ou promoção "leve X pague Y" diferente; produto de outra categoria com nome parecido; tamanho diferente.
Se faltar informação para ter certeza de que é o mesmo produto, responda false.`;
// As regras acima são gerais de propósito: nenhum exemplo vem dos pares rotulados pelo Rafael, para a prova medir de verdade.

const SCHEMA = { type: 'OBJECT', properties: { results: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, same: { type: 'BOOLEAN' } }, required: ['id', 'same'] } } }, required: ['results'] };
let modelIdx = 0;
async function ask(pairs) {
  const text = `${RULES}\n\nPares (id: A || B):\n${pairs.map((p) => `${p.id}: ${p.a} || ${p.b}`).join('\n')}\n\nResponda um item por par, com o mesmo id.`;
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA } };
  for (let tent = 0, onModel = 0; tent < 8; tent++, onModel++) {
    const model = MODELS[modelIdx];
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    } catch (e) { if (onModel >= 1 && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; } continue; }
    if (r.status === 404 && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
    if (r.status === 429 || r.status >= 500) {
      const t = (await r.text()).slice(0, 200);
      if ((/PerDay|per day/i.test(t) || (r.status >= 500 && onModel >= 2)) && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
      await sleep(Math.min(30 * (onModel + 1), 120) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`gemini ${model} ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    const out = JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
    return { model, results: new Map((out.results || []).map((x) => [String(x.id), !!x.same])) };
  }
  throw new Error('gemini: limite de uso atingido');
}
async function judge(pairs) {
  const out = new Map();
  for (let i = 0; i < pairs.length; i += BATCH) {
    const part = pairs.slice(i, i + BATCH).map((p, k) => ({ ...p, id: String(k + 1) }));
    const { model, results } = await ask(part);
    part.forEach((p, k) => { if (results.has(p.id)) out.set(pairs[i + k].key, { same: results.get(p.id), model }); });
    await sleep(5000);
  }
  return out;
}

const state = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { ativo: false, prova: null, pares: {} };
const fmt = (o) => `${o.market} | ${o.name}${o.price ? ` | R$ ${Number(o.price).toFixed(2)}` : ''}`;

// ---------- 1. prova com os rótulos do Rafael ----------
const labels = JSON.parse(fs.readFileSync(LABELS, 'utf8')).filter((x) => x.label === 'mesmo' || x.label === 'diferente');
const provaPairs = labels.map((x) => ({ key: x.id, a: fmt(x.a), b: fmt(x.b) }));
const v = await judge(provaPairs);
let acertos = 0, regra = 0;
const erros = [];
for (const x of labels) {
  const truth = x.label === 'mesmo';
  const got = v.get(x.id)?.same;
  if (got === truth) acertos++; else erros.push({ a: x.a.name, b: x.b.name, rafael: x.label, juiz: got === undefined ? 'sem resposta' : got ? 'mesmo' : 'diferente' });
  const ruleSaysSame = x.kind !== 'separados';
  if (ruleSaysSame === truth) regra++;
}
state.prova = { em: new Date().toISOString(), total: labels.length, acertos, regra, taxa: acertos / labels.length, taxaRegra: regra / labels.length, erros };
state.ativo = acertos / labels.length >= META && acertos > regra;
console.log(`juiz: prova ${acertos}/${labels.length} (${(100 * acertos / labels.length).toFixed(0)}%); regra atual ${regra}/${labels.length}; ativo: ${state.ativo}`);
for (const e of erros) console.log(`  erro: ${e.a} x ${e.b} -> Rafael ${e.rafael}, juiz ${e.juiz}`);

// ---------- 2. julga pares candidatos ----------
if (state.ativo && !process.argv.includes('--so-prova')) {
  const offers = [];
  for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz/.test(x))) {
    const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
    if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000));
  }
  const sigs = offers.map(signature);
  const brand = (o) => strip(o.brand ?? '').split(/\s+/)[0] || null;
  const ratio = (x, y) => Math.max(x, y) / Math.min(x, y);
  const cand = new Map();
  const buckets = new Map();
  sigs.forEach((s, i) => { const b = brand(offers[i]); if (!s.size || !b) return; const k = s.size + '|' + b; (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i); });
  for (const idx of buckets.values()) {
    if (idx.length > 80) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = idx[x], b = idx[y];
      if (offers[a].market === offers[b].market || ratio(offers[a].price, offers[b].price) > 1.5) continue;
      const ca = sigs[a].core, cb = sigs[b].core;
      const d = [...ca].filter((t) => !cb.has(t)).length + [...cb].filter((t) => !ca.has(t)).length;
      if (d < 1 || d > 4) continue;
      const key = pairKey(offers[a], offers[b]);
      if (!state.pares[key]) cand.set(key, { key, a: fmt(offers[a]), b: fmt(offers[b]), d });
    }
  }
  // mesmo EAN com nomes bem diferentes: pode ser código reaproveitado
  const byEan = new Map();
  offers.forEach((o, i) => { if (o.ean) (byEan.get(o.ean) ?? byEan.set(o.ean, []).get(o.ean)).push(i); });
  for (const idx of byEan.values()) for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
    const a = idx[x], b = idx[y];
    if (offers[a].market === offers[b].market) continue;
    const ca = sigs[a].core, cb = sigs[b].core;
    const d = [...ca].filter((t) => !cb.has(t)).length + [...cb].filter((t) => !ca.has(t)).length;
    const key = pairKey(offers[a], offers[b]);
    if (d >= 3 && !state.pares[key]) cand.set(key, { key, a: fmt(offers[a]), b: fmt(offers[b]), d });
  }
  // menos palavras diferentes primeiro (mais chance de ser o mesmo e mudar a comparação)
  const todo = [...cand.values()].sort((x, y) => x.d - y.d).slice(0, MAX_LOTES * BATCH);
  console.log(`juiz: ${cand.size} pares sem veredito; julgando até ${todo.length}`);
  let feitos = 0;
  for (let i = 0; i < todo.length && Date.now() < DEADLINE; i += BATCH) {
    try {
      const r = await judge(todo.slice(i, i + BATCH));
      for (const [k, val] of r) { state.pares[k] = { ...val, em: new Date().toISOString().slice(0, 10) }; feitos++; }
    } catch (e) { console.warn('juiz:', e.message); break; }
  }
  console.log(`juiz: ${feitos} vereditos novos; total ${Object.keys(state.pares).length}`);
}
fs.writeFileSync(OUT, JSON.stringify(state));
