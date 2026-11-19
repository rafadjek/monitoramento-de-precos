// Teste das regras de farmácia: node --test src/pharma.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBySegment, isRx, semReceita, splitLoad } from './pharma.ts';

test('remédio de receita fica fora dos destaques; genérico sem receita continua', () => {
  const itens = [{ id: 'a', rx: 1 }, { id: 'b', generic: 1 }, { id: 'c' }, { id: 'd', rx: 0 }];
  assert.deepEqual(semReceita(itens).map((i) => i.id), ['b', 'c', 'd']);
  assert.equal(isRx(itens[0]), true);
  assert.equal(isRx(itens[1]), false);
});

test('farmácia carrega depois dos demais mercados', () => {
  const ms = [{ name: 'Spani' }, { name: 'Drogaria São Paulo', segment: 'farmacia' as const }, { name: 'Tony BRJ Carnes', segment: 'bairro' as const }, { name: 'Farma Conde', segment: 'farmacia' as const }];
  const { first, later } = splitLoad(ms);
  assert.deepEqual(first.map((m) => m.name), ['Spani', 'Tony BRJ Carnes']);
  assert.deepEqual(later.map((m) => m.name), ['Drogaria São Paulo', 'Farma Conde']);
});

test('agrupa por segmento e esconde grupo vazio', () => {
  const ms = [{ name: 'Spani' }, { name: 'DSP', segment: 'farmacia' as const }, { name: 'Tony', segment: 'bairro' as const }];
  assert.deepEqual(groupBySegment(['DSP', 'Spani', 'Tony'], ms).map((g) => [g.title, g.names]), [['Supermercados', ['Spani']], ['Farmácias', ['DSP']], ['Comércio de bairro', ['Tony']]]);
  assert.deepEqual(groupBySegment(['Spani'], ms).map((g) => g.id), ['mercado']);
});
