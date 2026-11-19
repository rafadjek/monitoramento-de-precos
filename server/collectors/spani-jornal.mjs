// Jornal de ofertas em PDF do Spani Mauá (carnes, frios, ovos e outros itens que não estão no site).
// O link do PDF vem do page-data da página da loja (lojas.spani.com.br). O PDF tem texto, então não precisa de IA de visão:
// lê cada texto com a posição na página (pdfjs-dist) e liga cada preço grande ao bloco de nome mais próximo.
// Regras: a validade vem do cabeçalho do próprio jornal (sem validade clara, nada entra); item sem nome claro, com
// preço ambíguo (caixas "nesta embalagem", "cada 100g") ou com dois produtos para um preço fica de fora.
// Uso: importado por spani.mjs (que junta os itens ao spani.json) ou `node spani-jornal.mjs [saida.json]` para teste.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PAGE_DATA = 'https://lojas.spani.com.br/page-data/lojas/maua/page-data.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MARKET = 'Spani';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// acha o link do PDF dentro do page-data (estrutura do Gatsby: qualquer string que termine em .pdf)
function acharPdf(node, achados = []) {
  if (typeof node === 'string') { if (/^https?:\/\/\S+\.pdf(\?\S*)?$/i.test(node)) achados.push(node); }
  else if (node && typeof node === 'object') for (const v of Object.values(node)) acharPdf(v, achados);
  return achados;
}

