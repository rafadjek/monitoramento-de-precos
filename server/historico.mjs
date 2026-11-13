// Histórico de preço: guarda, para cada oferta (mercado + id no mercado), o preço de cada dia.
// Só grava quando o preço muda, então o arquivo cresce devagar. Fica em data/historico/precos.json.
//   node historico.mjs             -> acrescenta o dia de hoje a partir de data/extraido
//   node historico.mjs --desde-git -> refaz o passado a partir dos commits diários de data/extraido
// O site lê pedaços deste arquivo (build-site.mjs divide em data/hist/NN.json) e o "Baixou hoje" compara com ontem.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bestPrice } from './price.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(ROOT, 'data/extraido');
export const FILE = path.join(ROOT, 'data/historico/precos.json');
const KEEP_DAYS = 120;

// dia = número de dias desde 01/01/2026, no horário de Brasília
const DAY0 = Date.UTC(2026, 0, 1);
export const dayOf = (t) => Math.floor((new Date(t).getTime() - 3 * 3600e3 - DAY0) / 86400e3);
export const dateOf = (d) => new Date(DAY0 + d * 86400e3).toISOString().slice(0, 10);

// mesmas regras do build-site.mjs: oferta válida, id e preço mostrado no site
const valid = (o) => o && o.market && o.externalId != null && o.name && typeof o.price === 'number' && o.price >= 0.1 && o.price < 20000 && o.collectedAt;
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');
export const offerId = (o) => `${slug(o.market)}:${o.externalId}`;
const isData = (f) => f.endsWith('.json') && !f.includes('encartes') && !/meta|verificacao|leitura|juiz|status|-ean/.test(f);

// preços de um dia: id -> preço (oferta vencida não conta)
export function pricesOf(arrays, at) {
  const out = new Map();
  for (const rows of arrays) {
    if (!Array.isArray(rows)) continue;
    for (const o of rows) {
      if (!valid(o) || (o.validUntil && new Date(o.validUntil).getTime() < at)) continue;
      const p = Math.round(bestPrice(o.price, o.condition).price * 100) / 100;
      const id = offerId(o);
      if (!out.has(id) || p < out.get(id)) out.set(id, p);
    }
  }
  return out;
}

// h = { ids: { id: [[dia, preço], ...] } }: acrescenta um dia (só se o preço mudou)
export function addDay(h, day, prices) {
  for (const [id, p] of prices) {
    const s = (h.ids[id] ??= []);
    const last = s[s.length - 1];
    if (last && last[0] > day) continue; // dia mais antigo que o último gravado: ignora
    if (last && last[0] === day) { last[1] = Math.min(last[1], p); continue; }
    if (!last || last[1] !== p) s.push([day, p]);
  }
  h.last = Math.max(h.last ?? 0, day);
}

// tira o que passou de KEEP_DAYS, mas guarda o último ponto antes da janela (é o preço que valia no começo dela)
export function prune(h, today) {
  const from = today - KEEP_DAYS;
  for (const [id, s] of Object.entries(h.ids)) {
    let i = 0;
    while (i + 1 < s.length && s[i + 1][0] <= from) i++;
    if (i) s.splice(0, i);
    if (s.length === 1 && s[0][0] < from) delete h.ids[id]; // sumiu do mercado há muito tempo
  }
}

// preço que valia num dia (último ponto até aquele dia)
export function priceAt(s, day) {
  let p = null;
  for (const [d, v] of s) { if (d > day) break; p = v; }
  return p;
}

export const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { v: 1, last: 0, ids: {} }; } };
const save = (h) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(h)); };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--desde-git')) {
    // último commit de cada dia que mexeu em data/extraido
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 30 }).toString();
    const perDay = new Map();
    for (const line of git('log', '--format=%H %cI', '--', 'data/extraido').trim().split('\n').reverse()) {
      const [sha, when] = line.split(' ');
      perDay.set(dayOf(when), { sha, when });
    }
    const h = { v: 1, last: 0, ids: {} };
    for (const [day, { sha, when }] of [...perDay].sort((a, b) => a[0] - b[0])) {
      const files = git('ls-tree', '--name-only', sha, 'data/extraido/').trim().split('\n').filter((f) => isData(path.basename(f)));
      const arrays = files.map((f) => { try { return JSON.parse(git('show', `${sha}:server/${f}`)); } catch { return null; } });
      const prices = pricesOf(arrays, new Date(when).getTime());
      addDay(h, day, prices);
      console.log(dateOf(day), sha.slice(0, 7), prices.size, 'ofertas');
    }
    prune(h, h.last);
    save(h);
  } else {
    const h = load();
    const arrays = fs.readdirSync(IN).filter(isData).map((f) => JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8')));
    const today = dayOf(Date.now());
    const prices = pricesOf(arrays, Date.now());
    addDay(h, today, prices);
    prune(h, today);
    save(h);
    console.log(`histórico: ${dateOf(today)}, ${prices.size} ofertas, ${Object.keys(h.ids).length} no arquivo`);
  }
  console.log('tamanho:', Math.round(fs.statSync(FILE).size / 1024), 'KB');
}
