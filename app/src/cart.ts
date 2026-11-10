// Carrinho Inteligente: conta da lista em cada mercado, ranking e a melhor divisão em 2 mercados.
// Sem dependências de runtime (só tipos), para rodar também nos testes com `node --test`.
import type { Group, Indexed } from './lib';

export type CartItem = { g: string; qty: number };
export type MarketTotal = { market: string; total: number; have: number; missing: string[]; warn: number };
export type Pair = { a: string; b: string; total: number; picks: { g: string; market: string; cost: number }[] };

const unit = (o: Pick<Indexed, 'price' | '_u'>) => o.price / (o._u ?? 1);
const soon = (o: Pick<Indexed, 'validUntil'>) => !!o.validUntil && Date.parse(o.validUntil) - Date.now() < 36 * 3600 * 1000;
const byQty = (o: Pick<Indexed, 'condition'>) => !!o.condition && /levando|a partir|leve \d/i.test(o.condition);

// Preço de 1 item da lista num mercado (o mesmo que aparece na tabela). Preço fora do padrão não entra:
// num grupo suspeito (2 mercados, preços muito distantes), o mais caro também fica de fora.
export function priceIn(g: Group, market: string): { cost: number; warn: boolean } | null {
  const it = g.items.find((i) => i.market === market);
  if (!it || g.odd.includes(it.id)) return null;
  if (g.suspect && it === g.items[g.items.length - 1]) return null;
  return { cost: g.perUnit ? unit(it) : it.price, warn: byQty(it) || soon(it) };
}

export function rankMarkets(groups: Map<string, Group>, cart: CartItem[], markets: string[]): MarketTotal[] {
  const rows = markets.map((market) => {
    let total = 0, have = 0, warn = 0;
    const missing: string[] = [];
    for (const c of cart) {
      const g = groups.get(c.g);
      const p = g && priceIn(g, market);
      if (!p) { missing.push(c.g); continue; }
      total += p.cost * c.qty;
      have++;
      if (p.warn) warn++;
    }
    return { market, total: Math.round(total * 100) / 100, have, missing, warn };
  });
  // quem tem a lista inteira vem primeiro, pelo total; depois quem tem mais itens
  return rows.filter((r) => r.have > 0).sort((x, y) => {
    const fx = x.missing.length === 0 ? 0 : 1, fy = y.missing.length === 0 ? 0 : 1;
    return fx - fy || (fx ? y.have - x.have : 0) || x.total - y.total;
  });
}

// Melhor dupla de mercados: cada item no mais barato dos dois; só vale se a dupla cobre a lista inteira.
export function bestPair(groups: Map<string, Group>, cart: CartItem[], markets: string[]): Pair | null {
  let best: Pair | null = null;
  for (let i = 0; i < markets.length; i++) for (let j = i + 1; j < markets.length; j++) {
    const a = markets[i], b = markets[j];
    let total = 0, ok = true;
    const picks: Pair['picks'] = [];
    for (const c of cart) {
      const g = groups.get(c.g);
      const pa = g && priceIn(g, a), pb = g && priceIn(g, b);
      if (!pa && !pb) { ok = false; break; }
      const useA = pa && (!pb || pa.cost <= pb.cost);
      const cost = (useA ? pa!.cost : pb!.cost) * c.qty;
      total += cost;
      picks.push({ g: c.g, market: useA ? a : b, cost });
    }
    if (!ok) continue;
    // dupla em que um mercado não leva nada é, na verdade, um mercado só
    if (!picks.some((p) => p.market === a) || !picks.some((p) => p.market === b)) continue;
    total = Math.round(total * 100) / 100;
    if (!best || total < best.total) best = { a, b, total, picks };
  }
  return best;
}

// Link da lista: ?lista=<id>*<qtd>~<id>*<qtd>
export const encodeCart = (cart: CartItem[]) => cart.map((c) => `${encodeURIComponent(c.g)}*${c.qty}`).join('~');
export function decodeCart(s: string | null): CartItem[] {
  if (!s) return [];
  return s.split('~').map((p) => {
    const [g, q] = p.split('*');
    return { g: decodeURIComponent(g), qty: Math.max(1, Math.min(99, parseInt(q) || 1)) };
  }).filter((c) => c.g);
}
