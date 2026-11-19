// Tony BRJ Carnes (Av. Assis Brasil, 516, Vila Assis Brasil, Mauá): açougue de bairro que vende pelo catálogo OnBeef.
// O catálogo público (https://tony-brj-carnes.onbeef.app.br) é um app que lê a API aberta da OnBeef, sem login:
//   POST https://api.onbeefapp.com.br/api/all/merchants/<id>/products  {cuts:[],tags:[],search:'',complete:true}
// devolve todas as categorias com todos os produtos (o JSON de cache em S3 traz só 6 por categoria, por isso não serve).
// Sem custo de IA. Uma única requisição por coleta.
// Preço: produto por kg (type KG, ou sem type com price_per_kilo) grava o preço do kg e unitPrice "preço por kg", igual a
// Coop/Semar/Extra; o peso "estimated_weight" é só a porção mínima do pedido, não o tamanho, e não entra em size.
// Produto por unidade/kit grava price_per_unit; size só quando o próprio nome diz (ex.: "160g").
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/tonybrj.json', import.meta.url));
const MARKET = 'Tony BRJ Carnes';
const MERCHANT = '2c3ffb87-bddc-4c78-8226-961630407035';
const SITE = 'https://tony-brj-carnes.onbeef.app.br';
const API = `https://api.onbeefapp.com.br/api/all/merchants/${MERCHANT}/products`;
const SCOPE = 'Tony BRJ Carnes, Av. Assis Brasil, 516, Vila Assis Brasil, Mauá (retirada ou entrega)';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const r = await fetch(API, {
  method: 'POST',
  headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: `${SITE}/` },
  body: JSON.stringify({ cuts: [], tags: [], search: '', complete: true }),
  signal: AbortSignal.timeout(45000),
}).catch((e) => ({ ok: false, status: e.message }));
if (!r.ok) { console.error(`tonybrj: HTTP ${r.status}; mantendo arquivo anterior`); process.exit(1); }
const cats = await r.json().catch(() => null);
if (!Array.isArray(cats)) { console.error('tonybrj: resposta fora do formato esperado'); process.exit(1); }

const collectedAt = new Date().toISOString();
const now = Date.now();
const rows = new Map();
let semPreco = 0, placeholder = 0;
for (const cat of cats) {
  for (const p of cat.products || []) {
    if (rows.has(p.id)) continue; // o mesmo produto aparece em mais de uma categoria
    if (p.status !== 1) continue;
    const name = String(p.name || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    // Cadastro de teste do catálogo ("Suco 1", "Vinho 2"): sem produto real, fora
    if (/^(suco|vinho|cerveja|refrigerante)\s*\d+$/i.test(name)) { placeholder++; continue; }
    const porKg = p.type === 'KG' || (!p.type && p.price_per_kilo > 0);
    let price = Number(porKg ? p.price_per_kilo : p.price_per_unit);
    if (!(price > 0)) { semPreco++; continue; }
    // Promoção só vale dentro da janela informada pelo site (as datas vêm sem fuso; tratadas como UTC)
    let listPrice = null, validUntil = null;
    const pr = p.promotion;
    if (pr && pr.status === 1 && Number(pr.fixed_amount) > 0 && Number(pr.fixed_amount) < price) {
      const ini = Date.parse(`${String(pr.start_at).replace(' ', 'T')}Z`);
      const fim = Date.parse(`${String(pr.expired_at).replace(' ', 'T')}Z`);
      if (ini <= now && now <= fim) { listPrice = price; price = Number(pr.fixed_amount); validUntil = new Date(fim).toISOString(); }
    }
    const sizeM = porKg ? null : [...name.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|gr|ml|l)\b/gi)].pop();
    const un = sizeM ? (sizeM[2].toLowerCase() === 'gr' ? 'g' : sizeM[2].toLowerCase()) : null;
    rows.set(p.id, {
      market: MARKET,
      segment: 'bairro',
      externalId: String(p.id),
      name,
      brand: p.brand?.name || (typeof p.brand === 'string' ? p.brand : null) || null,
      ean: null,
      size: sizeM ? `${sizeM[1].replace(',', '.')}${un}` : null,
      price,
      listPrice,
      unitPrice: porKg ? 'preço por kg' : null,
      category: 'alimenticios',
      categoryRaw: cat.name,
      imageUrl: p.media?.[0]?.file_url ?? null,
      productUrl: p.slug ? `${SITE}/product/${p.slug}` : null,
      validFrom: null,
      validUntil,
      validityNote: validUntil ? 'promoção com data de fim informada pelo site' : 'o site não informa até quando o preço vale',
      condition: porKg ? 'preço por kg' : null,
      storeScope: SCOPE,
      collectedAt,
    });
  }
}
if (!rows.size) { console.error('tonybrj: nenhum produto coletado; mantendo arquivo anterior'); process.exit(1); }
fs.mkdirSync(fileURLToPath(new URL('../data/extraido/', import.meta.url)), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify([...rows.values()], null, 2));
const kg = [...rows.values()].filter((x) => x.unitPrice).length;
console.log(`tonybrj: ${rows.size} itens (${kg} por kg, ${rows.size - kg} por unidade/kit); ${semPreco} sem preço e ${placeholder} cadastros de teste fora`);
