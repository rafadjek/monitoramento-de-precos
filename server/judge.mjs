// Juiz de "mesmo produto?" com IA (Gemini grátis, com as fotos dos produtos), para os pares duvidosos do agrupamento.
// 1. PROVA: julga os pares que o Rafael rotulou (data/rotulos/rotulos.json) e compara com as respostas dele.
//    Validação cruzada em 3 partes: cada parte é julgada usando as outras duas como exemplos (nunca a própria resposta).
//    Os vereditos só passam a valer no site (ativo: true) se o juiz acertar >= 95% e mais que a regra atual.
//    A prova só roda de novo quando mudam os rótulos, as regras ou o modelo (economiza a cota).
// 2. Se ativo, julga pares candidatos ainda sem veredito (com todos os rótulos como exemplos), com teto por rodada e prazo.
// Vereditos ficam em data/extraido/juiz-veredictos.json (versionado): cada par é julgado uma vez só.
// Uso: node judge.mjs [--so-prova] [--forcar-prova]
// Segredo: GEMINI_JUIZ_KEY (chave só do juiz, cota própria) ou GEMINI_API_KEY (a mesma do leitor de encartes)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { pairKey, offerKey, brandKeys, signature, strip, groupOffers } from './group.mjs';
import { conflitoDeRegra } from './variacao.mjs';
import { probabilidade } from './nomes-v2.mjs';
import { normalizeEan } from './ean.mjs';
import { lerFichas } from './fichas.mjs';
import { vereditosPorFicha } from './fichas-regra.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(IN, 'juiz-veredictos.json');
const LABELS = path.join(ROOT, 'data/rotulos/rotulos.json');
const CANDS = path.join(ROOT, 'data/rotulos/candidatos.json');
// chave do juiz primeiro; esgotada a cota do dia, usa a do leitor de encartes (que já leu os encartes antes, no workflow)
// Cada projeto do AI Studio tem cota própria (20 pedidos por dia por modelo no plano grátis): mais chaves = mais pares por dia.
// Ordem: GEMINI_JUIZ_KEY, GEMINI_JUIZ_KEY_2, GEMINI_JUIZ_KEY_3... e só no fim a do leitor de encartes.
const chavesExtras = Object.keys(process.env).filter((k) => /^GEMINI_JUIZ_KEY_\d+$/.test(k)).sort((a, b) => parseInt(a.split('_').pop()) - parseInt(b.split('_').pop())).map((k) => process.env[k]);
const KEYS = [...new Set([process.env.GEMINI_JUIZ_KEY, ...chavesExtras, process.env.GEMINI_API_KEY].filter(Boolean))];
const KEY = KEYS[0];
let keyIdx = 0;
const MODELS = (process.env.JUIZ_MODEL || 'gemini-flash-latest,gemini-3.8-flash').split(',');
const BATCH = 20; // 20 pares = até 40 fotos por pedido
// 40 pedidos por chave de projeto (cada projeto tem 20 pedidos por modelo por dia, e o juiz usa 2 modelos), até 160 por rodada
const MAX_LOTES = Number(process.env.JUIZ_MAX_LOTES || 40 * Math.min(Math.max(KEYS.length, 1), 4));
const DEADLINE = Date.now() + Number(process.env.JUIZ_BUDGET_MIN || 45) * 60e3;
const META = 0.95;
const FOLDS = 3;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!KEY) { console.log('juiz: sem chave do Gemini, pulando'); process.exit(0); }

const RULES = `Você decide se dois anúncios de supermercado são o MESMO produto, a ponto de dar para comparar o preço.
Mesmo produto = mesma marca, mesmo tipo, mesma variação (sabor, fragrância, cor, versão) e mesmo tamanho/quantidade.
Considere IGUAIS quando só muda a forma de escrever: palavras que só descrevem o tipo ou a embalagem equivalente,
nome do fabricante dito de um lado só, sinônimos e grafias diferentes do mesmo termo, abreviações, ordem diferente
das palavras, nome de linha que só um mercado escreve.
Não mudam o produto (são só descrição, embalagem ou processo): almofada x vácuo, sachet x granulado, aerosol x aerossol x
"body spray", copo/pote/lata/frasco, "em pó", "em barra", infantil x bebê x baby, "tipo 1", origem como "japonês",
finalidade como "ideal para arroz" x "para arroz branco", nugget x empanado nugget, e adjetivos de propaganda que um
mercado acrescenta e o outro não (tradicional, original, suave, crocante, extra fino, glicerina natural, "sabores" no encarte).
Fragrância descrita com palavras diferentes mas do mesmo tema (duas formas de dizer "flores", "lavanda") pode ser o mesmo
produto quando marca, tipo e tamanho batem e a foto não mostra cor diferente.
A dúvida só vira "diferente" quando aparece uma palavra que nomeia OUTRA variação: um sabor a mais ou a menos (morango x
morango e baunilha), outra versão ou linha (light, zero, cream, premium), outra embalagem que muda a quantidade (econômica, refil, kit).
Preço por unidade muito diferente (mais que o dobro) é pista de produto diferente; preço parecido não prova nada.
Considere DIFERENTES: sabor, fragrância ou cor diferente; versão diferente (ex.: zero, light, diet, integral, desnatado,
sem sal x com sal, com gás x sem gás); formato ou linha diferente do mesmo fabricante; produto composto x simples;
quantidade diferente no pacote ou promoção "leve X pague Y" diferente; produto de outra categoria com nome parecido; tamanho diferente.
Quando houver foto, use-a: embalagem, cor e o que está escrito no rótulo mostram a variação. Foto de catálogo genérica
(sem o produto) não prova nada.
Exceção de encarte: oferta que vale para vários sabores ("sabores", "diversos", "exceto X") é o MESMO produto
que qualquer sabor incluído, de mesma marca e tamanho; sem tamanho no encarte, vale o tamanho mais comum da marca.
Não responda false só porque um lado escreve menos palavras: faltar uma palavra descritiva não é diferença.
Siga o critério dos exemplos já decididos pelo dono do site: eles mostram até onde ele considera "o mesmo produto".`;

