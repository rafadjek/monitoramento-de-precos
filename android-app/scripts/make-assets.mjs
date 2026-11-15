// Prepara as imagens de partida para @capacitor/assets (icone adaptativo e abertura) a partir do logo do site.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sharp = createRequire(path.join(root, 'server/package.json'))('sharp'); // sharp ja vem com o @capacitor/assets; este e reserva
const pub = path.join(root, 'app/public');
const out = path.resolve(here, '../assets');

const NIGHT = '#060B1A'; // fundo do icone, da abertura e do PWA
// logo novo (carrinhos sem fundo, 1834x933): sempre inteiro, centralizado, sobre o fundo azul-noite
const logoSrc = path.join(pub, 'logo-carrinhos.webp');
const logoAt = (w) => sharp(logoSrc).resize({ width: w }).png().toBuffer();
const bg = (size) => sharp({ create: { width: size, height: size, channels: 4, background: NIGHT } });
const clear = (size) => sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const centered = async (base, size, logoW) => {
  const input = await logoAt(logoW);
  const h = (await sharp(input).metadata()).height;
  return base.composite([{ input, left: Math.round((size - logoW) / 2), top: Math.round((size - h) / 2) }]).png();
};

// icone adaptativo: primeiro plano transparente com o logo dentro da zona segura (66% da largura), fundo liso
await (await centered(clear(1024), 1024, 660)).toFile(path.join(out, 'icon-foreground.png'));
await bg(1024).png().toFile(path.join(out, 'icon-background.png'));
await (await centered(bg(1024), 1024, 820)).toFile(path.join(out, 'icon-only.png'));
// abertura: logo no centro, fundo azul-noite
await (await centered(bg(2732), 2732, 1500)).toFile(path.join(out, 'splash.png'));
// PWA / site (manifest, favicon, apple-touch): mesmo logo; 70% da largura cabe na zona segura "maskable" (80%)
for (const [name, size] of [['app-512.png', 512], ['app-192.png', 192], ['icone.png', 192]]) {
  await (await centered(bg(size), size, Math.round(size * 0.7))).toFile(path.join(pub, name));
}
console.log('assets prontos em', out);
