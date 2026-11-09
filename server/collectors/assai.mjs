import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTRAIDO = path.join(ROOT, 'data', 'extraido');
const SRC = 'https://www.assai.com.br/sites/default/files/static/ofertas_assai.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const LOJAS = { 58: 'Assaí Ribeirão Pires', 161: 'Assaí Shop. Mauá' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function get(url) {
  if (++requests > 600) throw new Error('teto de 600 requisições');
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (r.status === 403 || r.status === 429) throw new Error(`bloqueio ${r.status} em ${url}`);
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r;
}

const br = (s) => { const [d, m, y] = s.split('/'); return { y: +y, m: +m, d: +d }; };
// Datas dd/mm/aaaa em horário de Brasília (-03:00); o fim vale até 23:59:59 do último dia.
const inicioIso = (s) => { const { y, m, d } = br(s); return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).toISOString(); };
const fimIso = (s) => { const { y, m, d } = br(s); return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59)).toISOString(); };

fs.mkdirSync(EXTRAIDO, { recursive: true });
const now = new Date();
const data = await (await get(SRC)).json();

const encartes = [];
for (const o of data.ofertas) {
  const lojas = o.lojas.map((l) => l.loja_id).filter((id) => LOJAS[id]);
  if (!lojas.length) continue;
  const validFrom = inicioIso(o.start_date);
  const validUntil = fimIso(o.end_date);
  const vigente = new Date(validFrom) <= now && new Date(validUntil) >= now;
  encartes.push({
    market: 'Assaí',
    offerId: o.id_oferta,
    validFrom, validUntil, vigente,
    validityNote: o.custom_text || null,
    stores: lojas.map((id) => LOJAS[id]),
    images: o.images.map((i) => i.url),
    storeScope: 'Encarte das lojas Assaí Ribeirão Pires e Mauá',
    collectedAt: now.toISOString(),
  });
}

fs.writeFileSync(path.join(EXTRAIDO, 'assai-encartes.json'), JSON.stringify(encartes, null, 2));
// Os preços só existem nas imagens: quem lê é readers/folheto.mjs (o assai.json sai de lá).
console.log(`encartes das lojas: ${encartes.length}, vigentes: ${encartes.filter((e) => e.vigente).length}, requisições: ${requests}`);