const SCHEMA = { type: 'OBJECT', properties: { results: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, same: { type: 'BOOLEAN' } }, required: ['id', 'same'] } } }, required: ['results'] };
const fmt = (o) => `${o.market} | ${o.name}${o.price ? ` | R$ ${Number(o.price).toFixed(2)}` : ''}`;

// foto pequena (256 px, JPEG) embutida no pedido; falha = par vai só com o texto
const photoCache = new Map();
async function photo(url) {
  if (!url || !/^https?:/.test(url)) return null;
  if (photoCache.has(url)) return photoCache.get(url);
  let out = null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (r.ok) out = (await sharp(Buffer.from(await r.arrayBuffer())).resize(256, 256, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 70 }).toBuffer()).toString('base64');
  } catch { /* sem foto */ }
  photoCache.set(url, out);
  return out;
}

let modelIdx = 0;
const falhas = []; // motivo de cada troca de modelo, gravado no erro para diagnóstico
async function ask(pairs, examples) {
  const parts = [{ text: `${RULES}\n\nExemplos decididos pelo dono do site (A || B => resposta):\n${examples.map((e) => `${e.a} || ${e.b} => ${e.same ? 'mesmo' : 'diferente'}`).join('\n')}\n\nPares para decidir (id: A || B), cada um seguido das fotos de A e de B quando houver:` }];
  for (const p of pairs) {
    parts.push({ text: `\n${p.id}: ${p.a} || ${p.b}` });
    for (const [lado, url] of [['A', p.imgA], ['B', p.imgB]]) {
      const b64 = await photo(url);
      if (b64) parts.push({ text: `foto ${lado} do par ${p.id}:` }, { inlineData: { mimeType: 'image/jpeg', data: b64 } });
    }
  }
  parts.push({ text: '\nResponda um item por par, com o mesmo id.' });
  const body = { contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA } };
  for (let tent = 0, onModel = 0; tent < 12; tent++, onModel++) {
    const model = MODELS[modelIdx];
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEYS[keyIdx] }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    } catch (e) { falhas.push(`${model}: ${e.message}`.slice(0, 120)); if (onModel >= 1 && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; } continue; }
    if (r.status === 404) falhas.push(`${model}: 404`);
    if (r.status === 404 && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
    if (r.status === 429 || r.status >= 500) {
      // o motivo (quotaId, limite) vem no fim da resposta: ler inteira, não só o começo
      const t = await r.text();
      const q = t.match(/quotaId"?:\s*"([^"]+)"/)?.[1], lim = t.match(/quotaValue"?:\s*"?(\d+)/)?.[1];
      falhas.push(`${model}: ${r.status} ${q ? q + (lim ? ' limite ' + lim : '') : t.replace(/\s+/g, ' ').slice(0, 80)}`);
      // cota diária, limite zero ou 429 repetido: troca de modelo em vez de esperar à toa
      if ((/PerDay|per day/i.test(t) || lim === '0' || onModel >= 1) && modelIdx < MODELS.length - 1) { modelIdx++; onModel = -1; continue; }
      if (/PerDay|per day/i.test(t) && keyIdx < KEYS.length - 1) { keyIdx++; modelIdx = 0; onModel = -1; falhas.push('trocou para a chave do leitor'); continue; }
      if (/PerDay|per day/i.test(t)) throw new Error('gemini: cota do dia esgotada');
      // erro 5xx (alta demanda) repetido no último modelo: tenta a próxima chave em vez de esperar sempre no mesmo lugar
      if (r.status >= 500 && onModel >= 2 && keyIdx < KEYS.length - 1) { keyIdx++; modelIdx = 0; onModel = -1; falhas.push('trocou de chave por erro 5xx'); continue; }
      await sleep(Math.min(30 * (onModel + 1), 120) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`gemini ${model} ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    const out = JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
    return { model, results: new Map((out.results || []).map((x) => [String(x.id), !!x.same])) };
  }
  throw new Error(`gemini: limite de uso atingido (${falhas.slice(-6).join(' | ')})`);
}
// Segundo juiz: Groq (grátis, GROQ_API_KEY), só com texto. O modelo com visão aceita no máximo 3 fotos por pedido e cada foto
// custa ~1.300 tokens, contra um limite de 8 mil tokens por minuto: com fotos daria 1 par por minuto. Tem prova própria (provaGroq)
// e só entra quando a cota do Gemini acaba, se a prova dele passou.
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const provArg = process.argv.find((a) => a.startsWith('--provedor='))?.slice(11);
let provedor = ['groq', 'openrouter', 'zen'].includes(provArg) ? provArg : 'gemini';
// o pedido inteiro tem de caber em 8 mil tokens: vão só os exemplos mais parecidos com os pares do lote (palavras em comum)
const GROQ_EXEMPLOS = 40;
const palavras = (s) => new Set(strip(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
function exemplosParecidos(pairs, examples) {
  const alvo = pairs.map((p) => palavras(p.a + ' ' + p.b));
  const nota = (e) => { const w = palavras(e.a + ' ' + e.b); return Math.max(...alvo.map((a) => [...w].filter((x) => a.has(x)).length)); };
  return examples.map((e) => [nota(e), e]).sort((x, y) => y[0] - x[0]).slice(0, GROQ_EXEMPLOS).map((x) => x[1]);
}
async function askGroq(pairs, todos) {
  const examples = exemplosParecidos(pairs, todos);
  const text = `${RULES}\n\nVocê NÃO recebe fotos: decida só pelo texto.\n\nExemplos decididos pelo dono do site (A || B => resposta):\n${examples.map((e) => `${e.a} || ${e.b} => ${e.same ? 'mesmo' : 'diferente'}`).join('\n')}\n\nPares para decidir (id: A || B):\n${pairs.map((p) => `${p.id}: ${p.a} || ${p.b}`).join('\n')}\n\nResponda só com JSON no formato {"results":[{"id":"1","same":true}]}, um item por par, com o mesmo id.`;
  for (let tent = 0; tent < 8; tent++) {
    let r;
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, temperature: 0, response_format: { type: 'json_object' }, reasoning_effort: /gpt-oss/.test(GROQ_MODEL) ? 'low' : 'none', messages: [{ role: 'user', content: text }] }), signal: AbortSignal.timeout(120000) });
    } catch (e) { falhas.push(`groq: ${e.message}`.slice(0, 120)); await sleep(10000); continue; }
    if (r.status === 429 || r.status >= 500) {
      const t = await r.text();
      falhas.push(`groq: ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 100)}`);
      if (/per day|\(TPD\)|\(RPD\)/i.test(t)) throw new Error('groq: cota do dia esgotada');
      await sleep(Math.min((Number(r.headers.get('retry-after')) || 20) + 1, 90) * 1000); // limite por minuto: espera o que ele pede
      continue;
    }
    if (!r.ok) throw new Error(`groq ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    const out = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    return { model: 'groq:' + GROQ_MODEL, results: new Map((out.results || []).map((x) => [String(x.id), x.same === true || x.same === 'true'])) };
  }
  throw new Error(`groq: limite de uso atingido (${falhas.slice(-4).join(' | ')})`);
}

// ---------- Provedores de visão no formato OpenAI: OpenRouter (modelos :free) e OpenCode Zen (modelos *-free) ----------
// Entram depois do Gemini, quando a cota dele acaba, e só depois de passar numa prova própria (garantirProva) com os
// rótulos do dono: acertar >= META e mais que a regra. Chaves: OPENROUTER_API_KEY (já existe no repositório) e
// OPENCODE_API_KEY (conta gratuita em opencode.ai; sem ela esse provedor fica desligado). Modelos: JUIZ_OR_MODELS / JUIZ_ZEN_MODELS.
const COMPAT = {
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, models: (process.env.JUIZ_OR_MODELS || 'google/gemma-4-31b-it:free,nvidia/nemotron-3.5-super-vl:free').split(',').map((x) => x.trim()).filter(Boolean) },
  zen: { url: 'https://opencode.ai/inference/openai/v1/chat/completions', key: process.env.OPENCODE_API_KEY, models: (process.env.JUIZ_ZEN_MODELS || 'mimo-v2.6-flash-free,deepseek-v4.1-flash-free,nemotron-3.5-super-vl-free').split(',').map((x) => x.trim()).filter(Boolean) },
};
const LOTE_COMPAT = 8; // pares por pedido (até 16 fotos): modelos grátis aceitam menos imagens que o Gemini
const PROVA_COMPAT_N = Number(process.env.JUIZ_PROVA_N || 60); // pares da prova de cada provedor (uma passada só, para gastar pouca cota)
const modeloCompat = {}; // índice do modelo que respondeu por último, por provedor
function lerJsonSolto(t) {
  const txt = String(t ?? '').replace(/```(?:json)?/g, '');
  try { return JSON.parse(txt); } catch { /* texto em volta do JSON */ }
  const m = /\{[\s\S]*\}/.exec(txt);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
async function askCompat(prov, pairs, todos) {
  const cfg = COMPAT[prov];
  const examples = exemplosParecidos(pairs, todos);
  const content = [{ type: 'text', text: `${RULES}\n\nExemplos decididos pelo dono do site (A || B => resposta):\n${examples.map((e) => `${e.a} || ${e.b} => ${e.same ? 'mesmo' : 'diferente'}`).join('\n')}\n\nPares para decidir. As fotos de cada par vêm logo depois do texto dele; quando falta a foto de um lado, decida pelo texto. Responda SOMENTE um objeto JSON no formato {"results":[{"id":"1","same":true}]}, um item por par, com o mesmo id do par.` }];
  for (const p of pairs) {
    content.push({ type: 'text', text: `\nPar ${p.id}: A = ${p.a} || B = ${p.b}` });
    for (const [lado, url] of [['A', p.imgA], ['B', p.imgB]]) {
      const b64 = await photo(url);
      if (b64) content.push({ type: 'text', text: `foto ${lado} do par ${p.id}:` }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } });
    }
  }
  const erros = [];
  for (let k = 0; k < cfg.models.length; k++) {
    const i = ((modeloCompat[prov] ?? 0) + k) % cfg.models.length;
    const model = cfg.models[i];
    let r, t;
    try {
      r = await fetch(cfg.url, { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'X-Title': 'Bate Ofertas' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 3000, messages: [{ role: 'user', content }] }), signal: AbortSignal.timeout(180000) });
      t = await r.text();
    } catch (e) { erros.push(`${model}: ${e.message}`.slice(0, 110)); continue; }
    if (!r.ok) {
      erros.push(`${model}: ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 100)}`);
      if (r.status === 429 && /per.?day|FreeUsageLimit|free-models-per-day/i.test(t)) { falhas.push(...erros.slice(-2)); throw new Error(`${prov}: cota do dia esgotada`); }
      continue; // limite por minuto, modelo fora do ar ou imagem recusada: tenta o próximo modelo
    }
    let corpo = null;
    try { corpo = JSON.parse(t); } catch { /* resposta que não é JSON */ }
    const out = lerJsonSolto(corpo?.choices?.[0]?.message?.content);
    if (!out || !Array.isArray(out.results)) { erros.push(`${model}: resposta sem JSON`); continue; }
    modeloCompat[prov] = i;
    return { model: `${prov}:${model}`, results: new Map(out.results.map((x) => [String(x.id), x.same === true || x.same === 'true'])) };
  }
  falhas.push(...erros.slice(-3));
  throw new Error(`${prov}: limite de uso atingido (${erros.slice(-3).join(' | ')})`);
}
const loteDe = (prov) => (prov === 'groq' ? 10 : COMPAT[prov] ? LOTE_COMPAT : BATCH);
async function judge(pairs, examples) {
  const out = new Map();
  const lote = loteDe(provedor);
  for (let i = 0; i < pairs.length; i += lote) {
    const part = pairs.slice(i, i + lote).map((p, k) => ({ ...p, id: String(k + 1) }));
    const { model, results } = provedor === 'groq' ? await askGroq(part, examples) : COMPAT[provedor] ? await askCompat(provedor, part, examples) : await ask(part, examples);
    part.forEach((p, k) => { if (results.has(p.id)) out.set(pairs[i + k].key, { same: results.get(p.id), model }); });
    await sleep(4000);
  }
  return out;
}

// ofertas atuais (fotos e candidatos)
const offers = [];
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz/.test(x))) {
  const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  // farmácia fica fora do juiz por enquanto (Fase 14): junta com os mercados só pelo EAN, sem gastar cota
  if (Array.isArray(a)) offers.push(...a.filter((o) => o && o.name && o.price >= 0.1 && o.price < 20000 && o.segment !== 'farmacia'));
}
const imageOf = new Map(offers.filter((o) => o.imageUrl).map((o) => [offerKey(o), o.imageUrl]));
const candImgs = new Map();
try { for (const c of JSON.parse(fs.readFileSync(CANDS, 'utf8'))) candImgs.set(c.id, c); } catch { /* sem candidatos */ }

const state = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { ativo: false, prova: null, pares: {} };
state.pares ??= {};

try {
// ---------- 1. prova com os rótulos do Rafael ----------
const labels = JSON.parse(fs.readFileSync(LABELS, 'utf8')).filter((x) => x.label === 'mesmo' || x.label === 'diferente');
const asPair = (x) => ({
  key: x.id, a: fmt(x.a), b: fmt(x.b), same: x.label === 'mesmo',
  imgA: x.a.image || candImgs.get(x.id)?.a.image || imageOf.get(offerKey(x.a)),
  imgB: x.b.image || candImgs.get(x.id)?.b.image || imageOf.get(offerKey(x.b)),
});
const all = labels.map(asPair);
const hashDe = (prov) => crypto.createHash('sha1').update(JSON.stringify([labels.map((x) => [x.id, x.label]), RULES, prov === 'groq' ? 'groq:' + GROQ_MODEL : COMPAT[prov] ? prov + ':' + COMPAT[prov].models.join() : MODELS.join(), FOLDS, 'fotos-v1'])).digest('hex').slice(0, 12);
const hash = hashDe('gemini');
// prova do Groq (--provedor=groq): grava em provaGroq e não mexe na do Gemini nem no "ativo"
const groqAprovado = () => !!(GROQ_KEY && state.provaGroq?.hash === hashDe('groq') && state.provaGroq.taxa >= META && state.provaGroq.acertos > state.provaGroq.regra);
if (provedor === 'groq' && (state.provaGroq?.hash !== hashDe('groq') || process.argv.includes('--forcar-prova'))) {
  if (!GROQ_KEY) throw new Error('sem GROQ_API_KEY');
  const fold = (x) => parseInt(crypto.createHash('sha1').update(x.key).digest('hex').slice(0, 6), 16) % FOLDS;
  const v = new Map();
  for (let f = 0; f < FOLDS; f++) for (const [k, val] of await judge(all.filter((x) => fold(x) === f), all.filter((x) => fold(x) !== f))) v.set(k, val);
  let acertos = 0, regra = 0;
  const erros = [];
  for (const x of labels) {
    const truth = x.label === 'mesmo', got = v.get(x.id)?.same;
    if (got === truth) acertos++; else erros.push({ a: x.a.name, b: x.b.name, rafael: x.label, juiz: got === undefined ? 'sem resposta' : got ? 'mesmo' : 'diferente' });
    if ((x.kind !== 'separados') === truth) regra++;
  }
  state.provaGroq = { em: new Date().toISOString(), hash: hashDe('groq'), modelo: GROQ_MODEL, total: labels.length, acertos, regra, taxa: acertos / labels.length, erros };
  console.log(`juiz Groq: prova ${acertos}/${labels.length} (${(100 * acertos / labels.length).toFixed(1)}%); regra ${regra}; aprovado: ${groqAprovado()}`);
  for (const e of erros) console.log(`  erro Groq: ${e.a} x ${e.b} -> Rafael ${e.rafael}, juiz ${e.juiz}`);
}
// Prova dos provedores no formato OpenAI (state.provas[prov]). Feita na hora em que o provedor vai ser usado, uma passada só com
// até PROVA_COMPAT_N rótulos que têm foto; resposta que falta (cota, instabilidade) não conta como erro: 20% ou mais sem resposta
// abandona a prova e o provedor fica desligado nesta rodada.
state.provas ??= {};
const aprovadoCompat = (prov) => { const pr = state.provas[prov]; return !!(COMPAT[prov]?.key && pr?.hash === hashDe(prov) && pr.taxa >= META && pr.acertos > pr.regra); };
const tentouProva = new Set();
async function garantirProva(prov, forcar = false) {
  if (!COMPAT[prov]?.key) return false;
  if (!forcar && state.provas[prov]?.hash === hashDe(prov)) return aprovadoCompat(prov);
  if (tentouProva.has(prov)) return false; // uma tentativa por rodada
  tentouProva.add(prov);
  const hs = (x) => parseInt(crypto.createHash('sha1').update(x.key).digest('hex').slice(0, 6), 16);
  const amostra = all.filter((x) => x.imgA || x.imgB).sort((a, b) => hs(a) - hs(b)).slice(0, PROVA_COMPAT_N);
  if (amostra.length < 20) return false;
  const chaves = new Set(amostra.map((x) => x.key));
  const exemplos = all.filter((x) => !chaves.has(x.key));
  const anterior = provedor;
  provedor = prov;
  let v;
  try { v = await judge(amostra, exemplos); }
  catch (e) { state.provas[prov] = { em: new Date().toISOString(), hash: null, erro: String(e.message).slice(0, 300) }; console.warn(`juiz ${prov}: prova não concluída: ${e.message}`); return false; }
  finally { provedor = anterior; }
  const sem = amostra.filter((x) => v.get(x.key)?.same === undefined).length;
  if (sem / amostra.length >= 0.2) { state.provas[prov] = { em: new Date().toISOString(), hash: null, erro: `${sem} de ${amostra.length} sem resposta` }; console.warn(`juiz ${prov}: prova abandonada (${sem} de ${amostra.length} sem resposta)`); return false; }
  let acertos = 0, regra = 0;
  const erros = [];
  for (const x of amostra) {
    const got = v.get(x.key)?.same;
    if (got === x.same) acertos++; else erros.push({ a: x.a, b: x.b, rafael: x.same ? 'mesmo' : 'diferente', juiz: got === undefined ? 'sem resposta' : got ? 'mesmo' : 'diferente' });
    const lab = labels.find((l) => l.id === x.key);
    if (((lab?.kind ?? 'juntos') !== 'separados') === x.same) regra++;
  }
  state.provas[prov] = { em: new Date().toISOString(), hash: hashDe(prov), modelos: [...new Set([...v.values()].map((r) => r.model))], total: amostra.length, acertos, regra, taxa: acertos / amostra.length, erros: erros.slice(0, 15) };
  console.log(`juiz ${prov}: prova ${acertos}/${amostra.length} (${(100 * acertos / amostra.length).toFixed(1)}%); regra ${regra}; aprovado: ${aprovadoCompat(prov)}`);
  return aprovadoCompat(prov);
}
// próximo provedor da cadeia depois do atual, já aprovado (ou aprovado agora, por uma prova na hora)
const ORDEM = ['gemini', 'openrouter', 'zen', 'groq'];
const aprovadoProv = (p) => (p === 'gemini' ? !!state.ativo : p === 'groq' ? groqAprovado() : aprovadoCompat(p));
async function proximoProvedor() {
  for (const p of ORDEM.slice(ORDEM.indexOf(provedor) + 1)) {
    if (p === 'groq' ? groqAprovado() : await garantirProva(p)) return p;
  }
  return null;
}
// --provedor=openrouter|zen: só a prova desse provedor (grava em state.provas e sai do julgamento)
if (COMPAT[provedor]) { await garantirProva(provedor, process.argv.includes('--forcar-prova')); }

// --aceitar-prova: o Rafael aceita a última prova feita (ex.: rodou com outra lista de modelos) sem gastar cota refazendo
if (process.argv.includes('--aceitar-prova') && state.prova) {
  state.prova.hash = hash;
  state.prova.aceitaPeloRafael = new Date().toISOString();
  state.ativo = state.prova.taxa >= META && state.prova.acertos > state.prova.regra;
  delete state.erro;
}
if (provedor === 'gemini' && (state.prova?.hash !== hash || process.argv.includes('--forcar-prova'))) {
  const fold = (x) => parseInt(crypto.createHash('sha1').update(x.key).digest('hex').slice(0, 6), 16) % FOLDS;
  const v = new Map();
  for (let f = 0; f < FOLDS; f++) {
    const test = all.filter((x) => fold(x) === f), examples = all.filter((x) => fold(x) !== f);
    for (const [k, val] of await judge(test, examples)) v.set(k, val);
  }
  const semResposta = labels.filter((x) => v.get(x.id)?.same === undefined).length;
  if (semResposta / labels.length >= 0.2) {
    // cota esgotada ou API instável no meio da prova: resposta vazia não é erro do juiz. Mantém a prova e o "ativo" de antes.
    console.warn(`juiz: prova abandonada (${semResposta} de ${labels.length} sem resposta); fica a prova anterior e o estado "ativo" não muda`);
    state.provaAbandonada = { em: new Date().toISOString(), semResposta, total: labels.length };
  } else {
  delete state.provaAbandonada;
  let acertos = 0, regra = 0;
  const erros = [];
  for (const x of labels) {
    const truth = x.label === 'mesmo';
    const got = v.get(x.id)?.same;
    if (got === truth) acertos++; else erros.push({ a: x.a.name, b: x.b.name, rafael: x.label, juiz: got === undefined ? 'sem resposta' : got ? 'mesmo' : 'diferente', modelo: v.get(x.id)?.model });
    if ((x.kind !== 'separados') === truth) regra++;
  }
  state.prova = { em: new Date().toISOString(), hash, total: labels.length, acertos, regra, taxa: acertos / labels.length, taxaRegra: regra / labels.length, fotos: all.filter((x) => x.imgA && x.imgB).length, modelos: [...new Set([...v.values()].map((x) => x.model))], trocas: falhas.slice(-10), erros };
  state.ativo = acertos / labels.length >= META && acertos > regra;
  delete state.erro;
  }
}
// Provedores de visão do formato OpenAI (OpenRouter, OpenCode): prova feita uma vez logo no começo, para saber cedo se prestam
// (cerca de 8 pedidos de cada); depois só se repete quando mudam rótulos, regras ou modelos. Falha aqui não afeta o Gemini.
for (const p of ['openrouter', 'zen']) { if (COMPAT[p].key && state.provas[p]?.hash !== hashDe(p)) await garantirProva(p); }
const pv = state.prova;
console.log(`juiz: prova ${pv.acertos}/${pv.total} (${(100 * pv.taxa).toFixed(0)}%); regra atual ${pv.regra}/${pv.total}; ativo: ${state.ativo}`);
if (pv.trocas?.length) console.log("  trocas de modelo:", pv.trocas.join(" | "));
for (const e of pv.erros) console.log(`  erro: ${e.a} x ${e.b} -> Rafael ${e.rafael}, juiz ${e.juiz} [${e.modelo}]`);

// ---------- 2. julga pares candidatos ----------
if (state.ativo && !process.argv.includes('--so-prova') && aprovadoProv(provedor)) {
  const sigs = offers.map(signature);
  const brands = brandKeys(offers);
  const eans = offers.map((o) => normalizeEan(o.ean));
  const ratio = (x, y) => Math.max(x, y) / Math.min(x, y);
  const diffOf = (a, b) => { const ca = sigs[a].core, cb = sigs[b].core; return [...ca].filter((t) => !cb.has(t)).length + [...cb].filter((t) => !ca.has(t)).length; };
  const cand = new Map();
  // Fase 18: par que a ficha já decidiu (mesmo ou conflito claro) não gasta cota de visão; o juiz fica com a zona cinzenta
  // com a ficha ainda fora do site (GROUP_FICHA != 1), só os conflitos claros ("diferente") saem da fila do juiz
  const porFicha = new Map([...vereditosPorFicha(offers, lerFichas().fichas)].filter(([, v]) => process.env.GROUP_FICHA === '1' || v === false));
  console.log(`juiz: ${porFicha.size} pares já decididos pela ficha`);
  const add = (a, b, d) => {
    const key = pairKey(offers[a], offers[b]);
    if (!state.pares[key] && !porFicha.has(key)) cand.set(key, { key, a: fmt(offers[a]), b: fmt(offers[b]), imgA: offers[a].imageUrl, imgB: offers[b].imageUrl, d, semEan: !eans[a] || !eans[b], ia: a, ib: b });
  };
  // mesma marca (informada ou deduzida do nome) e mesmo tamanho, nomes um pouco diferentes
  const buckets = new Map();
  sigs.forEach((s, i) => { const b = brands[i]; if (!s.size || !b) return; const k = s.size + '|' + b; (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i); });
  for (const idx of buckets.values()) {
    if (idx.length > 80) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = idx[x], b = idx[y];
      if (offers[a].market === offers[b].market || ratio(offers[a].price, offers[b].price) > 1.5) continue;
      if (eans[a] && eans[b]) continue; // os dois têm EAN: o código já decide
      const d = diffOf(a, b);
      if (d >= 1 && d <= 4) add(a, b, d);
    }
  }
  // mesmo EAN com nomes bem diferentes: pode ser código reaproveitado
  const byEan = new Map();
  eans.forEach((e, i) => { if (e) (byEan.get(e) ?? byEan.set(e, []).get(e)).push(i); });
  for (const idx of byEan.values()) for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
    const a = idx[x], b = idx[y];
    if (offers[a].market !== offers[b].market && diffOf(a, b) >= 3) add(a, b, diffOf(a, b));
  }
  // par que não muda o site: já estão no mesmo grupo, ou cada lado já tem comparação com o mercado do outro
  const vered = new Map(Object.entries(state.pares).map(([k, v]) => [k, v.same]));
  for (const x of labels) vered.set(pairKey(x.a, x.b), x.label === 'mesmo');
  const grupos = groupOffers(offers, (i, j) => vered.get(pairKey(offers[i], offers[j])));
  const grupoDe = new Array(offers.length);
  grupos.forEach((g, gi) => g.idx.forEach((i) => { grupoDe[i] = gi; }));
  const mercadosDo = grupos.map((g) => new Set(g.idx.map((i) => offers[i].market)));
  let semGanho = 0;
  for (const c of cand.values()) {
    const ga = grupoDe[c.ia], gb = grupoDe[c.ib]; // undefined = oferta sozinha
    if (ga === undefined || gb === undefined) continue;
    if (ga === gb || (mercadosDo[ga].has(offers[c.ib].market) && mercadosDo[gb].has(offers[c.ia].market))) { cand.delete(c.key); semGanho++; }
  }
  console.log(`juiz: ${semGanho} pares pulados (não mudariam o comparador)`);
  // um representante por produto com EAN: oferta sem EAN x vários mercados com o MESMO EAN (já agrupados pelo código)
  // é uma pergunta só; "mesmo" com um deles põe a oferta no grupo inteiro. Fica o par com menos palavras diferentes.
  const repr = new Map();
  for (const c of cand.values()) {
    const ea = eans[c.ia], eb = eans[c.ib];
    if (!ea === !eb) continue; // os dois sem EAN (ex.: Nagumo x Semar) ou EAN reaproveitado: julga todos
    const k = (ea ? offerKey(offers[c.ib]) : offerKey(offers[c.ia])) + '#' + (ea || eb);
    const atual = repr.get(k);
    if (!atual) repr.set(k, c);
    else { const fica = c.d < atual.d ? c : atual; cand.delete((fica === c ? atual : c).key); repr.set(k, fica); }
  }
  // filtro de regra: sabor/versão diferente dos dois lados = diferente, sem perguntar à IA
  let porRegra = 0;
  for (const [k, c] of cand) if (conflitoDeRegra(c.a, c.b)) { state.pares[k] = { same: false, model: 'regra', em: new Date().toISOString().slice(0, 10) }; cand.delete(k); porRegra++; }
  console.log(`juiz: ${porRegra} pares decididos pela regra de sabor/versão (sem IA)`);
  if (process.argv.includes('--contar')) {
    const por = {}; for (const c of cand.values()) { const m = [c.a.split(' | ')[0], c.b.split(' | ')[0]].sort().join(' x '); por[m] = (por[m] || 0) + 1; }
    const porD = {}; for (const c of cand.values()) porD[c.d] = (porD[c.d] || 0) + 1;
    console.log('por diferença de palavras:', porD); console.log(Object.entries(por).sort((x, y) => y[1] - x[1]).slice(0, 25));
    process.exit(0);
  }
  // primeiro os pares em que um lado não tem EAN (Nagumo, Semar, encartes), depois menos palavras diferentes
  // ordem: encartes primeiro (poucos e valiosos); depois a 1ª tentativa de cada oferta antes da 2ª; depois menos palavras diferentes
  const CATALOGOS = new Set(['Atacadão', 'Coop', 'Extra', 'Spani', 'Nagumo', 'Semar']);
  // item de jornal/encarte dentro de um mercado de catálogo (jornal do Spani) também conta como encarte
  const deEncarte = (o) => o.source === 'encarte' || !CATALOGOS.has(o.market);
  const encarte = (c) => deEncarte(offers[c.ia]) || deEncarte(offers[c.ib]);
  const vez = new Map(); // oferta -> quantos pares dela já vieram antes
  // Foto do Semar dá erro fora do navegador (bloqueio do site, não contornamos): par sem foto de nenhum lado não gasta cota de visão
  const semFoto = (o) => !o.imageUrl || o.market === 'Semar';
  const fila = [...cand.values()].filter((c) => !(semFoto(offers[c.ia]) && semFoto(offers[c.ib]))).sort((x, y) => x.d - y.d);
  for (const c of fila) { c.vez = Math.max(vez.get(c.ia) ?? 0, vez.get(c.ib) ?? 0); vez.set(c.ia, (vez.get(c.ia) ?? 0) + 1); vez.set(c.ib, (vez.get(c.ib) ?? 0) + 1); }
  // dentro do mesmo grau, o par mais provável de ser o mesmo produto vem primeiro (sem palavra de variante na diferença,
  // nomes parecidos, preço próximo): a cota do dia é pequena e o juiz quase sempre diz "diferente" para sabor e cor
  for (const c of fila) c.prob = probabilidade(sigs[c.ia].core, sigs[c.ib].core, offers[c.ia].price, offers[c.ib].price);
  fila.sort((x, y) => (encarte(y) - encarte(x)) || (x.vez - y.vez) || (y.prob - x.prob) || (x.d - y.d));
  const semVariante = fila.filter((c) => c.prob >= 2).length;
  console.log(`juiz: ${semVariante} de ${fila.length} pares sem palavra de variante na diferença (vão primeiro)`);
  console.log(`juiz: ${cand.size} pares sem veredito; até ${MAX_LOTES} lotes de ${BATCH}`);
  const examples = all;
  // oferta que já achou par num mercado nesta rodada não pergunta de novo sobre outro produto desse mercado
  const achou = new Set();
  const inutil = (c) => achou.has(c.ia + '>' + offers[c.ib].market) && achou.has(c.ib + '>' + offers[c.ia].market);
  let feitos = 0, pos = 0;
  for (let lote = 0; lote < MAX_LOTES && pos < fila.length && Date.now() < DEADLINE; lote++) {
    const part = [], posIni = pos;
    while (part.length < loteDe(provedor) && pos < fila.length) { const c = fila[pos++]; if (!inutil(c)) part.push(c); }
    try {
      const r = await judge(part, examples);
      for (const [k, val] of r) {
        state.pares[k] = { ...val, em: new Date().toISOString().slice(0, 10) }; feitos++;
        const c = cand.get(k);
        if (val.same && c) { achou.add(c.ia + '>' + offers[c.ib].market); achou.add(c.ib + '>' + offers[c.ia].market); }
      }
    } catch (e) {
      // Gemini sem cota: o Groq (só texto) continua, se passou na prova dele; o lote é refeito
      if (/cota do dia|limite de uso/.test(e.message)) {
        const prox = await proximoProvedor();
        if (prox) { console.log(`juiz: ${e.message}; seguindo com ${prox}`); provedor = prox; pos = posIni; lote--; continue; }
      }
      console.warn('juiz:', e.message); state.erro = { em: new Date().toISOString(), msg: String(e.message).slice(0, 600), falhas: falhas.slice(-10) }; break;
    }
  }
  console.log(`juiz: ${feitos} vereditos novos (${Object.values(state.pares).filter((v) => v.same && v.model !== 'regra').length} "mesmo" no total); total ${Object.keys(state.pares).length}`);
}
} catch (e) {
  // sem cota ou erro do Gemini: grava o motivo e mantém o que já havia (nada muda no site)
  state.erro = { em: new Date().toISOString(), msg: String(e.message).slice(0, 600), falhas: falhas.slice(-10) };
  console.warn('juiz: parou:', e.message);
}
// qual chave rodou (só o nome do segredo, nunca o valor): a própria do juiz ou a do leitor de encartes
state.chave = process.env.GEMINI_JUIZ_KEY ? 'GEMINI_JUIZ_KEY' : process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'nenhuma';
state.rodou = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(state));
