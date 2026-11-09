// Roda os coletores um a um. Se um coletor falhar ou voltar bem menos produtos que a última vez,
// mantém os dados anteriores (melhor preço de semana passada do que nenhum).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'data/extraido');
const COLLECTORS = (process.env.COLLECTORS || 'spani,atacadao,coop').split(',');
const count = (f) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j.length : 0; } catch { return 0; } };

let failed = 0;
for (const name of COLLECTORS) {
  const file = path.join(OUT, `${name}.json`);
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const nBefore = count(file);
  console.log(`\n== ${name} (antes: ${nBefore})`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'collectors', `${name}.mjs`)], { stdio: 'inherit', timeout: 40 * 60 * 1000 });
  const nAfter = count(file);
  const bad = r.status !== 0 && nAfter === 0;
  const shrank = nBefore > 0 && nAfter < nBefore * 0.3;
  // Assaí só publica imagem: vazio é esperado; o leitor de folhetos preenche depois.
  if (nBefore > 0 && (bad || shrank || (nAfter === 0 && name !== 'assai'))) {
    fs.writeFileSync(file, before);
    console.warn(`!! ${name}: resultado ruim (${nAfter}), mantendo os ${nBefore} produtos anteriores`);
    failed++;
  }
}
console.log(`\nColetores com problema: ${failed}`);
