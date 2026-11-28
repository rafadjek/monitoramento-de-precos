// Fase 18.2: ficha de cada produto (marca, produto base, linha, versão, sabor/aroma), lida UMA vez por nome com IA só de
// texto e guardada em data/extraido/fichas.json. Serve para decidir "mesmo produto?" campo a campo (fichas-regra.mjs),
// no lugar de perguntar par a par. Tamanho e unidades NÃO vêm da IA: continuam com parseSize/parsePack (group.mjs).
// Provedores grátis, em ordem: Gemini Flash-Lite (cota própria por modelo, não disputa com o juiz, que usa o Flash),
// Groq e OpenRouter. Cota do dia esgotada num provedor = passa ao próximo; todos esgotados = para sem erro.
// O cache é gravado a cada lote: o que foi lido não se perde se a rodada parar no meio.
// Uso: node fichas.mjs [--max-lotes=N] [--minutos=N] [--nomes=arquivo.json (lista de nomes; padrão: todos)]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strip } from './group.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
export const ARQ_FICHAS = path.join(IN, 'fichas.json');
const VERSAO = 1; // muda quando o pedido muda de um jeito que invalida as fichas antigas
const LOTE = Number(process.env.FICHAS_LOTE || 40);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;

/** Chave da ficha: o nome sem acento, minúsculo e com espaços simples (o mesmo produto escrito igual em dois mercados lê uma vez). */
export const chaveNome = (nome) => strip(nome).toLowerCase().replace(/\s+/g, ' ').trim();

export function lerFichas(arq = ARQ_FICHAS) {
  try {
    const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
    return j.versao === VERSAO ? j : { versao: VERSAO, fichas: {} };
  } catch { return { versao: VERSAO, fichas: {} }; }
}

export const PEDIDO = `Você recebe nomes de produtos de supermercados brasileiros, cada um com um id.
Para cada um, devolva a ficha com estes campos (texto curto, minúsculo, sem acento; "" quando o nome não diz):
- marca: a marca comercial (ex.: "old spice", "3 coracoes", "dona benta", "personal vip"). Não use o nome do mercado.
- produto: o tipo de produto, genérico (ex.: "desodorante", "papel higienico", "cafe", "mistura para bolo", "cerveja").
- linha: submarca ou linha de produto, se houver (ex.: "ultra", "luminous white", "hot bowls", "golden black", "sports men", "botanicals", "pure gold").
- versao: o que muda a receita ou o uso: zero, light, diet, integral, desnatado, sem lactose, sem gluten, com gas, sem gas, sem sal, extra forte, tradicional, original, infantil, concentrado, puro malte, etc. Várias juntas com vírgula.
- sabor: sabor, aroma, fragrância, cor ou tipo de uva (ex.: "brisa do mar", "morango", "orquidea negra", "carmenere", "sauvignon blanc").
Ignore embalagem e apresentação (lata, garrafa, pet, pacote, sachê, refil, aerosol, almofada, vácuo, caixa, pote, leve x pague, promoção),
peso, volume e quantidade: isso é tratado à parte.
Responda só JSON: {"itens":[{"id":"...","marca":"...","produto":"...","linha":"...","versao":"...","sabor":"..."}]}`;

