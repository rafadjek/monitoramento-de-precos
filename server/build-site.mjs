// Junta os JSON de data/extraido em arquivos estáticos para o site (app/public/data).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
const OUT = path.join(ROOT, '../app/public/data');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const valid = (o) => o && o.market && o.externalId != null && o.name && typeof o.price === 'number' && o.price >= 0.1 && o.price < 20000 && // R$ 0,01 e R$ 99.999 são cadastro sem preço (vistos no Nagumo)
   o.collectedAt;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');
const now = Date.now();
const index = { generatedAt: new Date().toISOString(), markets: [], retired: [] };
// Trava contra preço velho: mercado de catálogo (coletado do site, sem validade por oferta) cuja coleta
// mais recente passou do limite sai da comparação, em vez de mostrar preço antigo como se fosse de hoje.
// Encarte e Instagram já saem pela validade de cada oferta. Limite em horas; MAX_AGE_HOURS sobrescreve (teste).
const CATALOG_MARKETS = new Set(['Atacadão', 'Spani', 'Coop', 'Nagumo', 'Semar', 'Extra', 'Drogaria São Paulo', 'Farma Conde', 'Tony BRJ Carnes']);
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS) > 0 ? Number(process.env.MAX_AGE_HOURS) : 48;
const brDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

import crypto from 'node:crypto';
import sharp from 'sharp';
import { groupOffers, pairKey, parsePack } from './group.mjs';
import { bestPrice } from './price.mjs';
import { fineCategory } from './category.mjs';
import { load as loadHist, priceAt } from './historico.mjs';
// o site calcula o mesmo pedaço (app/src/history.ts): FNV-1a do id
const HIST_SHARDS = 64;
const histShard = (id) => { let x = 0x811c9dc5; for (let i = 0; i < id.length; i++) { x ^= id.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x % HIST_SHARDS; };
const IMG = path.join(ROOT, '../app/public/img');
const PAGES = path.join(ROOT, 'data/cache/paginas');
fs.rmSync(IMG, { recursive: true, force: true });
fs.mkdirSync(IMG, { recursive: true });
fs.mkdirSync(PAGES, { recursive: true });

// Recorta a foto do produto na página do folheto e devolve o caminho relativo da miniatura.
async function crop(o, id) {
  const pf = path.join(PAGES, crypto.createHash('sha1').update(o.imageUrl).digest('hex'));
  if (!fs.existsSync(pf)) {
    const r = await fetch(o.imageUrl);
    if (!r.ok) return null;
    fs.writeFileSync(pf, Buffer.from(await r.arrayBuffer()));
  }
  const img = sharp(pf);
  const { width: W, height: H } = await img.metadata();
  const [y0, x0, y1, x1] = o.imageBox.map((n) => Math.min(Math.max(n, 0), 1000));
  const left = Math.floor((x0 / 1000) * W), top = Math.floor((y0 / 1000) * H);
  const width = Math.floor(((x1 - x0) / 1000) * W), height = Math.floor(((y1 - y0) / 1000) * H);
  if (width < 20 || height < 20) return null;
  const name = crypto.createHash('sha1').update(id).digest('hex').slice(0, 16) + '.webp';
  await img.extract({ left, top, width: Math.min(width, W - left), height: Math.min(height, H - top) })
    .resize(320, 320, { fit: 'inside' }).webp({ quality: 78 }).toFile(path.join(IMG, name));
  return `img/${name}`;
}

const STORE_LABEL = {
  'Atacadão': 'preços da loja de Mauá (CEP 09310-000)',
  Spani: 'preços da loja Mauá 1 (Av. Barão de Mauá, 2005)',
  Coop: 'preços da loja Barão de Mauá (retirada, CEP 09310-000)',
  Baronesa: 'encarte da loja de Mauá (R. Fernão Dias, 5)',
  'Assaí': 'encarte das lojas de Ribeirão Pires e Mauá',
  Nagumo: 'preços da loja de Mauá (Av. Barão de Mauá, 3232)',
  Semar: 'preços da loja 06 Mauá',
  Extra: 'preços da loja online de Ribeirão Pires (R. João Domingues de Oliveira, 194); só entrega (R$ 19,90), sem retirada',
  Joanin: 'tabloide das lojas de Mauá e Ribeirão Pires',
  Nevada: 'ofertas do Instagram (@redenevada)',
  STUK: 'jornal de ofertas do dia publicado no Instagram (@supermercadostuk)',
  Lourencini: 'ofertas do Instagram (@lourencinisupermercados)',
  Dia: 'destaques do folheto da loja de Mauá (Av. Dom José Gaspar, 1016), via Tiendeo',
  'Roldão': 'encartes que valem na loja de Mauá (o Roldão não tem loja em Ribeirão Pires)',
  // Fase 14: farmácias (preço do site, só itens que dá para retirar numa loja da região) e comércio de bairro
  'Drogaria São Paulo': 'preço do site com retirada nas lojas de Mauá e Ribeirão Pires',
  'Farma Conde': 'preço do site com retirada nas lojas de Mauá (Av. Barão de Mauá, 732 e Av. Castelo Branco, 2365)',
  'Tony BRJ Carnes': 'catálogo online do açougue da Vila Assis, Mauá',
  'Família Lima': 'ofertas do Instagram (@supermercadofamilialima)',
  'Mercado Capital': 'ofertas do Instagram (@mercadocapitalmaua)',
  'Mercadinho Parceiro': 'ofertas do Instagram (@mercadinhoparceiro)',
  'Mercado Baratinho': 'ofertas do Instagram (@mercadobaratinhooficial), 3 lojas em Mauá',
  'Carnes Santana': 'ofertas do Instagram (@_carnessantanamaua)',
};
// Cidades das lojas usadas por mercado (filtro do site).
const CITIES = {
  'Atacadão': ['Mauá'], Spani: ['Mauá'], Coop: ['Mauá'], Baronesa: ['Mauá'], 'Assaí': ['Mauá', 'Ribeirão Pires'],
  Nagumo: ['Mauá'], Semar: ['Mauá'], Joanin: ['Mauá', 'Ribeirão Pires'], 'Roldão': ['Mauá'], Dia: ['Mauá'], STUK: ['Ribeirão Pires'], Nevada: ['Mauá'], Lourencini: ['Mauá'],
  // loja online de Ribeirão Pires (desde 19/11; antes era a de São Bernardo); só entrega
  Extra: ['Ribeirão Pires'],
  'Drogaria São Paulo': ['Mauá', 'Ribeirão Pires'], 'Farma Conde': ['Mauá'], 'Tony BRJ Carnes': ['Mauá'],
  // comércio de bairro do Instagram (social.mjs)
  'Família Lima': ['Mauá', 'Ribeirão Pires'], 'Mercado Capital': ['Mauá'], 'Mercadinho Parceiro': ['Mauá'],
  'Mercado Baratinho': ['Mauá'], 'Carnes Santana': ['Mauá'],
};
// Mercados sem fonte coletável: aparecem no site só com o caminho para as ofertas.
index.infoOnly = [{
  name: 'STUK', cities: ['Ribeirão Pires'],
  note: 'O jornal de ofertas sai todo dia só no Instagram e no WhatsApp de cada loja.',
  address: 'Av. Princesa Izabel, 980, Parque Aliança, Ribeirão Pires',
  links: [
    { label: 'Instagram', url: 'https://www.instagram.com/supermercadostuk/' },
    { label: 'WhatsApp', url: 'https://wa.me/5511980810790?text=Oi!%20Quero%20receber%20as%20ofertas%20do%20dia' },
    { label: 'Site', url: 'https://supermercadostuk.com.br/' },
  ],
}];
const built = [];
// Um mercado pode ter mais de um arquivo (ex.: atacadao.json do catálogo e atacadao-folheto.json do folheto): juntam-se aqui.
const porMercado = new Map();
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith('.json') && !x.includes('encartes')).sort()) {
  const parsed = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  if (!Array.isArray(parsed)) continue; // .meta.json e .verificacao.json dos coletores
  const lidas = parsed.filter(valid);
  if (!lidas.length) continue;
  const m = lidas[0].market;
  porMercado.set(m, [...(porMercado.get(m) ?? []), ...lidas]);
}
// catálogo primeiro: rows[0] (segmento, escopo da loja) deve vir do catálogo, não do folheto
for (const [m, r] of porMercado) porMercado.set(m, [...r.filter((o) => o.source !== 'encarte'), ...r.filter((o) => o.source === 'encarte')]);
for (const [market, rows] of porMercado) {
  const lastCollected = rows.map((r) => r.collectedAt).sort().at(-1);
  // a idade vale para o catálogo: um folheto novo não esconde um catálogo velho
  const catalogCollected = rows.filter((r) => r.source !== 'encarte').map((r) => r.collectedAt).sort().at(-1) ?? lastCollected;
  if (CATALOG_MARKETS.has(market) && now - new Date(catalogCollected).getTime() > MAX_AGE_HOURS * 3600e3) {
    index.retired.push({ name: market, collectedAt: catalogCollected, maxAgeHours: MAX_AGE_HOURS });
    console.log(`::warning::${market}: coleta de ${brDate(catalogCollected)}, mais de ${+(MAX_AGE_HOURS / 24).toFixed(1)} dias; fora do site até a próxima coleta`);
    continue;
  }
  const vigentes = rows.filter((o) => !o.validUntil || new Date(o.validUntil).getTime() >= now);
  const slim = [];
  for (const o of vigentes) {
    const id = `${slug(market)}:${o.externalId}`;
    let imageUrl = o.imageUrl ?? null;
    if (imageUrl && Array.isArray(o.imageBox)) {
      imageUrl = await crop(o, id).catch(() => null); // sem recorte, melhor sem imagem do que a página inteira
    }
    const best = bestPrice(o.price, o.condition);
    slim.push({
      id, market, name: o.name, brand: o.brand ?? null, ean: o.ean ?? null, size: o.size ?? null,
      price: best.price, listPrice: best.listPrice ?? o.listPrice ?? null, category: fineCategory(o),
      imageUrl, productUrl: o.productUrl ?? null, validUntil: o.validUntil ?? null, // observação e unitPrice ficam só no dado bruto: o site não usa e pesavam MBs
      // caixa/fardo: quantas unidades vêm (o site compara pelo preço de cada uma)
      ...(parsePack(o.name, o.size ?? '') > 1 ? { units: parsePack(o.name, o.size ?? '') } : {}),
      ...(o.source === 'encarte' ? { source: 'encarte' } : {}),
      // farmácia: segmento, remédio de receita (aviso no site, fora de ofertas) e genérico
      ...((o.segment ?? (o.section === 'farmacia' ? 'farmacia' : null)) ? { segment: o.segment ?? 'farmacia' } : {}), // section: tabloide Drogarias Joanin
      ...(o.rx ? { rx: 1 } : {}),
      ...(o.generic ? { generic: 1 } : {}),
      ...(best.condition ? { condition: best.condition } : {}),
    });
  }
  built.push({ market, slim });
  index.markets.push({
    name: market, file: `${slug(market)}.json`, products: slim.length, cities: CITIES[market] ?? [],
    ...(rows[0].segment ? { segment: rows[0].segment } : {}),
    source: rows.some((r) => r.source === 'encarte') ? 'encarte' : 'site', expiredDropped: rows.length - vigentes.length,
    storeScope: STORE_LABEL[market] ?? ((rows[0].storeScope ?? '').slice(0, 90) || null), collectedAt: lastCollected,
  });
}

