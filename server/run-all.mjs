// Roda os coletores um a um. Se um coletor falhar ou voltar bem menos produtos que a última vez,
// mantém os dados anteriores (melhor preço de semana passada do que nenhum).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'data/extraido');
const COLLECTORS = (process.env.COLLECTORS || 'spani,atacadao,coop,nagumo,semar,extra').split(',');
// Tempo máximo de cada coletor. O Semar faz ~600 buscas com pausa de 1 s e leva ~45 min:
// com 40 min ele era cortado no fim todo dia (desde 10/11) e o site ficava com o preço antigo.
const LIMIT_MIN = { semar: 90 };
const count = (f) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j.length : 0; } catch { return 0; } };

let failed = 0;
for (const name of COLLECTORS) {
  const file = path.join(OUT, `${name}.json`);
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const nBefore = count(file);
  console.log(`\n== ${name} (antes: ${nBefore})`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'collectors', `${name}.mjs`)], { stdio: 'inherit', timeout: (LIMIT_MIN[name] || 40) * 60 * 1000 });
  const nAfter = count(file);
  // Coletor que não terminou bem não regrava o arquivo: o que está lá é o dado antigo, não um resultado novo.
  const crashed = r.status !== 0;
  const shrank = nBefore > 0 && nAfter < nBefore * 0.3;
  // Assaí só publica imagem: vazio é esperado; o leitor de folhetos preenche depois.
  if (nBefore > 0 && (crashed || shrank || (nAfter === 0 && name !== 'assai'))) {
    fs.writeFileSync(file, before);
    const why = crashed ? (r.signal ? `interrompido (${r.signal}, tempo esgotado?)` : `saiu com erro ${r.status}`) : `resultado ruim (${nAfter})`;
    console.warn(`!! ${name}: ${why}, mantendo os ${nBefore} produtos anteriores`);
    console.log(`::warning::${name}: ${why}; o site continua com os preços da coleta anterior`);
    failed++;
  }
}
console.log(`\nColetores com problema: ${failed}`);
