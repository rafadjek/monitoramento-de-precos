// Teste da escolha de cidades: node --test src/cities.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cityLabel, citiesText, effectiveCities, isAll, marketInCities, migrateCities, toggleCity } from './cities.ts';

const av = ['Mauá', 'Ribeirão Pires', 'São Bernardo do Campo'];

test('migra a cidade antiga e prefere a lista nova', () => {
  assert.deepEqual(migrateCities(null, '"Mauá"'), ['Mauá']);
  assert.deepEqual(migrateCities(null, '""'), []);
  assert.deepEqual(migrateCities(null, null), []);
  assert.deepEqual(migrateCities('["Ribeirão Pires"]', '"Mauá"'), ['Ribeirão Pires']);
  assert.deepEqual(migrateCities('[]', '"Mauá"'), []);
  assert.deepEqual(migrateCities('lixo{', '"Mauá"'), ['Mauá']);
});

test('seleção válida: ignora cidade inexistente', () => {
  assert.deepEqual(effectiveCities(['Mauá', 'Santo André'], av), ['Mauá']);
  assert.deepEqual(effectiveCities(['Santo André'], av), []);
  assert.deepEqual(effectiveCities(['Mauá'], []), []);
  assert.equal(isAll([], av), true);
  assert.equal(isAll(av, av), true);
  assert.equal(isAll(['Mauá'], av), false);
});

test('marcar e desmarcar (qualquer cidade, em qualquer ordem)', () => {
  const two = ['Mauá', 'Ribeirão Pires'];
  // "todas" valendo: desmarcar uma deixa a outra
  assert.deepEqual(toggleCity([], 'Mauá', two), ['Ribeirão Pires']);
  assert.deepEqual(toggleCity([], 'Ribeirão Pires', two), ['Mauá']);
  // só Mauá, marcar Ribeirão: as duas ficam marcadas
  assert.deepEqual(toggleCity(['Mauá'], 'Ribeirão Pires', two), ['Mauá', 'Ribeirão Pires']);
  // só Ribeirão, marcar Mauá
  assert.deepEqual(toggleCity(['Ribeirão Pires'], 'Mauá', two), ['Ribeirão Pires', 'Mauá']);
  // desmarcar a última volta a "todas"
  assert.deepEqual(toggleCity(['Mauá'], 'Mauá', two), []);
  assert.deepEqual(toggleCity(['Ribeirão Pires'], 'Ribeirão Pires', two), []);
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
  assert.equal(cityLabel(['Mauá', 'Ribeirão Pires'], 2), 'Todas as cidades');
  assert.equal(cityLabel(['A', 'B', 'C']), 'A + 2');
  assert.equal(citiesText([]), 'Mauá e Ribeirão Pires');
  assert.equal(citiesText(['Mauá']), 'Mauá');
  assert.equal(citiesText(['Mauá', 'Ribeirão Pires']), 'Mauá e Ribeirão Pires');
  assert.equal(citiesText(['A', 'B', 'C']), 'A, B e C');
});
