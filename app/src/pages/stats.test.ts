// node --test src/pages/stats.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStats } from './stats.ts';

test('lê mercados com dados, produtos, grupos e data', () => {
  const s = parseStats({ generatedAt: '2026-11-14T22:12:23Z', groups: 4374, markets: [{ products: 100 }, { products: 0 }, { products: 50 }] });
  assert.deepEqual(s && { m: s.markets, p: s.products, g: s.groups }, { m: 2, p: 150, g: 4374 });
  assert.match(s!.updated, /\d{2}\/\d{2}\/\d{4}/);
});
test('dado ruim devolve null (sem chute)', () => {
  assert.equal(parseStats(null), null);
  assert.equal(parseStats({ markets: [], groups: 1, generatedAt: '2026-01-01' }), null);
  assert.equal(parseStats({ markets: [{ products: 3 }], generatedAt: 'x', groups: 1 }), null);
  assert.equal(parseStats({ markets: [{ products: 3 }], generatedAt: '2026-01-01' }), null);
});