const CAMPOS = ['marca', 'produto', 'linha', 'versao', 'sabor'];
const limpa = (v) => strip(String(v ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
/** Valida a resposta da IA: só itens com id pedido e os 5 campos em texto. */
export function interpretar(texto, ids) {
  const j = JSON.parse(String(texto).replace(/^```(json)?|```$/gm, '').trim());
  const out = new Map();
  for (const it of j.itens ?? []) {
    const id = String(it.id);
    if (!ids.has(id) || typeof it !== 'object') continue;
    out.set(id, Object.fromEntries(CAMPOS.map((c) => [c, limpa(it[c])])));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class CotaEsgotada extends Error {}

// ---------- provedores ----------
const geminiKeys = () => {
  const extras = Object.keys(process.env).filter((k) => /^GEMINI_JUIZ_KEY_\d+$/.test(k)).sort().map((k) => process.env[k]);
  return [...new Set([process.env.GEMINI_JUIZ_KEY, ...extras, process.env.GEMINI_API_KEY].filter(Boolean))];
};
const GEMINI_MODELS = (process.env.FICHAS_GEMINI_MODELS || 'gemini-flash-lite-latest,gemini-3.5-flash-lite').split(',').map((x) => x.trim()).filter(Boolean);

function provedores() {
  // Só no PC do Rafael: escada de modelos grátis do OpenCode (apoio\ferramentas\oc-livre.ps1), que troca sozinha de modelo.
  if (process.env.FICHAS_PROVEDORES === 'oclivre') return [{ nome: 'oclivre', tipo: 'oclivre', lote: Number(process.env.FICHAS_LOTE_OC || 60) }];
  if (process.env.FICHAS_PROVEDORES === 'codex') return [{ nome: 'codex', tipo: 'codex', lote: Number(process.env.FICHAS_LOTE_CODEX || 100) }];
  const lista = [];
  for (const key of geminiKeys()) for (const model of GEMINI_MODELS) lista.push({ nome: `gemini:${model}`, tipo: 'gemini', key, model });
  if (process.env.GROQ_API_KEY) lista.push({ nome: 'groq', tipo: 'openai', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: process.env.FICHAS_GROQ_MODEL || 'openai/gpt-oss-120b', lote: 25 });
  if (process.env.OPENROUTER_API_KEY) for (const model of (process.env.FICHAS_OR_MODELS || 'google/gemma-4-31b-it:free,meta-llama/llama-4-maverick:free').split(','))
    lista.push({ nome: `openrouter:${model}`, tipo: 'openai', url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model });
  if (process.env.MISTRAL_API_KEY) for (const model of (process.env.FICHAS_MISTRAL_MODELS || 'mistral-small-latest,open-mistral-nemo').split(',').map((x) => x.trim()).filter(Boolean))
    lista.push({ nome: `mistral:${model}`, tipo: 'openai', url: 'https://api.mistral.ai/v1/chat/completions', key: process.env.MISTRAL_API_KEY, model });
  if (process.env.OPENCODE_API_KEY) for (const model of (process.env.FICHAS_ZEN_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean))
    lista.push({ nome: `zen:${model}`, tipo: 'openai', url: 'https://opencode.ai/inference/openai/v1/chat/completions', key: process.env.OPENCODE_API_KEY, model });
  return lista;
}

export async function pedir(p, itens) {
  const texto = `${PEDIDO}\n\n${JSON.stringify(itens)}`;
  if (p.tipo === 'oclivre') {
    const arq = path.join(process.env.TEMP || 'D:\\Temp', `ficha-pedido-${process.pid}.txt`);
    fs.writeFileSync(arq, texto);
    const r = spawnSync('powershell', ['-NoProfile', '-File', 'D:\\Projetos Claude\\apoio\\ferramentas\\oc-livre.ps1', '-Tipo', 'texto', '-ArquivoPedido', arq, '-TimeoutSeg', '240'], { encoding: 'utf8', maxBuffer: 64e6 });
    if (r.status !== 0) throw new Error(`oc-livre saiu com ${r.status}: ${String(r.stderr).slice(-120)}`);
    const m = /\[oc-livre\] modelo: (\S+)/.exec(String(r.stderr));
    if (m) p.nome = `oclivre:${m[1]}`;
    return r.stdout;
  }
  if (p.tipo === 'codex') {
    // Só no PC do Rafael: Codex CLI logado com a conta do ChatGPT (codex exec lê o pedido da entrada padrão).
    const saida = path.join(process.env.TEMP || 'D:\Temp', `codex-ficha-${process.pid}-${Date.now()}.txt`);
    const r = spawnSync('codex.cmd', ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--output-last-message', saida, '-'], { input: texto, encoding: 'utf8', maxBuffer: 64e6, shell: true, cwd: process.env.TEMP || 'D:\Temp', timeout: 600000 });
    if (r.status !== 0 || !fs.existsSync(saida)) throw new Error(`codex saiu com ${r.status}: ${String(r.stderr || r.error).slice(-160)}`);
    const out = fs.readFileSync(saida, 'utf8'); fs.rmSync(saida, { force: true });
    if (/usage limit|rate limit|quota/i.test(out + r.stderr) && !out.includes('"itens"')) throw new CotaEsgotada('codex: limite de uso');
    return out;
  }
  let ultimo = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let r;
    try {
      r = p.tipo === 'gemini'
        ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
          body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'minimal' } } }), signal: AbortSignal.timeout(150000) })
        : await fetch(p.url, { method: 'POST', headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: p.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: texto }] }), signal: AbortSignal.timeout(120000) });
    } catch (e) { ultimo = e.message; await sleep(5000); continue; }
    if (r.status === 429) {
      const t = await r.text();
      if (/per.?day|PerDay|\(RPD\)|\(TPD\)|free-models-per-day|limit: 0/i.test(t)) throw new CotaEsgotada(t.slice(0, 120));
      ultimo = '429 ' + t.replace(/\s+/g, ' ').slice(0, 100);
      await sleep(Math.min((Number(r.headers.get('retry-after')) || 20) + 1, 65) * 1000);
      continue;
    }
    if (r.status >= 500) { ultimo = r.status + ' ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 100); await sleep(10000); continue; }
    if (!r.ok) throw new Error(`${p.nome} ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    return p.tipo === 'gemini' ? j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') ?? '' : j.choices?.[0]?.message?.content ?? '';
  }
  throw new Error(`sem resposta depois de 3 tentativas (${ultimo})`);
}

/** Lê as fichas dos nomes que faltam, gravando o cache a cada lote. Devolve um resumo.
 *  `paralelo` trabalhadores leem lotes ao mesmo tempo, cada um começando num provedor diferente. */
export async function lerNovas(nomes, { maxLotes = Infinity, minutos = 40, arq = ARQ_FICHAS, paralelo = Number(process.env.FICHAS_PARALELO || 1) } = {}) {
  const base = lerFichas(arq);
  const faltam = [...new Map(nomes.map((n) => [chaveNome(n), n])).entries()].filter(([k]) => k && !base.fichas[k]);
  const fim = Date.now() + minutos * 60e3;
  const lista = provedores();
  let lotes = 0, lidas = 0, pos = 0;
  const erros = [], usados = {}, esgotado = new Set();
  const refazer = []; // lotes que um provedor não conseguiu ler: outro tenta
  // Sobrecarga (503) ou resposta ruim: o trabalhador passa ao próximo provedor e o lote volta à fila. Só a cota do dia
  // esgotada descarta o provedor. Para quando todos esgotaram ou quando o trabalhador falha duas voltas seguidas.
  const proximo = (pi) => { for (let k = 1; k <= lista.length; k++) { const j = (pi + k) % lista.length; if (!esgotado.has(j)) return j; } return -1; };
  async function trabalhador(w) {
    let pi = w % lista.length, falhasSeguidas = 0;
    while (Date.now() < fim && lotes < maxLotes && esgotado.size < lista.length && falhasSeguidas < 2 * lista.length) {
      if (esgotado.has(pi)) { pi = proximo(pi); if (pi < 0) break; }
      const p = lista[pi];
      let parte = refazer.shift();
      if (!parte) { if (pos >= faltam.length) break; parte = faltam.slice(pos, pos + (p.lote ?? LOTE)); pos += parte.length; }
      const itens = parte.map(([, nome], i) => ({ id: String(i + 1), nome }));
      try {
        const resp = interpretar(await pedir(p, itens), new Set(itens.map((x) => x.id)));
        const hoje = new Date().toISOString().slice(0, 10);
        parte.forEach(([k], i) => { const f = resp.get(String(i + 1)); if (f && f.produto) { base.fichas[k] = { ...f, m: p.nome, em: hoje }; lidas++; } });
        fs.writeFileSync(arq, JSON.stringify(base));
        usados[p.nome] = (usados[p.nome] ?? 0) + 1;
        lotes++; falhasSeguidas = 0;
      } catch (e) {
        erros.push(`${p.nome}: ${String(e.message).slice(0, 120)}`);
        refazer.push(parte);
        if (e instanceof CotaEsgotada) esgotado.add(pi);
        falhasSeguidas++;
        pi = proximo(pi);
        if (pi < 0) break;
        await sleep(Math.min(30000, 3000 * falhasSeguidas));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, (_, w) => trabalhador(w)));
  return { faltavam: faltam.length, lidas, lotes, usados, erros: erros.slice(-8), total: Object.keys(base.fichas).length };
}

// ---------- rodada do Actions ----------
const direto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direto) {
  let nomes;
  const arqNomes = arg('nomes', null);
  if (arqNomes) nomes = JSON.parse(fs.readFileSync(path.resolve(arqNomes), 'utf8'));
  else {
    // primeiro os nomes de quem tem par duvidoso (tools/fila-provavel.mjs --nomes grava a lista); depois todos
    nomes = [];
    try { nomes.push(...JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/fila-nomes.json'), 'utf8'))); } catch { /* sem fila */ }
    for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !/encartes|meta|verificacao|leitura|juiz|fichas|social-status/.test(x))) {
      const a = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
      if (Array.isArray(a)) for (const o of a) if (o?.name && o.segment !== 'farmacia') nomes.push(o.name);
    }
  }
  if (!provedores().length) { console.log('fichas: nenhuma chave de IA, pulando'); process.exit(0); }
  if (arg('reverso', null) !== null) nomes = [...nomes].reverse();
  const r = await lerNovas(nomes, { arq: arg('arq', ARQ_FICHAS), maxLotes: Number(arg('max-lotes', Infinity)), minutos: Number(arg('minutos', 40)) });
  console.log(`fichas: ${r.lidas} lidas em ${r.lotes} lotes (faltavam ${r.faltavam}); total no cache ${r.total}; uso ${JSON.stringify(r.usados)}`);
  if (r.erros.length) console.log('fichas: trocas de provedor:', r.erros.join(' | '));
}
