// Teste do histórico de preço: node --test src/history.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTrend, shardOf } from './history.ts';
import type { Group, Indexed } from './lib';

const it = (id: string, market: string, price: number) => ({ id, market, price, name: 'x', _n: 'x' }) as unknown as Indexed;
const group = (items: Indexed[]) => ({ id: 'g', items, odd: [], perUnit: false }) as unknown as Group;

test('menor preço por dia entre os mercados, com queda na semana', () => {
  const g = group([it('a:1', 'A', 8), it('b:1', 'B', 9)]);
  const series = { 'a:1': [[300, 10], [310, 8]] as [number, number][], 'b:1': [[300, 9.5], [305, 9]] as [number, number][] };
  const t = groupTrend(g, series, 312);
  assert.equal(t.points[0].price, 9.5); // dia 300: B 9,50 < A 10
  assert.equal(t.points.find((p) => p.day === 305)!.price, 9);
  assert.equal(t.points.at(-1)!.price, 8);
  assert.equal(t.points.at(-1)!.market, 'A');
  assert.ok(t.isLow);
  assert.equal(Math.round(t.change7! * 100), -11); // dia 305: 9 -> hoje 8
});

test('preço que não mudou: sem variação', () => {
  const g = group([it('a:1', 'A', 5)]);
  const t = groupTrend(g, {}, 312);
  assert.equal(t.changed, false);
  assert.equal(t.change7, null);
});

test('pedaço do arquivo igual ao do servidor (FNV-1a)', () => {
  assert.equal(shardOf('atacadao:301', 64), shardOf('atacadao:301', 64));
  assert.ok(shardOf('spani:3923', 64) < 64);
});
