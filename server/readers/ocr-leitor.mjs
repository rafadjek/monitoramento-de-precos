// Leitor de encarte "OCR primeiro": RapidOCR (readers/ocr.py) tira o texto e as posições da página, um modelo de TEXTO
// grátis monta os produtos, e o código confere cada preço contra o OCR. Se algo não bater, quem chama manda a página
// para o Gemini (visão), que é o leitor de reserva. Ver Fase 15.4 do plano.
// Modelos de texto, nesta ordem (todos grátis): Gemma 4 pela GEMINI_API_KEY, Groq (GROQ_API_KEY), OpenRouter (OPENROUTER_API_KEY).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(AQUI, '..');
const CACHE_OCR = path.join(ROOT, 'data/cache/ocr');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
// PDF com mais páginas que isso não passa pelo OCR (um pedido por página gastaria a cota de texto à toa): vai direto ao Gemini
const MAX_PAGINAS_PDF = Number(process.env.OCR_MAX_PDF_PAGES || 4);

// ---------- 1. OCR (Python) ----------
export const pythonOcr = () => process.env.OCR_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
let ocrIndisponivel = null; // motivo, se o Python ou os pacotes faltarem: não tenta de novo nesta execução

// Roda ocr.py numa imagem ou PDF (conteúdo em buf). Devolve a lista de páginas { w, h, linhas:[{t, box}] }.
// Cache em data/cache/ocr/<sha1 do conteúdo>.json.
export async function ocrPaginas(buf) {
  const f = path.join(CACHE_OCR, sha1(buf) + '.json');
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { fs.rmSync(f); } }
  if (ocrIndisponivel) throw new Error(ocrIndisponivel);
  const tmp = path.join(os.tmpdir(), `ocr-${sha1(buf).slice(0, 12)}-${process.pid}`);
  fs.writeFileSync(tmp, buf);
  try {
    const out = await new Promise((resolve, reject) => {
      execFile(pythonOcr(), [path.join(AQUI, 'ocr.py'), tmp], { maxBuffer: 256 << 20, timeout: 600000, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
        (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
    });
    const pags = JSON.parse(out);
    const erro = pags.find((p) => p.erro)?.erro;
    if (!pags.length || erro) throw new Error(`ocr.py: ${erro ?? 'sem páginas'}`);
    fs.mkdirSync(CACHE_OCR, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(pags));
    return pags;
  } catch (e) {
    if (e.code === 'ENOENT' || /No module named|ModuleNotFoundError|ImportError/.test(e.stderr ?? '')) {
      ocrIndisponivel = e.code === 'ENOENT' ? `ocr indisponível: Python não encontrado (${pythonOcr()})` : `ocr indisponível: pacotes Python faltando (${String(e.stderr).trim().split('\n').pop()})`;
      throw new Error(ocrIndisponivel);
    }
    throw new Error(`ocr falhou: ${String(e.stderr || e.message).trim().split('\n').pop().slice(0, 200)}`);
  } finally { fs.rmSync(tmp, { force: true }); }
}

// ---------- 2. Linhas numeradas (0 a 1000, ordem de leitura) ----------
export function normalizarLinhas(pag) {
  const n = (v, m) => Math.max(0, Math.min(1000, Math.round((v / m) * 1000)));
  const ls = (pag.linhas ?? []).map((l) => ({ t: String(l.t).trim(), x0: n(l.box[0], pag.w), y0: n(l.box[1], pag.h), x1: n(l.box[2], pag.w), y1: n(l.box[3], pag.h) })).filter((l) => l.t);
  ls.sort((a, b) => (Math.abs(a.y0 - b.y0) < 8 ? a.x0 - b.x0 : a.y0 - b.y0));
  return ls.map((l, i) => ({ n: i + 1, ...l }));
}
export const textoLinhas = (ls) => ls.map((l) => `${l.n} [${l.x0},${l.y0},${l.x1},${l.y1}] ${l.t}`).join('\n');
export const estimarTokens = (s) => Math.ceil(String(s).length / 3); // conservador (português com números)

// ---------- 3. Preços no texto do OCR ----------
const CENT = /^[,.]?\s*(\d{2})$/;
const INTEIRO = /^(?:R\$\s*)?(\d{1,4})$/;
const INTEIRO_VIRGULA = /^(?:R\$\s*)?(\d{1,4})[,.]?$/; // "35,": inteiro grande com a vírgula; os centavos vêm em outra linha
// Todos os preços que o OCR deixa ler: inteiros com centavos na mesma linha ("7,89", "R$ 24,90", "1.299,00") e preços
// partidos em duas linhas vizinhas ("7" + ",89"), achados pela posição (centavos logo à direita do inteiro).
// Devolve { set: Set de centavos inteiros, total: quantas ocorrências de preço há na página, inteiros: Set de reais inteiros soltos }.
export function precosDoOcr(ls) {
  const set = new Set(), inteiros = new Set();
  let total = 0;
  const reTudo = /(?<![\d,.])(\d{1,3}(?:\.\d{3})+|\d{1,4})\s*[,.]\s*(\d{2})(?!\d)/g;
  for (const l of ls) {
    for (const m of l.t.matchAll(reTudo)) { set.add(Number(m[1].replace(/\./g, '')) * 100 + Number(m[2])); total++; }
    const mi = INTEIRO.exec(l.t.trim()); if (mi) inteiros.add(Number(mi[1]));
    const ms = /^(?:R\$\s*)?(\d{1,4})\s+(\d{2})$/.exec(l.t.trim()); // "4 99": vírgula perdida pelo OCR, linha só com o preço
    if (ms) { set.add(Number(ms[1]) * 100 + Number(ms[2])); total++; }
  }
  // preço partido em duas linhas ("35," e "90"; "7" e ",89"), achado pela posição: os centavos ficam à direita do inteiro
  // (ou sobre a sua metade direita), na altura do topo. Vale o inteiro mais próximo e, se houver empate de vizinhança, o segundo.
  for (const c of ls) {
    const mc = CENT.exec(c.t.trim()); if (!mc) continue;
    const cands = ls.filter((i) => i !== c && INTEIRO_VIRGULA.test(i.t.trim())
      && c.x0 >= (i.x0 + i.x1) / 2 && c.x0 - i.x1 <= 90 && c.y0 >= i.y0 - 80 && c.y0 <= i.y1 + 10)
      .sort((x, y) => (Math.abs(c.x0 - x.x1) + Math.abs(c.y0 - x.y0)) - (Math.abs(c.x0 - y.x1) + Math.abs(c.y0 - y.y0))).slice(0, 2);
    for (const ci of cands) set.add(Number(INTEIRO_VIRGULA.exec(ci.t.trim())[1]) * 100 + Number(mc[1]));
    if (cands.length) total++;
  }
  return { set, total, inteiros };
}
export const precoPresente = (p, ocr) => {
  const c = Math.round(p * 100);
  return ocr.set.has(c) || (c % 100 === 0 && (ocr.inteiros.has(c / 100) || ocr.set.has(c)));
};

// ---------- 4. Conferência dos produtos devolvidos pelo modelo contra o OCR ----------
const precosDe = (it) => [it.price, it.listPrice, ...(Array.isArray(it.others) ? it.others.map((o) => o?.price) : [])].filter((x) => x != null);
// Devolve { ok, motivo, ... }. Rejeita: preço que não está no OCR (inclusive o "de" e os alternativos), preço que não é
// número, e quantidade de itens/preços incoerente com a quantidade de preços da página.
export function conferir(products, ls) {
  if (!Array.isArray(products)) return { ok: false, motivo: 'products não é lista' };
  const ocr = precosDoOcr(ls);
  const ausentes = [];
  let usados = 0;
  for (const it of products) {
    if (!it || typeof it.name !== 'string') return { ok: false, motivo: 'item sem nome' };
    for (const p of precosDe(it)) {
      if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) return { ok: false, motivo: `preço inválido em "${it.name}"` };
      usados++;
      if (!precoPresente(p, ocr)) ausentes.push(`${p} (${it.name.slice(0, 40)})`);
    }
  }
  if (ausentes.length) return { ok: false, motivo: `preço fora do OCR: ${ausentes.slice(0, 4).join('; ')}${ausentes.length > 4 ? ` (+${ausentes.length - 4})` : ''}`, ausentes };
  // coerência de quantidades: o modelo não pode citar mais preços do que a página tem, nem deixar de fora mais da metade
  if (usados > ocr.total + 2) return { ok: false, motivo: `${usados} preços nos itens, só ${ocr.total} no OCR` };
  if (ocr.total >= 4 && products.length === 0) return { ok: false, motivo: `0 itens, mas ${ocr.total} preços no OCR` };
  if (ocr.total >= 6 && usados < ocr.total * 0.5 - 1) return { ok: false, motivo: `${usados} preços nos itens, ${ocr.total} no OCR (leitura incompleta)` };
  if (products.length > ocr.total + 2) return { ok: false, motivo: `${products.length} itens, só ${ocr.total} preços no OCR` };
  return { ok: true, itens: products.length, precosNoOcr: ocr.total, precosUsados: usados };
}

// ---------- 5. Caixa da foto a partir das linhas do item ----------
// União das linhas citadas, ampliada: a foto costuma ficar acima ou ao lado do nome. Formato [y0,x0,y1,x1] de 0 a 1000
// (o mesmo que build-site.mjs usa em crop). Linha inexistente ou união grande demais (linha citada errada): sem caixa.
export function imageBoxDe(numeros, ls) {
  const sel = (Array.isArray(numeros) ? numeros : []).map((k) => ls[Number(k) - 1]).filter(Boolean);
  if (!sel.length) return null;
  const x0 = Math.min(...sel.map((l) => l.x0)), y0 = Math.min(...sel.map((l) => l.y0));
  const x1 = Math.max(...sel.map((l) => l.x1)), y1 = Math.max(...sel.map((l) => l.y1));
  const w = x1 - x0, h = y1 - y0;
  if (w > 600 || h > 500) return null;
  const c = (v) => Math.max(0, Math.min(1000, Math.round(v)));
  const cx = Math.max(12, w * 0.2);
  const box = [c(y0 - Math.max(40, h * 0.7)), c(x0 - cx), c(y1 + h * 0.1 + 4), c(x1 + cx)];
  return box[2] - box[0] >= 20 && box[3] - box[1] >= 20 ? box : null;
}

// ---------- 6. Prompt ----------
// Parte própria do OCR + os erros conhecidos do modelo de texto (comparação de 19/11). promptBase é o PROMPT da imagem.
const REGRAS_OCR = `Você recebe o resultado de OCR de UMA página de encarte (folheto) de supermercado brasileiro, escrito abaixo.
Cada linha do OCR é: N [x0,y0,x1,y1] texto — N é o número da linha; o retângulo é a posição do texto na página, de 0 a 1000 (x da esquerda para a direita, y de cima para baixo). As linhas estão em ordem de leitura aproximada.
Como montar os produtos a partir do OCR:
- Um produto = o nome (uma ou mais linhas próximas, com marca e tamanho) + o preço mais próximo, na mesma célula da página. Em geral o preço fica logo abaixo ou ao lado do nome, a menos de ~150 unidades. Pelas posições, linhas de colunas ou células diferentes são produtos diferentes.
- Preço grande costuma vir partido: "R$" sozinho, a parte inteira ("7") e os centavos (",89" ou "89") em linhas vizinhas. Junte: 7 + ,89 = 7.89. Um inteiro grande com um número de 2 dígitos menor colado à direita são reais e centavos.
- Texto de propaganda da foto (marcas na embalagem, "+maciez", "novo") não é nome nem preço. "Leve 16 Pague 15" é condição.
- O OCR erra letras: corrija só erro óbvio de letra no nome ("Fotha" -> "Folha"). Para preço, use EXATAMENTE o que o OCR leu: preço ilegível ou ambíguo, omita o produto. Todo preço que você devolver tem de aparecer no texto do OCR.
- Em cada produto, "linhas" = os números das linhas do OCR usados nele (nome, tamanho, todos os preços). Só números que existem.
Exemplos dos erros mais comuns (siga):
- Linhas "R$ 2,99 CADA" e embaixo "R$ 2,79 A PARTIR DE 3 UN.": price = 2.99 (o preço principal é o "cada", nunca o "a partir de"), others = [{"price": 2.79, "condition": "a partir de 3 un."}].
- "de 8,99" e "por 6,99": price = 6.99, listPrice = 8.99.
- Pacote com "neste pacote o quilo sai por 12,98" e preço do pacote 64,90: price = 64.9 (preço do pacote), condition = null, e o 12,98 não entra em lugar nenhum.
- Preço "7" + ",89" em linhas vizinhas: price = 7.89.
Regras do encarte (as mesmas do leitor por imagem):
`;
const FORMATO = `
Formato da resposta (só JSON, sem texto antes ou depois, sem markdown):
{"validFrom": "AAAA-MM-DD"|null, "validUntil": "AAAA-MM-DD"|null, "products": [{"name": str, "brand": str|null, "size": str|null, "price": número, "listPrice": número|null, "condition": str|null, "others": [{"price": número, "condition": str}], "category": "alimenticios"|"higiene"|"limpeza"|"outros", "validFrom": str|null, "validUntil": str|null, "linhas": [números das linhas do OCR]}]}`;
export function promptOcr(promptBase, blockRule = '') {
  let p = promptBase.replace(/^Você lê uma página[^\n]*\n/, '').replace(/- box = [^\n]*\n/, '');
  if (blockRule) p = p.replace('Responda só com o objeto JSON.', blockRule.trim() + ' Responda só com o objeto JSON.');
  return REGRAS_OCR + p;
}

// JSON do texto do modelo (aceita cerca de markdown e texto em volta). Devolve null se não for JSON completo.
export function lerJson(texto) {
  const t = String(texto ?? '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { const j = JSON.parse(t.slice(a, b + 1)); return j && typeof j === 'object' ? j : null; } catch { return null; }
}

// ---------- 7. Modelos de texto ----------
// Erro de infraestrutura (cota, rede, chave): o modelo sai da vez e o próximo é tentado. Diferente de resposta ruim.
export class Indisponivel extends Error {}
const ESPERA_MAX_S = 90;
const retryEm = (txt, header) => {
  const m = /retry(?:\s*in|Delay"?\s*:\s*")\s*([\d.]+)\s*s/i.exec(txt);
  return Math.min(Math.ceil(Number(m?.[1] ?? header ?? 20)) + 1, ESPERA_MAX_S);
};
// Janela móvel de tokens de entrada por minuto: espera até caber (Gemma 4: 16 mil/min; Groq grátis: ~8 mil/min)
async function esperarCota(prov, tokens, sleepFn = sleep) {
  for (;;) {
    const agora = Date.now();
    prov.janela = (prov.janela ?? []).filter((x) => agora - x.t < 60000);
    const usado = prov.janela.reduce((s, x) => s + x.tokens, 0);
    if (usado + tokens <= prov.tpm || !prov.janela.length) break;
    await sleepFn(Math.max(500, 60000 - (agora - prov.janela[0].t) + 500));
  }
  prov.janela.push({ t: Date.now(), tokens });
}
// 429/5xx: espera o "retry in" e repete; cota do dia ou 3 recusas seguidas desligam o modelo nesta execução
async function pedir(prov, nome, fazer, tokens, sleepFn = sleep) {
  let ultimo = '';
  for (let tent = 0; tent < 4; tent++) {
    await esperarCota(prov, tokens, sleepFn);
    let r;
    try { r = await fazer(); } catch (e) { ultimo = e.message; await sleepFn(5000); continue; }
    if (r.status === 429 || r.status >= 500) {
      const txt = (await r.text()).replace(/\s+/g, ' ');
      ultimo = `${r.status} ${txt.slice(0, 120)}`;
      if (/PerDay|per day|\(TPD\)|\(RPD\)|daily/i.test(txt)) { prov.off = true; throw new Indisponivel(`${nome}: cota do dia esgotada`); }
      await sleepFn(retryEm(txt, r.headers.get('retry-after')) * 1000);
      continue;
    }
    if (r.status === 401 || r.status === 403 || r.status === 404) { prov.off = true; throw new Indisponivel(`${nome}: HTTP ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 100)}`); }
    if (!r.ok) throw new Indisponivel(`${nome}: HTTP ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 100)}`);
    return r.json();
  }
  prov.falhas = (prov.falhas ?? 0) + 1;
  if (prov.falhas >= 3) prov.off = true;
  throw new Indisponivel(`${nome}: limite de uso atingido (${ultimo})`);
}

// Lista de modelos de texto na ordem do plano. chamar(prompt) devolve o texto da resposta.
export function provedoresTexto(env = process.env) {
  const lista = [];
  if (env.GEMINI_API_KEY) {
    const modelo = env.GEMMA_MODEL || 'gemma-4-31b-it';
    const p = { nome: modelo, tpm: 15000, maxEntrada: 15000, janela: [] };
    // Gemma não aceita systemInstruction nem esquema de resposta: tudo vai no texto e o JSON é conferido aqui
    p.chamar = async (prompt) => {
      const j = await pedir(p, `gemma ${modelo}`, () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }), signal: AbortSignal.timeout(300000),
      }), estimarTokens(prompt));
      return (j.candidates?.[0]?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? '').join('');
    };
    lista.push(p);
  }
  if (env.GROQ_API_KEY) {
    const modelo = env.GROQ_TEXT_MODEL || env.GROQ_MODEL || 'openai/gpt-oss-120b'; // o mesmo modelo que o juiz usa
    const p = { nome: 'groq:' + modelo, tpm: 7500, maxEntrada: Number(env.GROQ_MAX_TOKENS || 6000), janela: [] };
    p.chamar = async (prompt) => {
      const j = await pedir(p, 'groq', () => fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0, response_format: { type: 'json_object' }, reasoning_effort: /gpt-oss/.test(modelo) ? 'low' : 'none', messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(120000),
      }), estimarTokens(prompt) + 2500);
      return j.choices?.[0]?.message?.content ?? '';
    };
    lista.push(p);
  }
  if (env.OPENROUTER_API_KEY) {
    // modelos :free mudam com frequência: lista separada por vírgula, o próximo entra se o anterior sumir
    const modelos = (env.OPENROUTER_TEXT_MODEL || 'google/gemma-4-31b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free').split(',');
    const p = { nome: 'openrouter:' + modelos[0], tpm: 30000, maxEntrada: 30000, janela: [] };
    p.chamar = async (prompt) => {
      let ultimo;
      for (const modelo of modelos) {
        p.nome = 'openrouter:' + modelo; p.off = false;
        try {
          const j = await pedir(p, 'openrouter', () => fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
            body: JSON.stringify({ model: modelo, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
          }), estimarTokens(prompt));
          const t = j.choices?.[0]?.message?.content ?? '';
          if (t) return t;
          ultimo = new Indisponivel(`openrouter ${modelo}: resposta vazia`);
        } catch (e) { if (!(e instanceof Indisponivel)) throw e; ultimo = e; }
      }
      p.off = true;
      throw ultimo ?? new Indisponivel('openrouter: sem modelo');
    };
    lista.push(p);
  }
  return lista;
}

