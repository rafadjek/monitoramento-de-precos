// Varredura em paralelo com IAs grátis (Fase 15.3).
// Para cada site: 1) roda o kit (kit.mjs tudo <url>), sem IA, e guarda o JSON; 2) entrega esse JSON a um modelo
// grátis do OpenCode (opencode-cli run, agente "plan", só leitura) com um roteiro fixo, e guarda o resumo em JSON.
// Vários sites ao mesmo tempo; se um modelo falhar ou atingir limite, tenta o próximo da lista.
// Quem consolida e decide é o Claude (ou o Rafael), lendo só os resumos: poupa a cota do Claude.
//
// Uso (a partir de server/):
//   node recon/varrer.mjs alvos.json            alvos.json = [{ "nome": "Coop", "url": "https://...", "coletor": "coop" }]
//   node recon/varrer.mjs https://site1 https://site2
// Variáveis: PARALELO (4), MODELOS (lista separada por vírgula), SAIDA (pasta; padrão D:\Temp\varredura-AAAA-MM-DD),
//            OPENCODE_CLI (caminho do opencode-cli.exe), SO_KIT=1 (não chama IA).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(AQUI, '..');
const hoje = new Date().toISOString().slice(0, 10);
const SAIDA = process.env.SAIDA || `D:\\Temp\\varredura-${hoje}`;
const PARALELO = Math.max(1, Number(process.env.PARALELO) || 4);
const OPENCODE = process.env.OPENCODE_CLI || `${process.env.LOCALAPPDATA}\\Programs\\ai.opencode.desktop\\resources\\opencode-cli.exe`;
// ordem: grátis do OpenCode (rápidos, mas com limite de uso compartilhado), Gemma pela chave do Google configurada no
// OpenCode. O modelo local do Ollama ('ollama/qwen3-vl:8b', chama o Ollama direto) fica fora do padrão: em 19/11 a
// GPU estava sem ventoinha girando (92-94 °C) e o Qwen3-VL ficou lento demais; use MODELOS=... para incluir.
const MODELOS = (process.env.MODELOS || 'opencode/deepseek-v4.1-flash-free,google/gemma-4-31b-it,opencode/mimo-v2.6-flash-free,google/gemma-4-26b-a4b-it').split(',');
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const esgotado = new Set(); // provedor que avisou fim do uso grátis: pula os outros modelos dele nesta execução
fs.mkdirSync(SAIDA, { recursive: true });

const args = process.argv.slice(2);
if (!args.length) { console.error('uso: node recon/varrer.mjs alvos.json | url1 url2 ...'); process.exit(1); }
const alvos = args[0].endsWith('.json')
  ? JSON.parse(fs.readFileSync(args[0], 'utf8'))
  : args.map((url) => ({ nome: new URL(url).hostname.replace(/^www\./, ''), url }));

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '');

function rodar(cmd, argv, { cwd, limiteMs }) {
  return new Promise((resolve) => {
    const out = [], err = [];
    const p = spawn(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    const t = setTimeout(() => p.kill(), limiteMs);
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }); });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: '', err: e.message }); });
  });
}

// O que já se coleta do site (para a IA apontar lacuna, não repetir o que já existe)
function contexto(alvo) {
  if (!alvo.coletor) return 'Ainda não coletamos este site.';
  const f = path.join(SERVER, 'collectors', `${alvo.coletor}.mjs`);
  if (!fs.existsSync(f)) return `Coletor ${alvo.coletor} não encontrado.`;
  // só o comentário do topo do coletor: diz a fonte e o método sem gastar contexto com código
  const topo = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 25).join('\n');
  // o que a última coleta trouxe: sem isso a IA acha que "falta o catálogo" de quem já coleta milhares de itens
  let coleta = 'sem dados da última coleta';
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(SERVER, 'data/extraido', `${alvo.coletor}.json`), 'utf8'));
    if (Array.isArray(rows)) {
      const dep = {};
      for (const r of rows) { const d = String(r.categoryRaw || r.category || '?').split(' > ')[0]; dep[d] = (dep[d] || 0) + 1; }
      const top = Object.entries(dep).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([d, n]) => `${d}: ${n}`).join('; ');
      coleta = `${rows.length} itens (${rows.filter((r) => r.listPrice).length} com preço "de"; ${rows.filter((r) => r.source === 'encarte').length} de encarte); departamentos: ${top}`;
    }
  } catch { /* sem arquivo */ }
  return `Já coletamos com server/collectors/${alvo.coletor}.mjs. Última coleta: ${coleta}.\nComentário do topo do coletor:\n${topo}\nCompare com isso antes de apontar lacuna: só é lacuna o que o site tem e a coleta acima não cobre.`;
}

const ROTEIRO = (alvo) => `Você analisa fontes de preço para o Bate Ofertas (comparador de preços de mercados e farmácias de Mauá e Ribeirão Pires, SP).
O arquivo anexo é a saída do kit de varredura para o site ${alvo.nome} (${alvo.url}): endpoints JSON que a página chama, VTEX, sitemap, encartes em PDF/imagem e Instagram.
${contexto(alvo)}
Regras do projeto: sem login, sem burlar bloqueio (Cloudflare/Akamai/403 = fica de fora), pausa de 1 s, nunca inventar dado; só vale preço de loja de Mauá ou Ribeirão Pires (ou do site com retirada nelas).
Não use ferramentas. Responda SÓ com um objeto JSON, sem texto fora dele, neste formato:
{"site":"","fontes":[{"tipo":"api|vtex|pdf|imagem|instagram|sitemap","onde":"url ou endpoint","itens":0,"temPreco":true,"lojaDaRegiao":"sim|nao|incerto","obs":""}],
 "lacunas":["o que o site tem e não coletamos (seção, tipo de preço, loja)"],"bloqueios":[""],"proximoPasso":"uma frase","confianca":"alta|media|baixa"}`;

