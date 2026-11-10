// Carrinho Inteligente: conta da lista em cada mercado, ranking e a melhor divisão em 2 mercados.
// Sem dependências de runtime (só tipos), para rodar também nos testes com `node --test`.
import type { Group, Indexed } from './lib';

// m: mercado escolhido pela pessoa para aquele item ("quero esse do Atacadão"). Item com m fica fixo
// nesse mercado em todas as contas; os outros itens o carrinho põe onde sair mais barato.
export type CartItem = { g: string; qty: number; m?: string };
// Chave de cada linha da lista: o mesmo produto pode entrar 2 vezes, uma em cada mercado escolhido.
export const keyOf = (c: Pick<CartItem, 'g' | 'm'>) => c.g + '@' + (c.m ?? '');
export type MarketTotal = { market: string; total: number; have: number; missing: string[]; warn: number };
export type Pair = { a: string; b: string; total: number; picks: { key: string; g: string; market: string; cost: number }[] };

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

// Preço do item fixo no mercado escolhido. O fora do padrão também vale aqui, porque a pessoa escolheu.
function pinnedPrice(g: Group, market: string): { cost: number; warn: boolean } | null {
  const it = g.items.find((i) => i.market === market);
  return it ? { cost: g.perUnit ? unit(it) : it.price, warn: byQty(it) || soon(it) } : null;
}

export function rankMarkets(groups: Map<string, Group>, cart: CartItem[], markets: string[]): MarketTotal[] {
  const rows = markets.map((market) => {
    let total = 0, have = 0, warn = 0;
    const missing: string[] = [];
    for (const c of cart) {
      const g = groups.get(c.g);
      const p = g && (c.m ? pinnedPrice(g, c.m) : priceIn(g, market));
      if (!p) { missing.push(keyOf(c)); continue; }
      total += p.cost * c.qty;
      if (!c.m) have++;
      if (p.warn) warn++;
    }
    return { market, total: Math.round(total * 100) / 100, have, missing, warn };
  });
  // quem tem a lista inteira vem primeiro, pelo total; depois quem tem mais itens
  return rows.filter((r) => r.have > 0 || cart.every((c) => c.m)).sort((x, y) => {
    const fx = x.missing.length === 0 ? 0 : 1, fy = y.missing.length === 0 ? 0 : 1;
    return fx - fy || (fx ? y.have - x.have : 0) || x.total - y.total;
  });
}

// Melhor dupla de mercados: cada item livre no mais barato dos dois; item fixo fica no mercado escolhido.
export function bestPair(groups: Map<string, Group>, cart: CartItem[], markets: string[]): Pair | null {
  const free = cart.filter((c) => !c.m);
  if (free.length < 2) return null;
  let best: Pair | null = null;
  for (let i = 0; i < markets.length; i++) for (let j = i + 1; j < markets.length; j++) {
    const a = markets[i], b = markets[j];
    let total = 0, ok = true;
    const picks: Pair['picks'] = [];
    for (const c of cart) {
      const g = groups.get(c.g);
      if (c.m) {
        const p = g && pinnedPrice(g, c.m);
        if (!p) { ok = false; break; }
        total += p.cost * c.qty;
        picks.push({ key: keyOf(c), g: c.g, market: c.m, cost: p.cost * c.qty });
        continue;
      }
      const pa = g && priceIn(g, a), pb = g && priceIn(g, b);
      if (!pa && !pb) { ok = false; break; }
      const useA = pa && (!pb || pa.cost <= pb.cost);
      const cost = (useA ? pa!.cost : pb!.cost) * c.qty;
      total += cost;
      picks.push({ key: keyOf(c), g: c.g, market: useA ? a : b, cost });
    }
    if (!ok) continue;
    // dupla em que um mercado não leva nenhum item livre é, na verdade, um mercado só
    const freePicks = picks.filter((p) => p.key.endsWith('@')); // item livre: chave sem mercado
    if (!freePicks.some((p) => p.market === a) || !freePicks.some((p) => p.market === b)) continue;
    total = Math.round(total * 100) / 100;
    if (!best || total < best.total) best = { a, b, total, picks };
  }
  return best;
}

// Link da lista: ?lista=<id>*<qtd>[*<mercado>]~...
export const encodeCart = (cart: CartItem[]) => cart.map((c) => `${encodeURIComponent(c.g)}*${c.qty}${c.m ? '*' + encodeURIComponent(c.m) : ''}`).join('~');
export function decodeCart(s: string | null): CartItem[] {
  if (!s) return [];
  return s.split('~').map((p) => {
    const [g, q, m] = p.split('*');
    const item: CartItem = { g: decodeURIComponent(g), qty: Math.max(1, Math.min(99, parseInt(q) || 1)) };
    if (m) item.m = decodeURIComponent(m);
    return item;
  }).filter((c) => c.g);
}

// Plano de compra: onde comprar cada item. Usa a divisão em 2 mercados se ela sair mais barata
// que o melhor mercado sozinho (ou se nenhum mercado tiver a lista inteira). Item fixo fica onde foi escolhido.
export type PlanLine = { key: string; g: string; qty: number; market: string; unit: number; total: number; pinned: boolean };
export function buildPlan(groups: Map<string, Group>, cart: CartItem[], markets: string[]): { lines: PlanLine[]; total: number; split: boolean } | null {
  const rank = rankMarkets(groups, cart, markets);
  const single = rank.find((r) => r.missing.length === 0);
  const pair = bestPair(groups, cart, markets);
  const usePair = pair && (!single || pair.total < single.total - 0.009);
  if (!usePair && !single) return null;
  const lines: PlanLine[] = cart.map((c) => {
    const market = c.m ?? (usePair ? pair!.picks.find((p) => p.key === keyOf(c))!.market : single!.market);
    const g = groups.get(c.g)!;
    const unitCost = (c.m ? pinnedPrice(g, market) : priceIn(g, market))!.cost;
    return { key: keyOf(c), g: c.g, qty: c.qty, market, unit: unitCost, total: Math.round(unitCost * c.qty * 100) / 100, pinned: !!c.m };
  });
  return { lines, total: Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100, split: !!usePair };
}

// Texto da lista para mandar no WhatsApp: itens agrupados por mercado, com preço e total.
const money = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
export function shareText(plan: { lines: PlanLine[]; total: number }, nameOf: (g: string) => string, date = new Date()): string {
  const byMarket = new Map<string, PlanLine[]>();
  for (const l of plan.lines) (byMarket.get(l.market) ?? byMarket.set(l.market, []).get(l.market)!).push(l);
  const out = ['🛒 *Minha lista – Bate Ofertas*', ''];
  for (const [m, ls] of byMarket) {
    out.push(`🏪 *${m}*`);
    for (const l of ls) out.push(`• ${l.qty > 1 ? l.qty + 'x ' : ''}${nameOf(l.g)} — ${money(l.total)}`);
    out.push(`Subtotal: ${money(ls.reduce((s, l) => s + l.total, 0))}`, '');
  }
  out.push(`💰 *Total: ${money(plan.total)}*`);
  out.push(`_Preços de ${date.toLocaleDateString('pt-BR')}; confira na loja._`);
  return out.join('\n');
}
