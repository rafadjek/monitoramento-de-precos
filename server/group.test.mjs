import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOffers, parseSize } from './group.mjs';

const o = (market, name, size = null) => ({ market, name, size });
const grouped = (a, b) => groupOffers([a, b]).length === 1;

test('mesmo produto com palavras em outra ordem e embalagem neutra agrupa', () => {
  assert.ok(grouped(o('A', 'Feijão Carioca Camil Tipo 1 1kg'), o('B', 'Feijão Carioca Tipo 1 Camil 1kg')));
  assert.ok(grouped(o('A', 'Coco Ralado Menina 100g'), o('B', 'Coco Ralado Menina 100g Tradicional')));
  assert.ok(grouped(o('A', 'Refrigerante Coca-Cola 350ml'), o('B', 'Refrigerante Coca Cola 350 ml')));
});

test('tamanhos diferentes nunca agrupam', () => {
  assert.ok(!grouped(o('A', 'Arroz Tio João Tipo 1 5kg'), o('B', 'Arroz Tio João Tipo 1 1kg')));
  assert.ok(!grouped(o('A', 'Leite Integral 1L'), o('B', 'Leite Integral 500ml')));
});

test('tipos ou sabores diferentes nunca agrupam', () => {
  assert.ok(!grouped(o('A', 'Arroz Tio João Tipo 1 5kg'), o('B', 'Arroz Tio João Tipo 2 5kg')));
  assert.ok(!grouped(o('A', 'Arroz Integral Camil 1kg'), o('B', 'Arroz Camil 1kg')));
  assert.ok(!grouped(o('A', 'Biscoito Marilan Coco 300g'), o('B', 'Biscoito Marilan Chocolate 300g')));
});

test('embalagens diferentes (lata x pet) não agrupam', () => {
  assert.ok(!grouped(o('A', 'Óleo Composto Faisão Lata 500ml'), o('B', 'Óleo Composto Faisão Pet 500ml')));
});

test('mesmo mercado sozinho não forma grupo', () => {
  assert.equal(groupOffers([o('A', 'Fubá Mimoso 1kg'), o('A', 'Fubá Mimoso 1kg')]).length, 0);
});

test('conversão de tamanho', () => {
  assert.equal(parseSize('1,5L').key, 'ml:1500');
  assert.equal(parseSize('', 'Arroz 5 kg').key, 'g:5000');
  assert.equal(parseSize('4x90g').key, 'g:360');
});
