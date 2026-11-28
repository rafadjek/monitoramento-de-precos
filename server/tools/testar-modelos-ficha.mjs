// Mede cada modelo grátis na ficha de produto: pede as fichas de nomes que o Gemini já leu e compara campo a campo.
// Uso: node tools/testar-modelos-ficha.mjs "modelo1,modelo2" [--n=50]   (modelos do OpenRouter; prefixo zen: para OpenCode Zen)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerFichas, pedir, interpretar } from '../fichas.mjs';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const N = Number(arg('n', 50));
const modelos = (process.argv[2] || '').split(',').map((x) => x.trim()).filter(Boolean);
const ref = lerFichas().fichas;
const ids = Object.entries(ref).filter(([, v]) => String(v.m).startsWith('gemini') && v.produto);
// amostra espalhada e reproduzível
const amostra = ids.filter((_, i) => i % Math.floor(ids.length / N) === 0).slice(0, N);
const itens = amostra.map(([k], i) => ({ id: String(i + 1), nome: k }));
const norm = (s) => String(s ?? '').trim().toLowerCase();
const res = [];
for (const m of modelos) {
  const zen = m.startsWith('zen:');
  const p = m === 'oclivre' ? { nome: 'oclivre', tipo: 'oclivre' } : m.startsWith('mistral:')
    ? { nome: m, tipo: 'openai', url: 'https://api.mistral.ai/v1/chat/completions', key: process.env.MISTRAL_API_KEY, model: m.slice(8) } : zen
    ? { nome: m, tipo: 'openai', url: 'https://opencode.ai/inference/openai/v1/chat/completions', key: process.env.OPENCODE_API_KEY, model: m.slice(4) }
    : { nome: m, tipo: 'openai', url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: m };
  const t0 = Date.now();
  const sims = { marca: 0, produto: 0, linha: 0, versao: 0, sabor: 0 };
  let lidos = 0, erro = '';
  try {
    for (let i = 0; i < itens.length; i += 25) {
      const lote = itens.slice(i, i + 25);
      const r = interpretar(await pedir(p, lote), new Set(lote.map((x) => x.id)));
      for (const it of lote) {
        const f = r.get(it.id); const g = ref[it.nome]; if (!f) continue;
        lidos++;
        for (const c of Object.keys(sims)) if (norm(f[c]) === norm(g[c])) sims[c]++;
      }
    }
  } catch (e) { erro = String(e.message).slice(0, 120); }
  const pc = (x) => (lidos ? Math.round((100 * x) / lidos) : 0);
  const linha = { modelo: m, lidos, de: itens.length, marca: pc(sims.marca), produto: pc(sims.produto), linha: pc(sims.linha), versao: pc(sims.versao), sabor: pc(sims.sabor), seg: Math.round((Date.now() - t0) / 1000), erro };
  console.log(JSON.stringify(linha));
  res.push(linha);
}
