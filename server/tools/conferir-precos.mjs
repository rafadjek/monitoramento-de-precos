// Conferência diária: o preço que o SITE publica bate com o preço que a LOJA mostra?
//
// Para cada um dos 6 mercados de catálogo (Spani, Atacadão, Coop, Nagumo, Semar, Extra) sorteia
// AMOSTRA produtos (metade em oferta, se houver) do dado publicado em app/public/data (o que
// build-site.mjs grava) e confere cada um na loja, na MESMA loja/CEP do coletor, sem usar o
// código de coleta de preço dos coletores (só a abertura de sessão do Atacadão é reaproveitada).
//
// Como cada mercado é lido:
//   Spani, Atacadão, Coop, Nagumo -> abre a página do produto (productUrl) no Chrome e lê os preços
//                                    mostrados no bloco do produto (inclui "mais por menos"/quantidade e cooperado).
//   Extra  -> API da própria loja para aquele produto (bestPrices?storeId=1643), o mesmo endereço que a página
//             usa para desenhar o preço. Motivo: a página do Extra só mostra a loja 1643 (Ribeirão Pires, loja online da R. João Domingues de Oliveira; até 19/11 era a 1162 de São Bernardo) se o
//             visitante informar um endereço atendido por ela (fica no estado persistido do site), e o site
//             não entrega em Mauá; sem isso a página mostra a loja padrão (483) com outros preços.
//   Semar  -> busca na API oSuper (sense.osuper.com.br) pelo nome do produto, de dentro da página da loja
//             (a Cloudflare dessa API só atende navegador) e acha o produto pelo id. Motivo: a página do produto
//             é desenhada no navegador a partir dessa mesma API, e o Semar não abre na rede onde o script foi
//             escrito, então o desenho da página nunca foi visto; a API tem os campos de clube (personaPromotions)
//             e promoções que a página mostra.
//
// "Bate" = o preço do site é um dos preços que a loja mostra e é o MENOR que a regra permite
// (price.mjs: vale clube por CPF, app, pix e "levando N"; cartão próprio da loja não vale).
// Produto sumido/esgotado na loja = divergência do tipo "sumiu". Leitura que falhou (bloqueio, página que não
// abriu, sem preço lido) não é divergência: fica em "inconclusivos".
//
// Coleta educada: pausa de 1,1 s ou mais entre requisições; 403/429/captcha = "bloqueado" (registra e para
// aquele mercado, não contorna).
//
// Uso (a partir de server/):  node tools/conferir-precos.mjs
// Variáveis: AMOSTRA (15), MERCADOS (ex.: spani,coop), SEMENTE (número, para repetir o sorteio), CHROME_PATH.
// Saída: data/extraido/conferencia.json e uma tabela no console, com ::warning:: por mercado divergente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { openSession as abrirSessaoAtacadao } from '../collectors/atacadao.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(ROOT, '../app/public/data');
const SAIDA = path.join(ROOT, 'data/extraido/conferencia.json');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const AMOSTRA = Number(process.env.AMOSTRA) || 15;
const SEMENTE = Number(process.env.SEMENTE) || Date.now() % 2147483647;
const PAUSA_MS = 1100;
// price.mjs diz que preço de cooperado conta (só pede ser cooperado). Mude para false se o Rafael decidir
// que o preço de cooperado (Coop) não vale como "menor preço".
const COOPERADO_CONTA = true;
const TODOS = ['Spani', 'Atacadão', 'Coop', 'Nagumo', 'Semar', 'Extra', 'Drogaria São Paulo', 'Farma Conde'];
// leitores que usam só API (sem navegador)
const SEM_NAVEGADOR = new Set(['Atacadão', 'Extra', 'Drogaria São Paulo', 'Farma Conde']);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const filtro = (process.env.MERCADOS || '').split(',').map((s) => norm(s.trim())).filter(Boolean);
const MERCADOS = TODOS.filter((m) => !filtro.length || filtro.includes(norm(m)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
const iguais = (a, b) => Math.abs(a - b) < 0.006;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');
const UA_BASE = (v) => `Mozilla/5.0 (${process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;

class Bloqueado extends Error {}

// ---------- sorteio ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEMENTE);
const embaralhar = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// "Em oferta": o site marca (preço de tabela maior ou condição) ou, no Nagumo e no Atacadão, que não publicam preço de tabela,
// o dado bruto do coletor diz que o produto está em "Ofertas do dia"/"Super Ofertas"/preço por quantidade
// (é onde o preço da loja mais muda e onde um erro de coleta apareceria).
function ofertaNoBruto(nome) {
  try {
    const bruto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/extraido', slug(nome) + '.json'), 'utf8'));
    return new Set(bruto.filter((r) => /Ofertas do dia|Super Ofertas|a partir de \d+ un/i.test(r.validityNote || '')).map((r) => slug(nome) + ':' + r.externalId));
  } catch { return new Set(); }
}
function sortear(lista, n, extra = new Set()) {
  const emOferta = (o) => o.listPrice || o.condition || extra.has(o.id);
  const ofertas = embaralhar(lista.filter(emOferta));
  const comuns = embaralhar(lista.filter((o) => !emOferta(o)));
  const metade = Math.min(ofertas.length, Math.ceil(n / 2));
  const pick = [...ofertas.slice(0, metade), ...comuns.slice(0, n - metade)];
  if (pick.length < n) pick.push(...ofertas.slice(metade, metade + n - pick.length));
  return pick;
}

// ---------- leitura de preços no texto da página ----------
// Devolve todos os "R$ x" do bloco com marcas: peso (preço por kg/l, não é o preço do pacote),
// cartao (cartão da loja) e cooperado.
function extrairPrecos(bloco) {
  const out = [];
  const idxCoop = bloco.search(/cooperado/i);
  for (const m of bloco.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)) {
    const valor = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) continue;
    const antes = bloco.slice(Math.max(0, m.index - 40), m.index);
    const depois = bloco.slice(m.index + m[0].length, m.index + m[0].length + 25);
    out.push({
      valor,
      peso: /^\s*\/\s*(kg|l|g|ml|100\s?g)\b/i.test(depois) || /pre[cç]o\s+por[^|]{0,15}$/i.test(antes),
      cartao: /cart[aã]o/i.test(antes.slice(-25)) || /^[^|]{0,12}cart[aã]o/i.test(depois),
      // na Coop, tudo que vem depois da palavra "Cooperado" é preço de cooperado (o do pacote e o por kg)
      cooperado: idxCoop >= 0 && m.index > idxCoop,
      // o texto da linha anterior ("Oferta", "9% a partir da 6ª unidade", "Cooperado") ajuda a entender de onde veio o preço
      rotulo: ((antes.split('|').map((s) => s.trim()).filter(Boolean).pop() || '').slice(-32) + ' ' + m[0] + (/^\s*\/\s*\w+/.test(depois) ? depois.match(/^\s*\/\s*\w+/)[0].replace(/\s+/g, '') : '')).trim(),
    });
  }
  return out;
}
const recorte = (txt, de, ate) => {
  const i = typeof de === 'string' ? txt.indexOf(de) : txt.search(de);
  if (i < 0) return null;
  const fins = [].concat(ate).map((a) => { const k = typeof a === 'string' ? txt.indexOf(a, i + 1) : txt.slice(i + 1).search(a); return k < 0 ? -1 : (typeof a === 'string' ? k : k + i + 1); }).filter((k) => k > i);
  return txt.slice(i, fins.length ? Math.min(...fins) : i + 1500);
};

// ---------- páginas (Chrome) ----------
async function novoNavegador() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const UA = UA_BASE(browser.version().split('.')[0]);
  return { browser, UA };
}
async function poupar(page) { // sem imagem, fonte e vídeo: só o texto importa (e a página abre bem mais rápido)
  await page.route('**/*', (r) => (['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue()));
}
// Abre a página e devolve o texto. Lança Bloqueado em 403/429/captcha.
async function abrirPagina(page, url, esperaRe, assentarMs) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (resp && [403, 429].includes(resp.status())) throw new Bloqueado(`HTTP ${resp.status()}`);
  await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), esperaRe.source, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(assentarMs);
  // quebras de linha viram " | ": os recortes e as marcas abaixo contam com esse separador
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ').replace(/\s*\n\s*/g, ' | ');
  if (/captcha|access denied|just a moment|unusual traffic|verifique que voc[êe] [ée] humano/i.test(txt.slice(0, 1500)) && !/R\$\s*\d/.test(txt)) throw new Bloqueado('captcha/desafio na página');
  return { status: resp?.status() ?? 0, txt };
}

// Farmácias VTEX (Fase 14): o coletor usa o preço da simulação com retirada; a API pública do catálogo, pelo SKU,
// traz o mesmo preço que a página do produto mostra (conferido em 19/11 em 8 itens da DSP e 10 da Conde).
function leitorVtex(base, rotuloLoja) {
  return {
    metodo: 'API pública do catálogo (preço do SKU, o mesmo da página do produto)',
    async ler(o) {
      const sku = o.id.split(':').pop();
      const r = await fetch(`${base}/api/catalog_system/pub/products/search?fq=skuId:${sku}`, { headers: { 'User-Agent': UA_BASE(130), Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if ([403, 429].includes(r.status)) throw new Bloqueado(`HTTP ${r.status}`);
      if (!r.ok) return { inconclusivo: `API respondeu HTTP ${r.status}` };
      const item = (await r.json())[0]?.items?.find((i) => String(i.itemId) === sku);
      if (!item) return { sumiu: 'o site não tem mais esse produto' };
      const precos = [];
      for (const se of item.sellers || []) {
        const co = se.commertialOffer || {};
        if (!(co.AvailableQuantity > 0)) continue;
        if (co.Price > 0) precos.push({ valor: co.Price, rotulo: `preço (${se.sellerName || se.sellerId})`, peso: false, cartao: false, cooperado: false });
      }
      if (!precos.length) return { sumiu: 'sem estoque no site' };
      return { precos };
    },
    loja: () => rotuloLoja,
    fechar: async () => {},
  };
}

const LEITORES = {
  async 'Drogaria São Paulo'() { return leitorVtex('https://www.drogariasaopaulo.com.br', 'site (retirada nas lojas de Mauá e Ribeirão Pires)'); },
  async 'Farma Conde'() { return leitorVtex('https://www.farmaconde.com.br', 'site (retirada nas lojas de Mauá)'); },
  // Spani (VipCommerce): loja de retirada Mauá 1 (centro de distribuição 17), escolhida como o site faz, pelo localStorage.
  async Spani(ctxNav) {
    let cd = 17;
    try { cd = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/extraido/spani.meta.json'), 'utf8')).storeId || 17; } catch { /* usa 17 */ }
    const ctx = await ctxNav.browser.newContext({ locale: 'pt-BR', userAgent: ctxNav.UA, viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((id) => { try { localStorage.setItem('cdSelecionado', String(id)); localStorage.setItem('formaEntregaSelecionada', '2'); } catch { /* */ } }, cd);
    const page = await ctx.newPage();
    await poupar(page);
    let loja = null;
    return {
      metodo: 'página do produto',
      async ler(o) {
        const { txt } = await abrirPagina(page, o.productUrl, /Adicionar a lista|n[ãa]o encontrad|indispon/, 1500);
        loja = /Retirar na loja:[\s|]*([^|]+)/i.exec(txt)?.[1]?.trim() ?? null;
        if (!loja || !/Barão de Mauá, 2005/i.test(loja)) throw new Error(`loja errada na página do Spani (lida: ${loja || 'nenhuma'})`);
        const bloco = recorte(txt, 'Adicionar a lista', ['Compare', 'Avaliações']);
        if (/Produto indispon[ií]vel/i.test(bloco || txt.slice(0, 3000))) return { sumiu: 'página diz "Produto indisponível"' };
        if (bloco === null) return /n[ãa]o encontrad/i.test(txt) ? { sumiu: 'página do produto não existe mais' } : { inconclusivo: 'bloco do produto não encontrado na página' };
        return { precos: extrairPrecos(bloco), loja };
      },
      loja: () => loja,
      fechar: () => ctx.close(),
    };
  },

  // Atacadão: mesma sessão do coletor (CEP 09310-000 + número 1 -> loja Mauá Itapark), reaproveitada de collectors/atacadao.mjs.
  async Atacadão() {
    const s = await abrirSessaoAtacadao();
    if (!/Mau/i.test(s.storeName || '')) { await s.browser.close(); throw new Error(`loja errada no Atacadão (${s.storeName || 'sem loja'})`); }
    await poupar(s.page);
    return {
      metodo: 'página do produto',
      async ler(o) {
        const { txt } = await abrirPagina(s.page, o.productUrl, /C[óo]digo:|indispon|n[ãa]o encontrad/, 1500);
        const bloco = recorte(txt, /C[óo]digo:/, ['Produtos Similares', 'Produtos Sugeridos', 'Descrição do produto']);
        if (bloco === null) return /n[ãa]o encontrad|p[áa]gina n[ãa]o/i.test(txt) ? { sumiu: 'página do produto não existe mais' } : { inconclusivo: 'bloco do produto não encontrado na página' };
        if (/indispon[ií]vel|esgotad|avise-me|produto sem estoque/i.test(bloco)) return { sumiu: 'página mostra o produto indisponível/esgotado' };
        if (!/Adicionar ao carrinho/i.test(bloco)) return { inconclusivo: 'sem botão de compra nem aviso de falta na página' };
        const precos = extrairPrecos(bloco.replace(/Resumo da compra:[^|]*/i, ''));
        // "A partir de N unid. | R$ 7,38 | R$ 6,69 | -9%": o primeiro é o de 1 unidade, o segundo o de N ou mais
        const n = /A partir de (\d+) unid/i.exec(bloco)?.[1];
        if (n && precos.length >= 2) { precos[0].rotulo = 'preço de 1 unidade'; for (const p of precos.slice(1)) p.rotulo = `a partir de ${n} un`; }
        return { precos, loja: s.storeName };
      },
      loja: () => s.storeName,
      fechar: () => s.browser.close(),
    };
  },

  // Coop (VTEX): a loja é escolhida pela tela do site (Alterar loja > CEP 09310-000 > Retire na loja > Barão de Mauá), que grava
  // vtex_segment.regionId = base64("SW#coopspbm"), o mesmo valor que o coletor manda como regionId. (Gravar o cookie na mão
  // não funciona: o site ignora e continua na "Loja Industrial".)
  async Coop(ctxNav) {
    const ctx = await ctxNav.browser.newContext({ locale: 'pt-BR', userAgent: ctxNav.UA, viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    // Em 18/11 o Actions não achou "Alterar loja" (daqui funcionava): agora espera mais, tenta duas vezes
    // e, se falhar, põe no erro o passo e o começo do texto da tela, para o log mostrar o que apareceu.
    const escolherLoja = async () => {
      let passo = 'abrir o site';
      try {
        await page.goto('https://www.coopsupermercado.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await page.getByRole('button', { name: /aceitar todos/i }).first().click({ timeout: 3000 }).catch(() => {});
        passo = 'Alterar loja';
        await page.getByText('Alterar loja').first().click({ timeout: 30000 });
        await page.waitForTimeout(1500);
        passo = 'CEP';
        await page.getByPlaceholder(/cep/i).first().fill('09310-000', { timeout: 15000 });
        await page.getByText('Verificar').first().click({ timeout: 15000 });
        await page.waitForTimeout(4000);
        passo = 'Retire Hoje';
        await page.getByText(/Retire Hoje/).first().click({ timeout: 20000 });
        await page.waitForTimeout(3000);
        passo = 'BARÃO DE MAUÁ';
        await page.getByText('BARÃO DE MAUÁ').first().click({ timeout: 20000 });
        passo = 'Continuar';
        await page.getByRole('button', { name: /continuar/i }).click({ timeout: 15000 });
        await page.waitForTimeout(4000);
      } catch (e) {
        const tela = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        throw new Error(`escolha da loja parou em "${passo}" (${e.message.split('\n')[0]}); tela: ${tela.replace(/\s+/g, ' ').slice(0, 300)}`);
      }
    };
    try { await escolherLoja(); } catch (e) {
      console.log(`  Coop: 1ª tentativa de escolher a loja falhou: ${e.message}`);
      await escolherLoja();
    }
    await poupar(page);
    let loja = null;
    return {
      metodo: 'página do produto',
      async ler(o) {
        const { txt } = await abrirPagina(page, o.productUrl, /Cod\. \d+[^|]*\|[^|]*R\$|n[ãa]o est[áa] dispon[ií]vel|p[áa]gina n[ãa]o/, 1500);
        loja = /Retirar em:[\s|]*([^|]+)/i.exec(txt)?.[1]?.trim() ?? null;
        if (!loja || !/Bar[ãa]o de Mau[áa]/i.test(loja)) throw new Error(`loja errada na página da Coop (lida: ${loja || 'nenhuma'})`);
        const bloco = recorte(txt, /Cod\. \d/, ['Outros produtos da categoria']);
        if (bloco === null) return /n[ãa]o encontrad|p[áa]gina n[ãa]o/i.test(txt) ? { sumiu: 'página do produto não existe mais' } : { inconclusivo: 'bloco do produto não encontrado na página' };
        if (/n[ãa]o est[áa] dispon[ií]vel/i.test(bloco)) return { sumiu: 'página diz "Este produto não está disponível no momento"' };
        return { precos: extrairPrecos(bloco.split(/Adicionar [àa] lista/i)[0]), loja };
      },
      loja: () => loja,
      fechar: () => ctx.close(),
    };
  },

  // Nagumo (Salesforce): loja 038-MAUA fixada por Stores-SelectStore, como no coletor.
  async Nagumo(ctxNav) {
    const BASE = 'https://www.nagumo.com.br';
    const ctx = await ctxNav.browser.newContext({ locale: 'pt-BR', userAgent: ctxNav.UA, viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate(async (b) => (await fetch(b + '/on/demandware.store/Sites-Nagumo-Site/pt_BR/Stores-SelectStore?storeId=38&method=Retirada', { credentials: 'include' })).status, BASE);
    if (st !== 200) throw new Error('Nagumo: SelectStore falhou HTTP ' + st);
    await poupar(page);
    let loja = null;
    return {
      metodo: 'página do produto',
      async ler(o) {
        const { txt } = await abrirPagina(page, o.productUrl, /Adicionar ao carrinho|indispon|esgotad|n[ãa]o encontrad|p[áa]gina n[ãa]o/, 800);
        loja = /Loja\s+(\d{3}-[A-Z]+)/.exec(txt)?.[1] ?? null;
        if (loja !== '038-MAUA') throw new Error(`loja errada no Nagumo (lida: ${loja || 'nenhuma'})`);
        const bloco = recorte(txt, 'Marca:', ['Descrição do produto', 'Produtos relacionados']);
        if (bloco === null) return /n[ãa]o encontrad|p[áa]gina n[ãa]o/i.test(txt) ? { sumiu: 'página do produto não existe mais' } : { inconclusivo: 'bloco do produto não encontrado na página' };
        if (/indispon[ií]vel|esgotad|sem estoque/i.test(bloco) && !/Adicionar ao carrinho/i.test(bloco)) return { sumiu: 'página mostra o produto indisponível/esgotado' };
        return { precos: extrairPrecos(bloco.split(/Adicionar ao carrinho/i)[0]), loja };
      },
      loja: () => loja,
      fechar: () => ctx.close(),
    };
  },

  // Extra: API de preços da página do produto, loja 1643 (ver o comentário no topo do arquivo).
  async Extra() {
    const STORE = 1643;
    const H = { 'User-Agent': UA_BASE(130), Origin: 'https://www.extramercado.com.br', Referer: 'https://www.extramercado.com.br/', Accept: 'application/json' };
    return {
      metodo: 'API da loja (bestPrices, loja 1643)',
      async ler(o) {
        const id = o.id.split(':')[1];
        const r = await fetch(`https://api.vendas.gpa.digital/ex/products/ecom/${id}/bestPrices?storeId=${STORE}&sellType=&isClienteMais=true`, { headers: H, signal: AbortSignal.timeout(30000) });
        if ([403, 429].includes(r.status)) throw new Bloqueado(`HTTP ${r.status}`);
        if (r.status === 404) return { sumiu: 'a loja não tem mais esse produto (HTTP 404)' };
        if (!r.ok) return { inconclusivo: `API respondeu HTTP ${r.status}` };
        const c = (await r.json()).content;
        const s = (c?.sellInfos || []).find((x) => x.storeId === STORE) || null;
        if (!s) return { sumiu: 'sem preço para a loja 1643' };
        if (s.stock === false || s.validOnStore === false) return { sumiu: 'loja marca o produto sem estoque/fora da loja' };
        const agora = Date.now();
        const vivo = (p) => (!p.startDate || Date.parse(p.startDate + (/[Z+-]\d*:?\d*$/.test(p.startDate) ? '' : '-03:00')) <= agora) && (!p.endDate || Date.parse(p.endDate + (/Z$|[+-]\d\d:\d\d$/.test(p.endDate) ? '' : '-03:00')) >= agora);
        const precos = [];
        const add = (valor, rotulo, extra = {}) => { if (Number(valor) > 0) precos.push({ valor: Number(valor), rotulo, peso: false, cartao: false, cooperado: false, ...extra }); };
        add(s.currentPrice, 'preço da loja');
        add(s.sellPrice, 'preço de venda');
        add(s.priceFrom, 'preço "de" (riscado)');
        add(s.pricePlus, 'Clube Extra');
        for (const p of s.productPromotions || []) {
          if (!vivo(p)) continue;
          // selo "FIC" = 10% pagando com o Cartão Extra (a página escreve "+10% de desconto pagando com o Cartão Extra"
          // e não aplica ao preço); a API nem sempre preenche paymentFormName nessa promoção
          const cartao = /cart/i.test(p.paymentFormName || '') || p.promotionSealColor === 'FIC';
          const qtd = p.promotionQuantityBuy > 1 ? `leve ${p.promotionQuantityBuy} pague ${p.promotionQuantityPayFor}` : p.promotionPercentOffOnUnity > 1 ? `${p.promotionPercentOff}% off na ${p.promotionPercentOffOnUnity}ª` : p.appExclusive ? 'exclusivo do app' : 'promoção';
          add(p.unitPrice, `${qtd} (preço de cada)`, { cartao });
        }
        // o preço por kg/L ("comparativePrice") é só referência, não entra
        return { precos, loja: `loja ${STORE}` };
      },
      loja: () => `loja ${STORE}`,
      fechar: async () => {},
    };
  },

  // Semar (oSuper): busca por nome na API da loja 06 Mauá (storeId 1705), de dentro da página do site.
  async Semar(ctxNav) {
    const SITE = 'https://www.semarentrega.com.br', STORE = '1705', SLUG = 'loja-06-maua';
    const API = `https://sense.osuper.com.br/336/${STORE}/v2/search`;
    const ctx = await ctxNav.browser.newContext({ locale: 'pt-BR', userAgent: UA_BASE(130), viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${SITE}/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const buscar = async (termo, from) => {
      const u = `${API}?brands=&tags=&sortField=_score&sortOrder=desc&size=20&categories=&from=${from}&search=${encodeURIComponent(termo)}`;
      const r = await page.evaluate(async (url) => { const x = await fetch(url); return { status: x.status, text: await x.text() }; }, u).catch((e) => ({ status: 0, text: e.message }));
      if ([403, 429].includes(r.status)) throw new Bloqueado(`HTTP ${r.status}`);
      if (r.status !== 200) return null;
      return JSON.parse(r.text);
    };
    return {
      metodo: 'API da loja (busca oSuper, loja 06 Mauá)',
      async ler(o) {
        const id = o.id.split(':')[1];
        const slugUrl = (o.productUrl || '').split('/').pop() || null;
        let h = null;
        for (const from of [0, 20]) {
          const j = await buscar(o.name, from);
          if (!j) return { inconclusivo: 'busca da API falhou' };
          h = (j.hits || []).find((x) => String(x.id) === id || (slugUrl && x.slug === slugUrl));
          if (h || !j.hasNext) break;
          await sleep(PAUSA_MS);
        }
        if (!h) return { inconclusivo: 'produto não apareceu na busca por nome (2 páginas); não dá para dizer se sumiu' };
        if (h.quantity?.inStock === 0) return { sumiu: 'loja marca o produto sem estoque' };
        const agora = Date.now();
        const vivo = (x) => x && x.active !== false && (!x.startDate || Date.parse(x.startDate) <= agora) && (!x.endDate || Date.parse(x.endDate) >= agora);
        const pr = h.pricing || {};
        const precos = [];
        const add = (valor, rotulo, extra = {}) => { if (Number(valor) > 0) precos.push({ valor: Number(valor), rotulo, peso: false, cartao: false, cooperado: false, ...extra }); };
        add(pr.price, 'preço de tabela');
        if (pr.promotion) add(pr.promotionalPrice, 'promoção da loja');
        for (const p of [].concat(h.personaPromotions || [])) if (vivo(p)) add(p.promotionPrice, `clube Semar (CPF)${Number(p.minQuantity) > 1 ? `, levando ${p.minQuantity}` : ''}`);
        for (const p of [].concat(h.paymentPromotions || [])) if (vivo(p)) add(p.promotionPrice ?? p.price, `pagando com ${p.paymentMethod || p.name || 'pix'}`, { cartao: /cart[aã]o/i.test(`${p.paymentMethod || ''} ${p.name || ''}`) });
        for (const p of [].concat(h.promotions || [])) if (vivo(p)) add(p.promotionPrice, `promoção${Number(p.minQuantity) > 1 ? ` levando ${p.minQuantity}` : ''}`);
        return { precos, loja: `loja ${STORE}` };
      },
      loja: () => `loja ${STORE} (06 Mauá)`,
      fechar: () => ctx.close(),
    };
  },
};

// ---------- comparação ----------
function avaliar(nosso, precos) {
  const livres = precos.filter((p) => !p.cartao);
  if (!livres.length) return { tipo: 'sem-preco', motivo: 'nenhum preço lido na loja' };
  const igual = livres.find((p) => iguais(p.valor, nosso) && !p.cooperado) || livres.find((p) => iguais(p.valor, nosso));
  const vale = (p) => COOPERADO_CONTA || !p.cooperado;
  if (!igual) {
    const base = livres.filter((p) => !p.peso && vale(p));
    const menor = Math.min(...(base.length ? base : livres).map((p) => p.valor));
    return { tipo: 'preco-diferente', menor, motivo: `a loja não mostra ${brl(nosso)}; o menor que ela mostra é ${brl(menor)}` };
  }
  const pool = livres.filter((p) => p.peso === igual.peso && vale(p));
  const mais = pool.reduce((a, p) => (p.valor < a.valor ? p : a), pool[0]);
  if (mais.valor < nosso - 0.005) {
    return {
      tipo: mais.cooperado ? 'cooperado' : 'menor-preco-nao-usado', menor: mais.valor,
      motivo: `a loja mostra ${brl(mais.valor)} (${mais.rotulo}) e o site publica ${brl(nosso)}`,
    };
  }
  return { tipo: 'bate' };
}

// ---------- principal ----------
const agoraIso = new Date().toISOString();
let indexJson;
try { indexJson = JSON.parse(fs.readFileSync(path.join(DADOS, 'index.json'), 'utf8')); } catch { console.error(`Sem ${DADOS}/index.json: rode node build-site.mjs antes.`); process.exit(1); }

const relatorio = { geradoEm: agoraIso, semente: SEMENTE, amostraPorMercado: AMOSTRA, cooperadoConta: COOPERADO_CONTA, mercados: {} };
let navegador = null;
const nav = async () => (navegador ??= await novoNavegador());

for (const nome of MERCADOS) {
  const rel = { metodo: null, noSite: false, produtosNoSite: 0, coletadoEm: null, loja: null, conferidos: 0, batem: 0, divergentes: 0, inconclusivos: 0, bloqueado: false, erro: null, divergencias: [], inconclusivosLista: [] };
  relatorio.mercados[nome] = rel;
  const meta = (indexJson.markets || []).find((m) => m.name === nome);
  let produtos = [];
  if (meta) { try { produtos = JSON.parse(fs.readFileSync(path.join(DADOS, meta.file), 'utf8')); } catch { /* sem arquivo */ } }
  if (!meta || !produtos.length) {
    rel.divergentes = 1;
    rel.divergencias.push({ tipo: 'mercado-fora-do-site', motivo: `${nome} não aparece nos dados publicados (app/public/data); a coleta falhou ou o mercado foi retirado` });
    continue;
  }
  rel.noSite = true; rel.produtosNoSite = produtos.length; rel.coletadoEm = meta.collectedAt;
  const extraOferta = ['Nagumo', 'Atacadão'].includes(nome) ? ofertaNoBruto(nome) : new Set();
  const amostra = sortear(produtos.filter((p) => p.productUrl || nome === 'Extra'), AMOSTRA, extraOferta);
  console.log(`\n== ${nome}: ${amostra.length} produtos sorteados de ${produtos.length} (${amostra.filter((o) => o.listPrice || o.condition || extraOferta.has(o.id)).length} em oferta)`);
  let leitor = null;
  try {
    leitor = await LEITORES[nome](SEM_NAVEGADOR.has(nome) ? undefined : await nav());
    rel.metodo = leitor.metodo;
    let bloqueios = 0;
    for (const o of amostra) {
      await sleep(PAUSA_MS);
      const ficha = { id: o.id, nome: o.name, url: o.productUrl, nossoPreco: o.price };
      let leitura;
      try {
        // página lenta (timeout) ou preço que demora a aparecer: uma segunda leitura antes de desistir
        const tentar = async () => { try { return await leitor.ler(o); } catch (e) { if (!/Timeout/i.test(e.message)) throw e; await sleep(3000); return leitor.ler(o); } };
        leitura = await tentar(); bloqueios = 0;
        if (leitura.precos && !leitura.precos.length) { await sleep(3000); leitura = await leitor.ler(o); }
      } catch (e) {
        if (e instanceof Bloqueado) {
          bloqueios++; rel.inconclusivosLista.push({ ...ficha, motivo: `bloqueado pela loja (${e.message})` });
          if (bloqueios >= 2) { rel.bloqueado = true; console.warn(`  ${nome}: bloqueado duas vezes seguidas; parando este mercado (sem contornar)`); break; }
          continue;
        }
        if (/loja errada/.test(e.message)) throw e;
        leitura = { inconclusivo: `erro na leitura: ${e.message.split('\n')[0].slice(0, 160)}` };
      }
      if (leitura.inconclusivo) { rel.inconclusivosLista.push({ ...ficha, motivo: leitura.inconclusivo }); console.log(`  ?   ${o.id} ${o.name.slice(0, 50)} | ${leitura.inconclusivo}`); continue; }
      rel.conferidos++;
      if (leitura.sumiu) {
        rel.divergentes++; rel.divergencias.push({ ...ficha, tipo: 'sumiu', precosNaLoja: [], motivo: leitura.sumiu });
        console.log(`  DIF ${o.id} ${o.name.slice(0, 50)} | sumiu: ${leitura.sumiu}`); continue;
      }
      const v = avaliar(o.price, leitura.precos);
      if (v.tipo === 'sem-preco') { rel.conferidos--; rel.inconclusivosLista.push({ ...ficha, motivo: v.motivo }); console.log(`  ?   ${o.id} ${o.name.slice(0, 50)} | ${v.motivo}`); continue; }
      const lista = [...new Map(leitura.precos.map((p) => [`${p.valor}|${p.rotulo}`, { valor: p.valor, rotulo: p.rotulo, ...(p.cartao ? { cartaoDaLoja: true } : {}), ...(p.cooperado ? { cooperado: true } : {}), ...(p.peso ? { porPeso: true } : {}) }])).values()];
      if (v.tipo === 'bate') { rel.batem++; console.log(`  OK  ${o.id} ${o.name.slice(0, 50)} | ${brl(o.price)}`); continue; }
      rel.divergentes++;
      rel.divergencias.push({ ...ficha, listPrice: o.listPrice ?? null, condicao: o.condition ?? null, tipo: v.tipo, precosNaLoja: lista, menorNaLoja: v.menor, diferencaPct: Math.round(((o.price - v.menor) / v.menor) * 1000) / 10, motivo: v.motivo });
      console.log(`  DIF ${o.id} ${o.name.slice(0, 50)} | ${v.motivo} [${v.tipo}]`);
    }
    rel.loja = leitor.loja();
  } catch (e) {
    rel.erro = e.message.split('\n')[0];
    console.error(`  ${nome}: não foi possível conferir: ${rel.erro}`);
  } finally {
    if (leitor) await leitor.fechar().catch(() => {});
  }
  rel.inconclusivos = rel.inconclusivosLista.length;
}
await navegador?.browser.close().catch(() => {});

// ---------- saída ----------
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(relatorio, null, 1));
const pad = (s, n) => String(s).padEnd(n);
console.log('\nMercado     Método                                    Conferidos  Batem  Divergem  Inconcl.  Dado de');
for (const [nome, r] of Object.entries(relatorio.mercados)) {
  console.log(`${pad(nome, 11)} ${pad(r.metodo || '-', 41)} ${pad(r.conferidos, 11)} ${pad(r.batem, 6)} ${pad(r.divergentes, 9)} ${pad(r.inconclusivos, 9)} ${r.coletadoEm ? r.coletadoEm.slice(0, 16).replace('T', ' ') : '-'}${r.bloqueado ? '  BLOQUEADO' : ''}${r.erro ? '  ERRO' : ''}`);
}
for (const [nome, r] of Object.entries(relatorio.mercados)) {
  if (r.erro) console.log(`::warning::Conferência de preços, ${nome}: não foi possível conferir (${r.erro})`);
  if (r.bloqueado) console.log(`::warning::Conferência de preços, ${nome}: a loja bloqueou a leitura; conferido só o que deu antes do bloqueio`);
  if (!r.noSite) { console.log(`::warning::Conferência de preços, ${nome}: ATENÇÃO, ${r.divergencias[0].motivo}`); continue; }
  if (r.divergentes) {
    const pct = r.conferidos ? Math.round((r.divergentes / r.conferidos) * 100) : 100;
    const grave = pct > 10 ? `ATENÇÃO, mais de 10% divergem (${pct}%): ` : '';
    const tipos = Object.entries(r.divergencias.reduce((a, d) => ((a[d.tipo] = (a[d.tipo] || 0) + 1), a), {})).map(([t, n]) => `${n} ${t}`).join(', ');
    const ex = r.divergencias[0];
    const horas = r.coletadoEm ? Math.round((Date.now() - Date.parse(r.coletadoEm)) / 36e5) : null;
    console.log(`::warning::Conferência de preços, ${nome}: ${grave}${r.divergentes} de ${r.conferidos} não batem com a loja (${tipos}); dado coletado há ${horas ?? '?'} h. Ex.: ${ex.nome ?? ''} ${ex.motivo}`);
  }
}
console.log(`\nRelatório: ${path.relative(process.cwd(), SAIDA)} (semente ${SEMENTE})`);
