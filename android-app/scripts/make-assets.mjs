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
// logo (carrinhos sem fundo, 1834x933): recorte ao miolo util (carrinho cheio + raio), sem as bordas vazias nem o carrinho da direita cortado pela metade
const logoSrc = path.join(pub, 'logo-carrinhos.webp');
const CROP = { left: 170, top: 60, width: 1075, height: 873 };
const cropped = await sharp(logoSrc).extract(CROP).png().toBuffer();
const logoAt = (w) => sharp(cropped).resize({ width: w }).png().toBuffer();
const bg = (size) => sharp({ create: { width: size, height: size, channels: 4, background: NIGHT } });
const clear = (size) => sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const centered = async (base, size, logoW) => {
  const input = await logoAt(logoW);
  const h = (await sharp(input).metadata()).height;
  return base.composite([{ input, left: Math.round((size - logoW) / 2), top: Math.round((size - h) / 2) }]).png();
};

// icone adaptativo: o Android encolhe o primeiro plano para a zona segura (inset de 16,7%), entao a tela inteira do PNG ja e a zona segura; logo com ~92% da largura (cantos sao so fundo escuro)
await (await centered(clear(1024), 1024, 900)).toFile(path.join(out, 'icon-foreground.png'));
await bg(1024).png().toFile(path.join(out, 'icon-background.png'));
await (await centered(bg(1024), 1024, 940)).toFile(path.join(out, 'icon-only.png'));
// abertura: logo no centro, fundo azul-noite
await (await centered(bg(2732), 2732, 1300)).toFile(path.join(out, 'splash.png'));
// PWA / site: icone.png e app-192 ocupam quase tudo; o 512 e "maskable": margem de seguranca de 10% por lado (80% da largura)
for (const [name, size, k] of [['app-512.png', 512, 0.8], ['app-192.png', 192, 0.94], ['icone.png', 192, 0.94]]) {
  await (await centered(bg(size), size, Math.round(size * k))).toFile(path.join(pub, name));
}
console.log('assets prontos em', out);
