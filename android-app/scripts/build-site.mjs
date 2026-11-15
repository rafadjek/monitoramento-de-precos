// Gera o site do app/ para android-app/www com caminhos relativos (VITE_BASE=./) e dados lidos do endereco publico.
import { spawnSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../app');
const out = path.resolve(here, '../www');
const vite = path.join(appDir, 'node_modules/vite/bin/vite.js');
if (!existsSync(vite)) { console.error('Faltam as dependencias do site: rode "npm ci" em app/ primeiro.'); process.exit(1); }

const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: './', VITE_DATA_URL: process.env.VITE_DATA_URL || 'https://bate-ofertas.pages.dev/' },
});
if (r.status !== 0) process.exit(r.status ?? 1);
// dados e miniaturas sao lidos da internet (e guardados no aparelho); service worker nao se usa dentro do app
for (const p of ['data', 'img', 'sw.js', '_headers']) rmSync(path.join(out, p), { recursive: true, force: true });
console.log('Site do app pronto em', out);
