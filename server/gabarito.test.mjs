import test from 'node:test';
import assert from 'node:assert/strict';
import { dobra, gabaritoEan, gabaritoSemEan, medir } from './tools/gabarito.mjs';
import { offerKey } from './group.mjs';

const o = (market, name, price, ean) => ({ market, name, price, ean, category: 'mercearia' });
const ctx = (offers, ...sigSize) => ({
  offers,
  sigs: offers.map((x, i) => ({ size: sigSize[i] ?? 'g:500', core: new Set(x.name.toLowerCase().split(' ')) })),
  brands: offers.map(() => 'dona'),
  eans: offers.map((x) => x.ean),
});

test('a divisão treino/teste é por marca e sempre a mesma', () => {
  assert.equal(dobra('nestle'), dobra('nestle'));
  const todas = ['nestle', 'omo', 'ypê', 'vigor', 'aurora', 'tang', 'kibon', 'seara', 'qualy', 'pilao'].map(dobra);
  assert.ok(todas.includes('teste') || todas.includes('treino'));
});

test('mesmo EAN é positivo; EAN diferente com nome igual e preço parecido é descartado (provável mesmo produto)', () => {
  const offers = [o('A', 'macarrao dona benta', 3.5, '7891234567895'), o('B', 'macarrao dona benta', 3.6, '7891234567895'), o('C', 'macarrao dona benta', 3.5, '7899999999994'), o('D', 'macarrao dona benta ovos', 3.5, '7898888888883')];
  const pares = gabaritoEan(ctx(offers));
  const achou = (a, b) => pares.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  assert.equal(achou(0, 1)?.mesmo, true);
  assert.equal(achou(0, 2), undefined); // nome igual, EAN diferente, preço igual: fora do gabarito
  assert.equal(achou(0, 3)?.mesmo, false); // nome diferente e EAN diferente: negativo de verdade
});

test('mesmo mercado não forma par', () => {
  const offers = [o('A', 'arroz tio joao', 5, '7891111111116'), o('A', 'arroz tio joao tipo 1', 5, '7892222222225')];
  assert.equal(gabaritoEan(ctx(offers)).length, 0);
});

test('medir conta acertos, erros e omissões', () => {
  const pares = [{ mesmo: true, k: 1 }, { mesmo: true, k: 2 }, { mesmo: false, k: 3 }, { mesmo: false, k: 4 }];
  const m = medir(pares, (p) => p.k === 1 || p.k === 3);
  assert.deepEqual([m.tp, m.fp, m.fn, m.tn, m.precisao, m.cobertura], [1, 1, 1, 1, 0.5, 0.5]);
});

test('gabarito sem EAN: rótulo do Rafael vale mais que o veredito de IA e "regra" fica de fora', () => {
  const offers = [o('Nagumo', 'Café Pilão 500g', 20), o('Semar', 'Cafe Pilao 500g', 21), o('Extra', 'Café Melitta 500g', 22)];
  const [a, b, c] = offers.map(offerKey);
  const rot = [{ label: 'mesmo', a: offers[0], b: offers[1] }];
  const ver = { [[a, b].sort().join(' <> ')]: { same: false, model: 'gemini' }, [[a, c].sort().join(' <> ')]: { same: false, model: 'regra' }, [[b, c].sort().join(' <> ')]: { same: false, model: 'gemini' } };
  const pares = gabaritoSemEan(offers, rot, ver);
  assert.equal(pares.length, 2);
  assert.equal(pares.find((p) => p.fonte === 'rafael').mesmo, true);
  assert.equal(pares.find((p) => p.fonte === 'ia').mesmo, false);
});