// mercado que passou a ter produtos (ex.: STUK pelo Instagram) sai da lista de só-link
index.infoOnly = index.infoOnly.filter((i) => !index.markets.some((m) => m.name === i.name));

// Produtos iguais em mercados diferentes recebem o mesmo "g" (id do grupo).
const flat = built.flatMap((b) => b.slim);
// Vereditos de 'mesmo produto?': os rótulos do Rafael valem sempre; os do juiz com IA só se a prova dele passou.
const verdicts = new Map();
try {
  const j = JSON.parse(fs.readFileSync(path.join(IN, 'juiz-veredictos.json'), 'utf8'));
  if (j.ativo) for (const [k, v] of Object.entries(j.pares || {})) verdicts.set(k, v.same);
} catch { /* ainda sem juiz */ }
try {
  for (const x of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rotulos/rotulos.json'), 'utf8')))
    if (x.label === 'mesmo' || x.label === 'diferente') verdicts.set(pairKey(x.a, x.b), x.label === 'mesmo');
} catch { /* sem rótulos */ }
const decide = (i, j) => verdicts.get(pairKey(flat[i], flat[j]));
const groups = groupOffers(flat, decide);
index.verdicts = verdicts.size;
const gidOf = (key) => crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
// Ids estáveis (Fase 17): o carrinho e os favoritos guardam o id do grupo. Quando as regras novas juntam grupos que antes
// eram separados, o grupo novo fica com um dos ids antigos (o menor) e os outros viram "alias" no index.json,
// para o site trocar os ids guardados no navegador. O agrupamento antigo é calculado com GROUP_V2=0, só para isso.
const aliases = {};
{
  const gv2 = process.env.GROUP_V2;
  process.env.GROUP_V2 = '0';
  const antigos = groupOffers(flat, decide);
  if (gv2 === undefined) delete process.env.GROUP_V2; else process.env.GROUP_V2 = gv2;
  const antigoDe = new Map(); // índice da oferta -> id do grupo antigo
  for (const g of antigos) { const id = gidOf(g.key); for (const i of g.idx) antigoDe.set(i, id); }
  const usados = new Set();
  const escolhidos = groups.map((g) => {
    const ids = [...new Set(g.idx.map((i) => antigoDe.get(i)).filter(Boolean))].sort();
    return { g, ids };
  });
  // quem tem id antigo primeiro, para que um grupo sem passado nunca tome o id de outro
  for (const e of escolhidos.filter((x) => x.ids.length)) {
    const gid = e.ids.find((id) => !usados.has(id)) ?? gidOf(e.g.key);
    usados.add(gid);
    e.gid = gid;
    for (const id of e.ids) if (id !== gid) aliases[id] = gid;
  }
  for (const e of escolhidos.filter((x) => !x.ids.length)) { e.gid = gidOf(e.g.key); usados.add(e.gid); }
  for (const e of escolhidos) for (const i of e.g.idx) flat[i].g = e.gid;
}
index.aliases = aliases;
for (const o of flat) delete o.ean; // só serve para agrupar; o site não usa

// Histórico (historico.mjs): o site baixa só o pedaço do produto aberto (data/hist/NN.json, 30 dias)
// e o "Baixou hoje" compara o preço de hoje com o da coleta anterior.
{
  const h = loadHist();
  const today = h.last || 0;
  const HIST = path.join(OUT, 'hist');
  fs.mkdirSync(HIST, { recursive: true });
  const shards = Array.from({ length: HIST_SHARDS }, () => ({}));
  for (const o of flat) {
    const s = h.ids[o.id];
    if (!s || s.length < 2) continue; // preço que nunca mudou: o site diz "sem mudança" sem baixar nada
    let i = 0;
    while (i + 1 < s.length && s[i + 1][0] <= today - 30) i++;
    shards[histShard(o.id)][o.id] = s.slice(i);
  }
  shards.forEach((ids, n) => fs.writeFileSync(path.join(HIST, `${n}.json`), JSON.stringify(ids)));
  index.hist = { day0: '2026-01-01', today, shards: HIST_SHARDS };

  // Baixou esta semana: a mesma oferta (mesmo mercado) está mais barata que o maior preço dela nos 7 dias anteriores.
  // Queda de mais de 60% é quase sempre cadastro errado ou caixa x unidade: fica de fora.
  const best = new Map();
  for (const o of flat) {
    if (o.rx) continue; // remédio de receita não vira destaque
    const s = h.ids[o.id];
    if (!s) continue;
    // maior preço dos 7 dias anteriores; só conta se a queda aconteceu nesta semana
    if (s[s.length - 1][0] < today - 6) continue;
    let before = 0;
    for (let d = today - 7; d < today; d++) before = Math.max(before, priceAt(s, d) ?? 0);
    if (!before) continue;
    const pct = 1 - o.price / before;
    if (pct < 0.05 || pct > 0.6) continue;
    const k = o.g ?? `p:${o.id}`;
    if (!best.has(k) || best.get(k).pct < pct) best.set(k, { id: o.id, g: k, before, pct: Math.round(pct * 1000) / 1000 });
  }
  index.baixou = [...best.values()].sort((a, b) => b.pct - a.pct).slice(0, 30);
  console.log(`histórico: ${Object.keys(h.ids).length} ofertas; baixou na semana: ${best.size}`);
}
index.groupsByEan = groups.filter((g) => g.key.startsWith('ean:')).length;
index.groups = groups.length;
for (const b of built) fs.writeFileSync(path.join(OUT, `${slug(b.market)}.json`), JSON.stringify(b.slim));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(index.markets.map((m) => `${m.name}: ${m.products}`).join('\n') || 'nenhum dado');
console.log(`Grupos com 2+ mercados: ${groups.length}`);
