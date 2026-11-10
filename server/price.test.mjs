import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPrice } from './price.mjs';

test('app com CPF e quantidade viram o preço, com o normal riscado', () => {
  assert.deepEqual(bestPrice(4.69, 'R$ 4,49 no app Meu Assaí'), { price: 4.49, listPrice: 4.69, condition: 'no app meu assaí' });
  assert.deepEqual(bestPrice(24.9, 'R$ 23,90 a partir de 2 un.'), { price: 23.9, listPrice: 24.9, condition: 'a partir de 2 un.' });
  assert.deepEqual(bestPrice(9.9, 'R$ 8,90 NO PIX'), { price: 8.9, listPrice: 9.9, condition: 'no pix' });
  assert.equal(bestPrice(5.2, 'R$ 4,59\u00a0cada levando 6 ou mais').price, 4.59);
});

test('cartão da loja nunca vira o preço', () => {
  const r = bestPrice(10.9, 'R$ 9,90 no Cartão Passaí');
  assert.equal(r.price, 10.9);
  assert.equal(r.listPrice, null);
  assert.match(r.condition, /só com o cartão/);
});

test('preço do quilo e condição sem valor não mudam o preço', () => {
  assert.equal(bestPrice(69.9, 'R$ 13,98 O QUILO').price, 69.9);
  assert.equal(bestPrice(19.9, 'leve 16 e pague 15').price, 19.9);
  assert.equal(bestPrice(13.9, 'preço por kg').condition, 'preço por kg');
  assert.deepEqual(bestPrice(3.5, null), { price: 3.5, listPrice: null, condition: null });
});