// ---------- 8. Leitura de uma página (ou PDF curto) pelo caminho OCR ----------
export class OcrFalhou extends Error {} // motivo vira "motivoGemini"

// Devolve { validFrom, validUntil, products (com imageBox), model: 'ocr+<modelo>', reader }.
// deps (para teste): ocr(buf) -> páginas; provedores -> lista; sleepFn.
export async function lerPorOcr(buf, promptBase, { blockRule = '', ocr = ocrPaginas, provedores = provedoresTexto(), log = console.warn } = {}) {
  if (!provedores.length) throw new OcrFalhou('sem chave de modelo de texto (GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY)');
  let pags;
  try { pags = await ocr(buf); } catch (e) { throw new OcrFalhou(e.message); }
  if (pags.length > MAX_PAGINAS_PDF) throw new OcrFalhou(`PDF com ${pags.length} páginas (mais que ${MAX_PAGINAS_PDF})`);
  const base = promptOcr(promptBase, blockRule);
  const produtos = [];
  let validFrom = null, validUntil = null, usado = null;
  for (const [i, pag] of pags.entries()) {
    const ls = normalizarLinhas(pag);
    if (ls.length < 3) { if (pags.length > 1) continue; throw new OcrFalhou('OCR sem texto na página'); }
    const prompt = `${base}\n${FORMATO}\n\nOCR da página${pags.length > 1 ? ` ${i + 1}/${pags.length}` : ''}:\n${textoLinhas(ls)}\n\nResponda só com o JSON.`;
    const tokens = estimarTokens(prompt);
    const motivos = [];
    let res = null;
    for (const prov of provedores) {
      if (prov.off) { motivos.push(`${prov.nome}: desligado`); continue; }
      if (tokens > prov.maxEntrada) { motivos.push(`${prov.nome}: página de ~${tokens} tokens passa do limite (${prov.maxEntrada})`); continue; }
      let falhou = null, indisponivel = false;
      for (let tent = 0; tent < 2 && !res; tent++) {
        let texto;
        try { texto = await prov.chamar(tent ? `${prompt}\n\nA resposta anterior foi recusada (${falhou}). Responda de novo, só com o JSON completo, usando apenas preços que estão no OCR.` : prompt); }
        catch (e) { if (!(e instanceof Indisponivel)) throw e; motivos.push(e.message); indisponivel = true; break; }
        const j = lerJson(texto);
        if (!j) { falhou = 'JSON inválido ou cortado'; continue; }
        const conf = conferir(j.products, ls);
        if (!conf.ok) { falhou = conf.motivo; continue; }
        res = { j, nome: prov.nome };
      }
      if (res) break;
      if (!indisponivel) throw new OcrFalhou(`${prov.nome}: ${falhou}`); // resposta ruim duas vezes: a página vai para o Gemini
    }
    if (!res) throw new OcrFalhou(`nenhum modelo de texto respondeu (${motivos.join(' | ')})`);
    usado = res.nome;
    validFrom ??= res.j.validFrom ?? null; validUntil ??= res.j.validUntil ?? null;
    for (const it of res.j.products) {
      const { linhas, ...resto } = it;
      produtos.push({ ...resto, box: imageBoxDe(linhas, ls) });
    }
    if (log && pags.length > 1) log(`  OCR página ${i + 1}/${pags.length}: ${res.j.products.length} itens`);
  }
  return { validFrom, validUntil, products: produtos, model: `ocr+${usado}`, reader: `ocr+${usado}` };
}
