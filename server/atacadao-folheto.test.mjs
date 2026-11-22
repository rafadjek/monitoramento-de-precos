import test from 'node:test';
import assert from 'node:assert/strict';
import { fimDoDia, inicioDoDia, juntarFolhetos, montarManifesto } from './collectors/atacadao-folheto.mjs';

test('validade do folheto: fim do dia em Brasília', () => {
  assert.equal(fimDoDia('2026-11-22T00:00:00Z'), '2026-11-23T02:59:59.000Z');
  assert.equal(inicioDoDia('2026-11-17T00:00:00Z'), '2026-11-17T03:00:00.000Z');
  assert.equal(fimDoDia(null), null);
});

const fly = (id, ini, fim) => ({ id, urlFinalDocument: `https://x/Flyer/?id=${id}`, validity: { initial: ini, final: fim } });

test('folhetos iguais em várias lojas viram um só, com as lojas; vencido não entra', () => {
  const agora = new Date('2026-11-22T15:00:00Z');
  const lojas = [
    { loja: 'Mauá A', flyers: [fly('a', '2026-11-17T00:00:00Z', '2026-11-23T00:00:00Z'), fly('velho', '2026-11-10T00:00:00Z', '2026-11-15T00:00:00Z')] },
    { loja: 'Mauá B', flyers: [fly('a', '2026-11-17T00:00:00Z', '2026-11-23T00:00:00Z'), fly('b', '2026-11-22T00:00:00Z', '2026-11-22T00:00:00Z')] },
  ];
  const f = juntarFolhetos(lojas, agora);
  assert.deepEqual(f.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(f[0].lojas, ['Mauá A', 'Mauá B']);
  const m = montarManifesto(f, agora);
  assert.equal(m[0].arquivo, 'atacadao-folheto'); // não pode sobrescrever o catálogo atacadao.json
  assert.equal(m[0].market, 'Atacadão');
  assert.deepEqual(m[0].imageKeys, ['atacadao:a']);
});
