// Roda os coletores, vários ao mesmo tempo (cada um é um site diferente, então cada site continua recebendo uma
// requisição por vez, com a pausa de 1 s do próprio coletor). Se um coletor falhar ou voltar bem menos produtos que
// a última vez, mantém os dados anteriores (melhor preço de semana passada do que nenhum).
// PARALLEL=1 volta ao modo antigo, um por vez.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'data/extraido');
const COLLECTORS = (process.env.COLLECTORS || 'spani,atacadao,coop,nagumo,semar,extra').split(',').map((s) => s.trim()).filter(Boolean);
const PARALLEL = Math.max(1, Number(process.env.PARALLEL) || 3);
// Tempo máximo de cada coletor. O Semar faz ~600 buscas com pausa de 1 s e leva ~45 min:
// com 40 min ele era cortado no fim todo dia (desde 10/11) e o site ficava com o preço antigo.
// Farmácias (workflow farmacias.yml): DSP leva ~30 min e se limita a 55; Conde ~27 min.
const LIMIT_MIN = { semar: 90, drogariasaopaulo: 60, farmaconde: 50 };
// Duração típica (min), só para começar pelos mais longos e terminar mais cedo (medido em 19/11/2026).
const TYPICAL_MIN = { semar: 45, drogariasaopaulo: 30, farmaconde: 27, extra: 25, nagumo: 9 };
const count = (f) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j.length : 0; } catch { return 0; } };

function run(name) {
  const file = path.join(OUT, `${name}.json`);
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const nBefore = count(file);
  const t0 = Date.now();
  return new Promise((resolve) => {
    // saída guardada e impressa de uma vez no fim, para os logs de coletores simultâneos não se misturarem
    const chunks = [];
    const child = spawn(process.execPath, [path.join(ROOT, 'collectors', `${name}.mjs`)], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    let signal = null;
    const timer = setTimeout(() => { signal = 'SIGTERM'; child.kill('SIGTERM'); }, (LIMIT_MIN[name] || 40) * 60 * 1000);
    child.on('close', (status, sig) => {
      clearTimeout(timer);
      const nAfter = count(file);
      const min = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`::group::${name} (antes: ${nBefore}, depois: ${nAfter}, ${min} min)`);
      process.stdout.write(Buffer.concat(chunks));
      console.log('::endgroup::');
      // Coletor que não terminou bem não regrava o arquivo: o que está lá é o dado antigo, não um resultado novo.
      const crashed = status !== 0;
      const shrank = nBefore > 0 && nAfter < nBefore * 0.3;
      let bad = false;
      // Assaí só publica imagem: vazio é esperado; o leitor de folhetos preenche depois.
      if (nBefore > 0 && (crashed || shrank || (nAfter === 0 && name !== 'assai'))) {
        fs.writeFileSync(file, before);
        const why = crashed ? ((signal || sig) ? `interrompido (${signal || sig}, tempo esgotado?)` : `saiu com erro ${status}`) : `resultado ruim (${nAfter})`;
        console.warn(`!! ${name}: ${why}, mantendo os ${nBefore} produtos anteriores`);
        console.log(`::warning::${name}: ${why}; o site continua com os preços da coleta anterior`);
        bad = true;
      }
      console.log(`== ${name}: ${bad ? 'mantido o anterior' : 'ok'} em ${min} min`);
      resolve(bad);
    });
  });
}

const queue = [...COLLECTORS].sort((a, b) => (TYPICAL_MIN[b] || 5) - (TYPICAL_MIN[a] || 5));
const t0 = Date.now();
let failed = 0;
console.log(`Coletores: ${queue.join(', ')} (${PARALLEL} por vez)`);
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
  while (queue.length) if (await run(queue.shift())) failed++;
}));
console.log(`\nColetores com problema: ${failed}; tempo total ${((Date.now() - t0) / 60000).toFixed(1)} min`);
