// Teste da conta do Carrinho Inteligente: node --test src/cart.test.ts (Node 22.18+ lê TypeScript direto)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPair, decodeCart, encodeCart, rankMarkets } from './cart.ts';

const it = (market: string, price: number, extra: object = {}) => ({ id: market + price, market, price, _n: '', name: '', brand: null, size: null, listPrice: null, category: 'mercearia', imageUrl: null, productUrl: null, validUntil: null, ...extra });
const grp = (id: string, items: any[], extra: object = {}) => [id, { id, name: id, size: null, image: null, category: 'mercearia', items, saving: 0, savingPct: 0, perUnit: false, odd: [], suspect: false, shown: items[0].price, _n: '', ...extra }] as const;

// Resultado calculado à mão:
// arroz: A 20, B 25, C 22 | café: A 30, B 24, C 26 | leite: A 5, B 4 (C não tem)
// lista: 1 arroz, 2 cafés, 6 leites
// A = 20 + 60 + 30 = 110 | B = 25 + 48 + 24 = 97 | C = 22 + 52 = 74 (falta leite)
// dupla A+B: arroz A 20 + café B 48 + leite B 24 = 92 (a melhor); B+C: 22 + 48 + 24 = 94; A+C: 20 + 52 + 30 = 102
const groups = new Map<string, any>([
  grp('arroz', [it('A', 20), it('C', 22), it('B', 25)]),
  grp('cafe', [it('B', 24), it('C', 26), it('A', 30)]),
  grp('leite', [it('B', 4), it('A', 5)]),
]);
const cart = [{ g: 'arroz', qty: 1 }, { g: 'cafe', qty: 2 }, { g: 'leite', qty: 6 }];

test('ranking: quem tem a lista inteira primeiro, pelo total', () => {
  const r = rankMarkets(groups, cart, ['A', 'B', 'C']);
  assert.deepEqual(r.map((x) => [x.market, x.total, x.have]), [['B', 97, 3], ['A', 110, 3], ['C', 74, 2]]);
  assert.deepEqual(r[2].missing, ['leite']);
});

test('melhor dupla cobre a lista e é mais barata que o melhor mercado sozinho', () => {
  const p = bestPair(groups, cart, ['A', 'B', 'C'])!;
  assert.deepEqual([p.a, p.b, p.total], ['A', 'B', 92]);
  assert.deepEqual(p.picks.map((x) => x.market), ['A', 'B', 'B']);
});

test('preço fora do padrão não entra na conta', () => {
  const g2 = new Map(groups);
  g2.set('arroz', grp('arroz', [it('A', 20), it('C', 22), it('B', 250)], { odd: ['B250'] })[1]);
  const r = rankMarkets(g2, [{ g: 'arroz', qty: 1 }], ['A', 'B', 'C']);
  assert.deepEqual(r.map((x) => x.market), ['A', 'C']);
});

test('link da lista ida e volta', () => {
  const c = [{ g: 'p:atacadao:123', qty: 2 }, { g: 'abc', qty: 1 }];
  assert.deepEqual(decodeCart(encodeCart(c)), c);
  assert.deepEqual(decodeCart('x*500'), [{ g: 'x', qty: 99 }]);
});

test('plano usa a divisão em 2 quando sai mais barata, e o texto agrupa por mercado', async () => {
  const { buildPlan, shareText } = await import('./cart.ts');
  const p = buildPlan(groups, cart, ['A', 'B', 'C'])!;
  assert.equal(p.split, true);
  assert.equal(p.total, 92);
  const t = shareText(p, (g) => g, new Date(2026, 10, 10));
  assert.match(t, /\*A\*\n• arroz — R\$ 20,00\nSubtotal: R\$ 20,00/);
  assert.match(t, /\*B\*\n• 2x cafe — R\$ 48,00\n• 6x leite — R\$ 24,00\nSubtotal: R\$ 72,00/);
  assert.match(t, /Total: R\$ 92,00/);
});
