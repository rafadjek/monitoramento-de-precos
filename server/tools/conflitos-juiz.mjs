// Lista os rótulos em que o juiz discordou do Rafael na última prova (juiz-veredictos.json → prova.erros),
// no formato da página de rotulagem, com o rótulo de antes ("atual") e a resposta do juiz.
// Saída: data/rotulos/conflitos.json. Depois: node tools/pagina-rotulos.mjs --entrada=conflitos.json --saida=conflitos.html --titulo="Revisar conflitos"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/rotulos.json'), 'utf8'));
const cands = new Map();
try { for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/candidatos.json'), 'utf8'))) cands.set(c.id, c); } catch { /* sem candidatos */ }
const { prova } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/extraido/juiz-veredictos.json'), 'utf8'));
const NOME = { mesmo: 'mesmo', diferente: 'diferente' };
const out = [];
for (const e of prova.erros) {
  const x = labels.find((l) => l.a.name === e.a && l.b.name === e.b && l.label === e.rafael);
  if (!x) { console.log('não achei:', e.a, 'x', e.b); continue; }
  const c = cands.get(x.id);
  const side = (k) => ({ market: x[k].market, name: x[k].name, price: x[k].price ?? c?.[k].price, image: x[k].image || c?.[k].image });
  out.push({ id: x.id, kind: x.kind, atual: x.label, juiz: NOME[e.juiz] || 'nao_sei', a: side('a'), b: side('b') });
}
fs.writeFileSync(path.join(ROOT, 'data/rotulos/conflitos.json'), JSON.stringify(out, null, 1));
console.log(`${out.length} conflitos de ${prova.erros.length} erros da prova (${prova.em})`);