// "Ofertas válidas de 17 a 26 de Novembro de 2026. Somente para as lojas de ... Mauá, ..."
// Devolve { validFrom, validUntil, nota } ou null. Só vale se a loja de Mauá estiver na lista.
export function lerValidade(texto) {
  const t = strip(texto).replace(/\s+/g, ' ');
  const m = t.match(/ofertas validas de (\d{1,2})(?: de ([a-z]+))? a (\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m) return null;
  const mesFim = MESES[m[4]], mesIni = m[2] ? MESES[m[2]] : mesFim, ano = +m[5];
  if (!mesFim || !mesIni) return null;
  if (!/\bmaua\b/.test(t.slice(m.index, m.index + 400))) return null; // jornal que não cita Mauá não vale para a loja
  // Brasília é UTC-3 (sem horário de verão desde 2019): início 00:00, fim 23:59:59
  const validFrom = new Date(Date.UTC(ano, mesIni - 1, +m[1], 3, 0, 0)).toISOString();
  const validUntil = new Date(Date.UTC(ano, mesFim - 1, +m[3] + 1, 2, 59, 59)).toISOString();
  if (!(Date.parse(validUntil) > Date.parse(validFrom))) return null;
  return { validFrom, validUntil, nota: `jornal de ofertas válido de ${m[1]}${m[2] ? ' de ' + m[2] : ''} a ${m[3]} de ${m[4]} de ${m[5]} (preço de loja física, Mauá)` };
}

const RUIDO = /^(nas compras|a unidade|sai a|a partir de|unidade:?$|nesta embalagem|r\$$|cada 100g|\d+\s?(g|ml|kg|l) sai a|preco (de atacado|valido)|conforme artigos|ofertas |mogi das cruzes|\*?exceto light$)/;
const PRECO = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Lê os textos de uma página já com posição (x, y de cima para baixo) e devolve os produtos legíveis.
export function lerPagina(itens) {
  const toks = itens.filter((i) => i.str.trim()).map((i) => ({ ...i, str: i.str.trim() }));
  const precos = toks.filter((t) => PRECO.test(t.str));
  const marcas = toks.filter((t) => t.str === 'R$');
  const unidades = toks.filter((t) => /^unidade:?$/i.test(t.str));
  const quantidades = toks.filter((t) => /a partir de \d+/i.test(t.str));
  // preço dentro de caixa "R$" (nesta embalagem / cada 100g) é de outra embalagem: ambíguo, fica de fora
  const caixas = new Set(precos.filter((p) => marcas.some((m) => Math.abs(m.y - p.y) < 30 && p.x - m.x > -5 && p.x - m.x < 40)));
  // preço de "Unidade:" = venda de 1 unidade quando há preço de atacado
  const unitPrecos = new Set();
  for (const u of unidades) {
    const c = precos.filter((p) => !caixas.has(p) && p.x - u.x > -25 && p.x - u.x < 80 && p.y - u.y > -8 && p.y - u.y < 25)
      .sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (c) unitPrecos.add(c);
  }
  const ancoras = precos.filter((p) => !caixas.has(p) && !unitPrecos.has(p));
  const unitDe = new Map();
  for (const a of ancoras) {
    const c = [...unitPrecos].filter((u) => u.x - a.x > -10 && u.x - a.x < 130 && u.y - a.y > -10 && u.y - a.y < 60 && u.h < a.h)
      .sort((x, y) => dist(x, a) - dist(y, a))[0];
    if (c) unitDe.set(a, c);
  }
  // quantidade mínima do atacado: texto "a partir de N" mais perto de uma âncora (qualquer uma, para achar tabela sem preço de unidade)
  const minQ = new Map();
  const tabelaSemUnidade = new Set();
  for (const q of quantidades) {
    const n = +q.str.match(/a partir de (\d+)/i)[1];
    const a = [...ancoras].sort((x, y) => dist(x, q) - dist(y, q))[0];
    if (!a || dist(a, q) >= 130) continue;
    if (unitDe.has(a)) { if (!minQ.has(a)) minQ.set(a, n); } else tabelaSemUnidade.add(a);
  }
  // linhas de nome: tudo que não é preço nem aviso
  const linhas = toks.filter((t) => !PRECO.test(t.str) && !RUIDO.test(strip(t.str)) && t.h >= 9);
  const doAncora = new Map(ancoras.map((a) => [a, []]));
  for (const l of linhas) {
    let melhor = null, custo = Infinity;
    for (const a of ancoras) {
      const dy = a.y - l.y, dx = a.x - l.x;
      if (dy < -14 || dy > 150 || dx < -45 || dx > 260) continue; // o preço fica abaixo ou à direita do nome
      const c = Math.max(dy, 0) + Math.abs(dx) * 0.3;
      if (c < custo) { custo = c; melhor = a; }
    }
    if (melhor) doAncora.get(melhor).push(l);
  }
  const out = [];
  for (const a of ancoras) {
    const ls = doAncora.get(a).sort((x, y) => x.y - y.y || x.x - y.x);
    if (!ls.length || tabelaSemUnidade.has(a)) continue; // preço de atacado sem o de unidade: ambíguo
    // linhas do mesmo nome ficam coladas (10 a 13 pt); salto grande = nome de outro produto misturado
    if (ls.some((l, i) => i && l.y - ls[i - 1].y > 16)) continue;
    // dois produtos para um preço (ex.: "Pão de Forma Kim Tradicional 400g /" + "Bisnaguinha Kim 300g")
    if (ls.some((l, i) => i < ls.length - 1 && /\/$/.test(l.str))) continue;
    let nome = ls.map((l) => l.str).join(' ').replace(/\s+/g, ' ').trim();
    const m = nome.match(/\s(Un|Kg)$/);
    if (!m) continue; // sem a unidade de venda no fim do nome, o item é ilegível ou incompleto
    const porKg = m[1] === 'Kg';
    nome = nome.slice(0, -m[0].length).trim();
    if (nome.length < 4) continue;
    const preco = num(a.str);
    const un = unitDe.get(a);
    let price = preco, condition = null;
    if (un) {
      const pu = num(un.str), q = minQ.get(a);
      // atacado: o preço de 1 unidade é o preço do produto; o de atacado vira condição (como no site do Spani)
      if (!q || !(pu > preco)) continue;
      price = pu;
      condition = `${brl(preco)} cada levando ${q} ou mais`;
    }
    if (porKg) condition = condition ? `${condition}; preço por kg` : 'preço por kg';
    if (!(price >= 0.1 && price < 2000)) continue;
    out.push({ nome, price, condition, porKg, x: a.x, y: a.y });
  }
  return out;
}

const HIGIENE = /\b(shampoo|condicionador|sabonete|creme dental|escova dental|desodorante|papel higienico|fralda|toalha umedecida|leite hidratante|absorvente)\b/;
const LIMPEZA = /\b(detergente|alcool|lava roupas|amaciante|limpador|sabao|inseticida|papel toalha|la de aco|repelente|difusor|desinfetante|agua sanitaria)\b/;
const OUTROS = /\b(racao|copo descartavel|jogo de copo|guardanapo|filtro de papel|papel aluminio)\b/;
const sizeFrom = (name) => {
  const m = [...name.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|lt)\b/gi)];
  return m.length ? `${m.at(-1)[1].replace(',', '.')}${m.at(-1)[2].toLowerCase()}` : null;
};

