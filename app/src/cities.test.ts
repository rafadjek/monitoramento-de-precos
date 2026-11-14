// Teste da escolha de cidades: node --test src/cities.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cityLabel, citiesText, effectiveCities, isAll, marketInCities, migrateCities, serializeCities, toggleAll, toggleCity } from './cities.ts';

const two = ['Mauá', 'Ribeirão Pires'];

test('migra as chaves antigas e prefere a nova', () => {
  assert.equal(migrateCities(null, null, null), null);
  assert.equal(migrateCities('todas', '["Mauá"]', null), null);
  assert.deepEqual(migrateCities('[]', '["Mauá"]', null), []);
  assert.deepEqual(migrateCities('["Ribeirão Pires"]', '["Mauá"]', '"Mauá"'), ['Ribeirão Pires']);
  // chave antiga: [] significava todas; não vazio é seleção explícita
  assert.equal(migrateCities(null, '[]', null), null);
  assert.deepEqual(migrateCities(null, '["Mauá"]', null), ['Mauá']);
  // chave mais antiga (texto único)
  assert.deepEqual(migrateCities(null, null, '"Mauá"'), ['Mauá']);
  assert.equal(migrateCities(null, null, '""'), null);
  assert.deepEqual(migrateCities(null, 'lixo{', '"Mauá"'), ['Mauá']);
  assert.equal(migrateCities('lixo{', null, null), null);
});

test('serializa: null vira "todas"', () => {
  assert.equal(serializeCities(null), 'todas');
  assert.equal(serializeCities([]), '[]');
  assert.deepEqual(migrateCities(serializeCities(['Mauá'])), ['Mauá']);
  assert.deepEqual(migrateCities(serializeCities([])), []);
  assert.equal(migrateCities(serializeCities(null)), null);
});

test('todas, desmarcar uma, desmarcar as duas, remarcar', () => {
  let s = toggleCity(null, 'Mauá', two);
  assert.deepEqual(s, ['Ribeirão Pires']);
  s = toggleCity(s, 'Ribeirão Pires', two);
  assert.deepEqual(s, []);
  s = toggleCity(s, 'Mauá', two);
  assert.deepEqual(s, ['Mauá']);
  // remarcar a outra normaliza para null
  assert.equal(toggleCity(s, 'Ribeirão Pires', two), null);
  // outra ordem
  assert.deepEqual(toggleCity(null, 'Ribeirão Pires', two), ['Mauá']);
  assert.deepEqual(toggleCity(['Mauá'], 'Mauá', two), []);
});

test('"Todas": desmarcar tudo e marcar tudo', () => {
  assert.deepEqual(toggleAll(null, two), []);
  assert.equal(toggleAll([], two), null);
  assert.equal(toggleAll(['Mauá'], two), null);
  assert.equal(isAll(null, two), true);
  assert.equal(isAll([], two), false);
  assert.equal(isAll(two, two), true);
});

test('normalização para null e cidades inexistentes', () => {
  assert.equal(effectiveCities(['Ribeirão Pires', 'Mauá'], two), null);
  assert.deepEqual(effectiveCities(['Mauá', 'Santo André'], two), ['Mauá']);
  assert.deepEqual(effectiveCities(['Santo André'], two), []);
  assert.deepEqual(effectiveCities([], two), []);
  assert.equal(effectiveCities(null, two), null);
  assert.deepEqual(effectiveCities([], []), []); // ainda sem lista carregada: não mexe
});

test('filtro de mercado', () => {
  assert.equal(marketInCities(['Mauá'], null), true);
  assert.equal(marketInCities(undefined, null), true);
  assert.equal(marketInCities(['Mauá'], []), false);
  assert.equal(marketInCities(['Mauá'], ['Ribeirão Pires']), false);
  assert.equal(marketInCities(['Mauá', 'Ribeirão Pires'], ['Ribeirão Pires']), true);
  assert.equal(marketInCities(undefined, ['Mauá']), false);
});

test('rótulo e subtítulo', () => {
  assert.equal(cityLabel(null), 'Todas as cidades');
  assert.equal(cityLabel([]), 'Nenhuma cidade');
  assert.equal(cityLabel(['Mauá']), 'Mauá');
  assert.equal(cityLabel(['Mauá', 'Ribeirão Pires']), 'Mauá + 1');
  assert.equal(cityLabel(two, 2), 'Todas as cidades');
  assert.equal(citiesText(null), 'Mauá e Ribeirão Pires');
  assert.equal(citiesText(['Mauá']), 'Mauá');
  assert.equal(citiesText(['A', 'B', 'C']), 'A, B e C');
});
