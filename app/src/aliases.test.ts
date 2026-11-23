// node --test src/aliases.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateCart, migrateFavs, precisaMigrar, resolve } from './aliases.ts';

test('resolve segue a tabela até o id final e não entra em ciclo', () => {
  assert.equal(resolve('a', { a: 'b', b: 'c' }), 'c');
  assert.equal(resolve('x', { a: 'b' }), 'x');
  assert.equal(resolve('a', { a: 'b', b: 'a' }).length, 1); // ciclo: para sozinho
});

test('favoritos: troca o id e tira repetidos', () => {
  assert.deepEqual(migrateFavs(['a', 'b', 'z'], { a: 'b' }), ['b', 'z']);
});

test('lista: troca o id; mesmo produto no mesmo mercado soma a quantidade, em mercado diferente não', () => {
  const r = migrateCart([{ g: 'a', qty: 2 }, { g: 'b', qty: 3 }, { g: 'a', qty: 1, m: 'Semar' }, { g: 'k', qty: 98 }, { g: 'k', qty: 5 }], { a: 'b' });
  assert.deepEqual(r, [{ g: 'b', qty: 5 }, { g: 'b', qty: 1, m: 'Semar' }, { g: 'k', qty: 99 }]);
});

test('precisaMigrar só avisa quando há id na tabela', () => {
  assert.equal(precisaMigrar(['a'], { a: 'b' }), true);
  assert.equal(precisaMigrar(['z'], { a: 'b' }), false);
  assert.equal(precisaMigrar([], {}), false);
});
