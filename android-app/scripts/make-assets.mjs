// Prepara as imagens de partida para @capacitor/assets (icone adaptativo e abertura) a partir do logo do site.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sharp = createRequire(path.join(root, 'server/package.json'))('sharp'); // sharp ja vem com o @capacitor/assets; este e reserva
const pub = path.join(root, 'app/public');
const out = path.resolve(here, '../assets');
const ICON_BG = '#0E1B2E'; // cor do fundo do proprio icone (app-512.png), para a borda nao aparecer
const NIGHT = '#060B1A';

// o app-512.png tem uma moldura escura em volta do desenho: recorta so o quadrado do desenho
const mark = await sharp(path.join(pub, 'app-512.png')).extract({ left: 68, top: 68, width: 376, height: 376 }).png().toBuffer();
const fg = await sharp(mark).resize(660, 660).png().toBuffer(); // dentro da zona segura (66%) do icone adaptativo
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fg, left: 182, top: 182 }]).png().toFile(path.join(out, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: ICON_BG } }).png().toFile(path.join(out, 'icon-background.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: ICON_BG } })
  .composite([{ input: await sharp(mark).resize(820, 820).png().toBuffer(), left: 102, top: 102 }]).png().toFile(path.join(out, 'icon-only.png'));
// abertura: logo largo no centro, fundo azul-noite
const logo = await sharp(path.join(pub, 'logo-carrinhos.webp')).resize({ width: 1500 }).png().toBuffer();
for (const name of ['splash.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: NIGHT } })
    .composite([{ input: logo, gravity: 'center' }]).png().toFile(path.join(out, name));
}
console.log('assets prontos em', out);
