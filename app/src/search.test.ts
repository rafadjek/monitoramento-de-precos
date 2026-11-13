// Teste da busca: node --test src/search.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { haystack, match, oneEdit, parseQuery } from './search.ts';

const finds = (q: string, name: string) => match(haystack(name), parseQuery(q));

// [busca, nome do produto, esperado: 1 exato, 2 com erro de digitação, 0 não acha]
const CASOS: [string, string, 0 | 1 | 2][] = [
  ['feijao', 'Feijão Carioca Kicaldo 1kg', 1],
  ['FEIJÃO preto', 'Feijão Preto Tipo 1 Camil 1kg', 1],
  ['cocacola', 'Refrigerante Coca-Cola Original 2L', 1],
  ['coca cola zero', 'Refrigerante Coca-Cola Sem Açúcar Zero 2L', 1],
  ['detergente ype', 'Detergente Líquido Ypê Neutro 500ml', 1],
  ['refri guarana', 'Refrigerante Guaraná Antarctica 2L', 1],
  ['sabao em po omo', 'Lava Roupas em Pó Omo Lavagem Perfeita 1,6kg', 1],
  ['papel higienico', 'Papel Hig. Neve Folha Dupla 12 Rolos', 1],
  ['achocolatado', 'Toddy Original 370g', 1],
  ['bolacha recheada', 'Biscoito Recheado Passatempo 130g', 2], // recheada x recheado: acha, com um erro
  ['mussarela', 'Queijo Muçarela Fatiado 150g', 1],
  ['nescau', 'Achocolatado em Pó Nescau 2.0 370g', 1],
  ['amaciante', 'Amac. Downy Brisa de Verão 500ml', 1],
  ['detergnte', 'Detergente Líquido Ypê Neutro 500ml', 2],
  ['macarao', 'Macarrão Espaguete Adria 500g', 2],
  ['marcarrao', 'Macarrão Espaguete Adria 500g', 2],
  ['heineken', 'Cerveja Heineken Long Neck 330ml', 1],
  ['heinekn', 'Cerveja Heineken Long Neck 330ml', 2],
  ['arroz', 'Feijão Carioca Kicaldo 1kg', 0],
  ['leite', 'Achocolatado em Pó Nescau 370g', 0],
  ['refri', 'Suco de Laranja Del Valle 1L', 0],
  ['cafe', 'Carne Moída Patinho 500g', 0], // 4 letras: sem tolerância a erro
  ['sal', 'Sal Refinado Cisne 1kg', 1],
];

for (const [q, name, want] of CASOS) {
  test(`"${q}" em "${name}" -> ${want}`, () => assert.equal(finds(q, name), want));
}

test('uma edição', () => {
  assert.ok(oneEdit('macarao', 'macarrao'));
  assert.ok(oneEdit('detrgente', 'detergente'));
  assert.ok(oneEdit('dteergente', 'detergente'));
  assert.ok(!oneEdit('macao', 'macarrao'));
});
