import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, chaveNome } from './fichas.mjs';
import { decidirPorFicha } from './fichas-regra.mjs';

const f = (marca, produto, linha = '', versao = '', sabor = '') => ({ marca, produto, linha, versao, sabor });
const o = (name, price) => ({ name, price });

test('fichas: resposta da IA vira ficha por id, sem acento e minúscula; id desconhecido é ignorado', () => {
  const r = interpretar('```json\n{"itens":[{"id":"1","marca":"Old Spice","produto":"Desodorante","linha":"","versao":"","sabor":"Brisa do Mar"},{"id":"9","marca":"x","produto":"y"}]}\n```', new Set(['1', '2']));
  assert.deepEqual(r.get('1'), { marca: 'old spice', produto: 'desodorante', linha: '', versao: '', sabor: 'brisa do mar' });
  assert.equal(r.size, 1);
  assert.equal(chaveNome('  Café  Pilão 500g '), 'cafe pilao 500g');
});

test('fichas: palavra acessória de um lado só junta (respostas do Rafael de 23/11)', () => {
  assert.equal(decidirPorFicha(o('Desodorante Aerosol Brisa do Mar Old Spice 250ml', 25.98), o('Desodorante Old Spice Brisa Do Mar Leve Mais Pague Menos 250ml', 25.99),
    f('old spice', 'desodorante', '', '', 'brisa do mar'), f('old spice', 'desodorante', '', '', 'brisa do mar')), true);
  assert.equal(decidirPorFicha(o('Leite Longa Vida Ninho Integral 1L', 6.5), o('Leite Uht Ninho Integral 1L', 6.7),
    f('ninho', 'leite', '', 'integral, longa vida'), f('ninho', 'leite', '', 'integral, uht')), true);
  // sabor contido no outro: dúvida, vai para o juiz com fotos (não junta sozinho, mas também não descarta)
  assert.equal(decidirPorFicha(o('Sanduíche Hot Pocket X-Burguer Barbecue Sadia 145G', 10.98), o('Sanduíche Hot Pocket X-Burguer Sadia 145g', 10.99),
    f('sadia', 'sanduiche', 'hot pocket', '', 'x-burguer barbecue'), f('sadia', 'sanduiche', 'hot pocket', '', 'x-burguer')), undefined);
  // sabor ou linha de um lado só (Batata Palha x Batata Palha Parmesão): juiz
  assert.equal(decidirPorFicha(o('Batata Palha Extra Fina Parmesão Yoki 100g', 9.99), o('Batata Palha Extrafina Yoki 100G', 7.98),
    f('yoki', 'batata palha', '', 'extra fina', 'parmesao'), f('yoki', 'batata palha', '', 'extrafina', '')), undefined);
});

test('fichas: linha, sabor ou versão de verdade diferentes separam', () => {
  assert.equal(decidirPorFicha(o('Shampoo anticaspa men limpeza profunda Clear 200ml', 28.29), o('Shampoo Anticaspa Sports Men Limpeza Profunda Clear 200ml', 27.98),
    f('clear', 'shampoo', 'men'), f('clear', 'shampoo', 'sports men')), false);
  assert.equal(decidirPorFicha(o('Desinfetante Pinho Sol Original 1L', 9), o('Desinfetante Pinho Sol Lavanda Frasco 1l', 9.5),
    f('pinho sol', 'desinfetante', '', 'original'), f('pinho sol', 'desinfetante', '', '', 'lavanda')), false);
  assert.equal(decidirPorFicha(o('Achocolatado em Pó Toddy 400g', 9), o('Achocolatado em Pó Toddy Light 400g', 9.5),
    f('toddy', 'achocolatado'), f('toddy', 'achocolatado', '', 'light')), false);
  assert.equal(decidirPorFicha(o('Gelatina Royal 25g', 2), o('Gelatina Royal Morango 25g', 2.1), f('royal', 'gelatina'), f('royal', 'gelatina', '', '', 'morango')), false);
});

test('fichas: palavras próprias dos dois lados vão para o juiz (zona cinzenta)', () => {
  assert.equal(decidirPorFicha(o('Macarrão com Ovos Adria Espaguete Furado 500g', 5), o('Macarrão com Ovos Conchinha Adria 500g', 5),
    f('adria', 'macarrao', '', 'com ovos'), f('adria', 'macarrao', '', 'com ovos')), undefined);
  assert.equal(decidirPorFicha(o('x', 1), o('y', 1), null, f('a', 'b')), undefined);
});
