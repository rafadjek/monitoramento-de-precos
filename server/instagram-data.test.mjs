import test from 'node:test';
import assert from 'node:assert/strict';
import { dataDoCodigo } from './collectors/instagram-data.mjs';

const dia = (c) => dataDoCodigo(c)?.slice(0, 10);

test('data do post pelo código do Instagram', () => {
  assert.equal(dia('DfuddBniV61'), '2026-11-14'); // Carnes Santana
  assert.equal(dia('Df7_CFQifPV'), '2026-11-19'); // Mercadinho Parceiro
  assert.equal(dia('DgBD5hZMxJ2'), '2026-11-21'); // Nevada
  assert.equal(dia('DZagbNnxD8u'), '2026-06-10'); // post antigo
});

test('código inválido não vira data', () => {
  assert.equal(dataDoCodigo(''), null);
  assert.equal(dataDoCodigo('abc'), null);
  assert.equal(dataDoCodigo('!!!!!!!!!!!'), null);
  assert.equal(dataDoCodigo('AAAAAAAAAAA'), null); // anterior a 2015
});