// Baixa o PDF vigente e devolve { items, pdf, validade, paginas }. Lança erro se não houver jornal vigente legível.
export async function lerJornal({ log = console.log } = {}) {
  const r = await fetch(PAGE_DATA, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`page-data do Spani: HTTP ${r.status}`);
  const pdfs = [...new Set(acharPdf(await r.json()))];
  if (pdfs.length !== 1) throw new Error(`esperava 1 PDF do jornal e achei ${pdfs.length}`);
  const url = pdfs[0];
  await sleep(1000);
  const rp = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
  if (!rp.ok) throw new Error(`PDF do jornal: HTTP ${rp.status}`);
  const data = new Uint8Array(await rp.arrayBuffer());
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p);
    const H = pg.getViewport({ scale: 1 }).height;
    const t = await pg.getTextContent();
    paginas.push(t.items.filter((i) => i.str?.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: H - i.transform[5], h: i.height })));
  }
  const val = lerValidade(paginas.flat().map((i) => i.str).join(' '));
  if (!val) throw new Error('jornal sem validade clara (ou sem Mauá na lista de lojas): nenhum item gravado');
  if (Date.parse(val.validUntil) < Date.now()) throw new Error(`jornal vencido (${val.validUntil}): nenhum item gravado`);
  const collectedAt = new Date().toISOString();
  const storeScope = 'Jornal de ofertas do Spani, loja Mauá (preço de loja física; condicionado ao estoque da loja)';
  const out = new Map();
  paginas.forEach((itens, i) => {
    for (const it of lerPagina(itens)) {
      const id = 'jornal-' + crypto.createHash('sha1').update(strip(it.nome) + '|' + (it.porKg ? 'kg' : 'un')).digest('hex').slice(0, 10);
      if (out.has(id)) continue;
      const n = strip(it.nome);
      out.set(id, {
        market: MARKET, externalId: id, name: it.nome, brand: null, ean: null,
        size: it.porKg ? null : sizeFrom(it.nome), price: Math.round(it.price * 100) / 100, listPrice: null, unitPrice: null,
        category: OUTROS.test(n) ? 'outros' : HIGIENE.test(n) ? 'higiene' : LIMPEZA.test(n) ? 'limpeza' : 'alimenticios',
        categoryRaw: null, imageUrl: null, productUrl: url, source: 'encarte', condition: it.condition,
        validFrom: val.validFrom, validUntil: val.validUntil, validityNote: val.nota, pagina: i + 1, storeScope, collectedAt,
      });
    }
  });
  log(`jornal: ${doc.numPages} páginas, ${out.size} itens, válido até ${val.validUntil}`);
  return { items: [...out.values()], pdf: url, validade: val, paginas: doc.numPages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dest = process.argv[2] || 'D:/Temp/spani-jornal.json';
  const res = await lerJornal();
  fs.writeFileSync(dest, JSON.stringify(res.items, null, 2));
  console.log('gravado em', dest);
}
