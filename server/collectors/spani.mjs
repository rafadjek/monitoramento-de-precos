// Coletor do Spani Atacadista (spanionline.com.br), loja Spani Mauá 1.
// Usa a API pública da VipCommerce com o login anônimo que o próprio site faz (sem conta de usuário).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARKET = 'Spani';
const API = 'https://services-beta.vipcommerce.com.br/api-admin/v1';
const SITE = 'https://www.spanionline.com.br';
const IMG = 'https://produto-assets-vipcommerce-com-br.br-se1.magaluobjects.com/500x500/';
const FILIAL = 1;
const STORE_RE = /Mau[aá]/i; // loja de retirada da região (não há loja em Ribeirão Pires na lista pública)
const MAX_REQ = 600;
const PAGE = 100;
const OUT = fileURLToPath(new URL('../data/extraido/', import.meta.url));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const base = { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json', Origin: SITE, Referer: SITE + '/', domainkey: 'spanionline.com.br', organizationid: '67', 'accept-language': 'pt-BR' };
// Chave pública anônima enviada pelo JavaScript do próprio site no login "loja" (visitante).
const LOGIN = { domain: 'spanionline.com.br', username: 'loja', key: 'df072f85df9bf7dd71b6811c34bdbaa4f219d98775b56cff9dfa5f8ca1bf8469' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let reqs = 0;
let headers = null;
const stats = { requests: 0, blocked: null };

class Blocked extends Error {}

async function login() {
  const r = await fetch(`${API}/org/67/auth/loja/login`, { method: 'POST', headers: base, body: JSON.stringify(LOGIN) });
  stats.requests++;
  if (r.status === 403 || r.status === 429) throw new Blocked(`login ${r.status}`);
  const token = (await r.json()).data;
  await sleep(1000);
  const s = await fetch(`${API}/org/67/loja/sessao_cliente`, { headers: { ...base, Authorization: 'Bearer ' + token } });
  stats.requests++;
  const sessao = (await s.json()).data.sessao_id;
  headers = { ...base, Authorization: 'Bearer ' + token, 'sessao-id': sessao };
}

async function get(path, retry = true) {
  if (reqs++ >= MAX_REQ) throw new Error('teto de requisições atingido');
  await sleep(1000);
  stats.requests++;
  const r = await fetch(API + path, { headers });
  if (r.status === 403 || r.status === 429) throw new Blocked(`${r.status} em ${path}`);
  if (r.status === 401 && retry) { await login(); return get(path, false); }
  if (r.status >= 500 && retry) { await sleep(3000); return get(path, false); }
  if (!r.ok) throw new Error(`${r.status} em ${path}`);
  return r.json();
}

function sizeFrom(name) {
  const m = [...name.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|lt|un|und|unid|m|cm|mm)\b/gi)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  return `${last[1].replace(',', '.')}${last[2].toLowerCase()}`;
}

const CAT = {
  alimenticios: ['biscoitos e chocolates', 'bebidas', 'mercearia', 'cereais e farinaceos', 'padaria', 'carnes', 'hortifruti', 'matinais e sobremesas', 'frios e laticinios', 'congelados'],
  higiene: ['perfumaria e higiene'],
  limpeza: ['limpeza'],
};
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const categoryOf = (dep) => Object.entries(CAT).find(([, v]) => v.includes(norm(dep)))?.[0] ?? 'outros';
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  const startedAt = new Date().toISOString();
  await login();

  const stores = (await get(`/org/67/filial/${FILIAL}/loja/centros_distribuicoes/retiradas`)).data;
  const store = stores.find((s) => s.ativo && STORE_RE.test(s.endereco?.cidade || ''));
  if (!store) throw new Error('loja de Mauá não encontrada na lista pública de lojas');
  const cd = store.id;
  const e = store.endereco;
  const storeScope = `${store.nome_site} - ${e.logradouro}, ${e.numero}, ${e.bairro}, ${e.cidade}/SP, CEP ${e.cep} (retirada na loja; centro de distribuição ${cd}, selecionado como o site faz ao escolher a loja)`;

  const root = `/org/67/filial/${FILIAL}/centro_distribuicao/${cd}/loja/classificacoes_mercadologicas/departamentos`;
  const tree = (await get(`${root}/arvore`)).data;
  const secName = new Map();
  for (const d of tree) for (const s of d.children || []) secName.set(s.classificacao_mercadologica_id, s.descricao);

  const wanted = tree.filter((d) => categoryOf(d.descricao) !== 'outros');
  const skipped = tree.filter((d) => categoryOf(d.descricao) === 'outros').map((d) => d.descricao);

  const out = new Map();
  const perDept = {};
  let unavailable = 0;
  let discarded = 0;
  const collectedAt = new Date().toISOString();

  for (const dep of wanted) {
    const depId = dep.classificacao_mercadologica_id;
    let page = 1;
    let totalPages = 1;
    perDept[dep.descricao] = 0;
    do {
      const r = await get(`${root}/${depId}/produtos?page=${page}&limit=${PAGE}`);
      totalPages = r.paginator?.total_pages ?? 1;
      for (const p of r.data) {
        const name = (p.descricao || '').trim();
        const regular = parseFloat(p.preco);
        if (!name || !(regular > 0)) { discarded++; continue; }
        if (p.disponivel === false) { unavailable++; continue; }
        let price = regular;
        let listPrice = null;
        let note = 'O Spani não publica data de término das ofertas; o preço é o vigente no momento da coleta.';
        const o = p.em_oferta ? p.oferta : null;
        if (o) {
          const po = parseFloat(o.preco_oferta);
          const pa = parseFloat(o.preco_antigo);
          const minQ = Number(o.quantidade_minima) || 1;
          if (po > 0 && minQ <= 1) {
            price = po;
            if (pa > po) listPrice = pa;
            note = `Oferta (${o.nome}). ${note}`;
          } else if (po > 0) {
            note = `${o.nome}: ${brl(po)} cada na compra de ${minQ} ou mais unidades (preço de 1 unidade: ${brl(regular)}). ${note}`;
          }
        }
        const secId = p.secao_id ?? p.classificacao_mercadologica_id;
        const sec = secName.get(secId);
        const rec = {
          market: MARKET,
          externalId: String(p.produto_id),
          name,
          brand: null,
          ean: p.codigo_barras ? String(p.codigo_barras).trim() : null,
          size: sizeFrom(name),
          price: Math.round(price * 100) / 100,
          listPrice: listPrice ? Math.round(listPrice * 100) / 100 : null,
          unitPrice: null,
          category: categoryOf(dep.descricao),
          categoryRaw: sec ? `${dep.descricao} > ${sec}` : dep.descricao,
          imageUrl: p.imagem ? IMG + p.imagem : null,
          productUrl: `${SITE}/produto/${p.produto_id}/${p.link}`,
          validFrom: null,
          validUntil: null,
          validityNote: note,
          storeScope,
          collectedAt,
        };
        if (!out.has(rec.externalId)) { out.set(rec.externalId, rec); perDept[dep.descricao]++; }
      }
      page++;
    } while (page <= totalPages);
    console.log(`${dep.descricao}: ${perDept[dep.descricao]} produtos`);
  }

  const list = [...out.values()];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + 'spani.json', JSON.stringify(list, null, 2));
  const meta = { startedAt, finishedAt: new Date().toISOString(), total: list.length, perDept, skippedDepartments: skipped, unavailable, discarded, requests: stats.requests, storeScope, storeId: cd };
  fs.writeFileSync(OUT + 'spani.meta.json', JSON.stringify(meta, null, 2));
  console.log('TOTAL', list.length, JSON.stringify({ unavailable, discarded, requests: stats.requests }));
}

main().catch((e) => {
  if (e instanceof Blocked) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(OUT + 'spani.bloqueio.txt', `${new Date().toISOString()} ${e.message}\n`);
    console.error('BLOQUEADO:', e.message);
  } else console.error('ERRO:', e.message);
  process.exit(1);
});