// Fila por provedor: o OpenCode grátis aguenta várias chamadas juntas; o Google (Gemma grátis) e o Ollama local não.
const UMA_POR_VEZ = new Set(['google', 'ollama']);
const filas = new Map();
function naVez(provedor, fn) {
  if (!UMA_POR_VEZ.has(provedor)) return fn();
  const anterior = filas.get(provedor) || Promise.resolve();
  const atual = anterior.then(fn, fn);
  filas.set(provedor, atual.catch(() => {}));
  return atual;
}

async function perguntarOllama(modelo, prompt) {
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(600000),
      body: JSON.stringify({ model: modelo, prompt, stream: false, think: false, format: 'json', options: { temperature: 0, num_ctx: 16384 } }) }); // think:false: o Qwen3-VL "pensa" por 100 s sem isso
    const j = await res.json();
    return { code: res.ok ? 0 : res.status, out: j.response || '', err: j.error || '' };
  } catch (e) { return { code: -1, out: '', err: e.message }; }
}

function extrairJson(txt) {
  const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(txt.slice(i, j + 1)); } catch { return null; }
}

async function varrer(alvo) {
  const nome = slug(alvo.nome);
  const t0 = Date.now();
  const kitFile = path.join(SAIDA, `${nome}.kit.json`);
  const kit = await rodar(process.execPath, [path.join(AQUI, 'kit.mjs'), 'tudo', alvo.url, '--max', '6000'], { cwd: SERVER, limiteMs: 200000 });
  fs.writeFileSync(kitFile, kit.out || JSON.stringify({ erro: kit.err.slice(0, 500) }));
  const seg = () => ((Date.now() - t0) / 1000).toFixed(0) + ' s';
  if (process.env.SO_KIT) { console.log(`${alvo.nome}: kit em ${seg()}`); return { alvo: alvo.nome, kit: kitFile }; }
  const perguntar = (modelo) => modelo.startsWith('ollama/')
    ? perguntarOllama(modelo.slice(7), `${ROTEIRO(alvo)}\n\nSaída do kit:\n${fs.readFileSync(kitFile, 'utf8')}`)
    : rodar(OPENCODE, ['run', '--agent', 'plan', '-m', modelo, '-f', kitFile, ROTEIRO(alvo)], { cwd: SAIDA, limiteMs: 180000 });
  for (const modelo of MODELOS) {
    const provedor = modelo.split('/')[0];
    if (esgotado.has(provedor)) continue;
    let r;
    // até 3 tentativas quando o limite é por minuto (Gemma grátis: 16 mil tokens de entrada/min; cada chamada do
    // OpenCode leva o roteiro do agente junto). Chamadas ao mesmo provedor saem uma por vez (vez(provedor)).
    for (let tent = 1; tent <= 3; tent++) {
      r = await naVez(provedor, () => perguntar(modelo));
      const msg = r.err + r.out;
      if (/Free usage limit|usage limit reached|PerDay|per day/i.test(msg)) { esgotado.add(provedor); break; }
      if (!/per minute|PerMinute|retry in/i.test(msg) || tent === 3) break;
      const espera = Math.min(90, Math.ceil(Number((msg.match(/retry in ([\d.]+)s/i) || [])[1]) || 30) + 3);
      console.log(`${alvo.nome}: ${modelo} pediu para esperar ${espera} s (limite por minuto)`);
      await new Promise((ok) => setTimeout(ok, espera * 1000));
    }
    const json = extrairJson(r.out);
    if (json) {
      json._modelo = modelo; json._segundos = Math.round((Date.now() - t0) / 1000);
      fs.writeFileSync(path.join(SAIDA, `${nome}.resumo.json`), JSON.stringify(json, null, 1));
      console.log(`${alvo.nome}: ok (${modelo}) em ${seg()}`);
      return json;
    }
    const falha = path.join(SAIDA, `${nome}.falha-${slug(modelo)}.txt`);
    fs.writeFileSync(falha, `código ${r.code}\n--- saída\n${r.out.slice(-4000)}\n--- erro\n${r.err.slice(-4000)}`);
    console.warn(`${alvo.nome}: ${modelo} não devolveu JSON (código ${r.code}; detalhe em ${path.basename(falha)}); tentando o próximo`);
  }
  console.warn(`${alvo.nome}: nenhum modelo respondeu; o kit está em ${kitFile}`);
  return { site: alvo.nome, erro: 'sem resumo', kit: kitFile };
}

const fila = [...alvos];
const resultados = [];
const inicio = Date.now();
await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, async () => {
  while (fila.length) resultados.push(await varrer(fila.shift()));
}));
fs.writeFileSync(path.join(SAIDA, 'resumo-geral.json'), JSON.stringify(resultados, null, 1));
console.log(`\n${resultados.length} sites em ${((Date.now() - inicio) / 60000).toFixed(1)} min. Resumos em ${SAIDA}`);
