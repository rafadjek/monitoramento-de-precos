// Teste da escolha de cidades: node --test src/cities.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cityLabel, citiesText, effectiveCities, marketInCities, migrateCities, toggleCity } from './cities.ts';

const av = ['Mauá', 'Ribeirão Pires', 'São Bernardo do Campo'];

test('migra a cidade antiga e prefere a lista nova', () => {
  assert.deepEqual(migrateCities(null, '"Mauá"'), ['Mauá']);
  assert.deepEqual(migrateCities(null, '""'), []);
  assert.deepEqual(migrateCities(null, null), []);
  assert.deepEqual(migrateCities('["Ribeirão Pires"]', '"Mauá"'), ['Ribeirão Pires']);
  assert.deepEqual(migrateCities('[]', '"Mauá"'), []);
  assert.deepEqual(migrateCities('lixo{', '"Mauá"'), ['Mauá']);
});

test('seleção válida: ignora cidade inexistente e todas marcadas viram vazio', () => {
  assert.deepEqual(effectiveCities(['Mauá', 'Santo André'], av), ['Mauá']);
  assert.deepEqual(effectiveCities(['Santo André'], av), []);
  assert.deepEqual(effectiveCities(av, av), []);
  assert.deepEqual(effectiveCities(['Mauá'], []), []);
});

test('marcar e desmarcar', () => {
  assert.deepEqual(toggleCity([], 'Mauá', av), ['Mauá']);
  assert.deepEqual(toggleCity(['Mauá'], 'Ribeirão Pires', av), ['Mauá', 'Ribeirão Pires']);
  assert.deepEqual(toggleCity(['Mauá', 'Ribeirão Pires'], 'Mauá', av), ['Ribeirão Pires']);
  assert.deepEqual(toggleCity(['Mauá'], 'Mauá', av), []);
  assert.deepEqual(toggleCity(['Mauá', 'Ribeirão Pires'], 'São Bernardo do Campo', av), []);
});

test('filtro de mercado', () => {
  assert.equal(marketInCities(['Mauá'], []), true);
  assert.equal(marketInCities(undefined, []), true);
  assert.equal(marketInCities(['Mauá'], ['Ribeirão Pires']), false);
  assert.equal(marketInCities(['Mauá', 'Ribeirão Pires'], ['Ribeirão Pires']), true);
  assert.equal(marketInCities(undefined, ['Mauá']), false);
});

test('rótulo e subtítulo', () => {
  assert.equal(cityLabel([]), 'Todas as cidades');
  assert.equal(cityLabel(['Mauá']), 'Mauá');
  assert.equal(cityLabel(['Mauá', 'Ribeirão Pires']), 'Mauá + 1');
  assert.equal(cityLabel(['A', 'B', 'C']), 'A + 2');
  assert.equal(citiesText([]), 'Mauá e Ribeirão Pires');
  assert.equal(citiesText(['Mauá']), 'Mauá');
  assert.equal(citiesText(['Mauá', 'Ribeirão Pires']), 'Mauá e Ribeirão Pires');
  assert.equal(citiesText(['A', 'B', 'C']), 'A, B e C');
});
