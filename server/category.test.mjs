import test from 'node:test';
import assert from 'node:assert/strict';
import { fineCategory } from './category.mjs';

const farma = (name, categoryRaw, extra = {}) => fineCategory({ name, categoryRaw, segment: 'farmacia', category: 'outros', ...extra });

test('farmácia: remédio vai para farmacia, higiene e comida seguem para as categorias de mercado', () => {
  assert.equal(farma('Losartana 50mg 30 Comprimidos', 'Antihipertensivo'), 'farmacia');
  assert.equal(farma('Qualquer coisa', 'Outros', { rx: true }), 'farmacia');
  assert.equal(farma('Shampoo Pantene Restauração 400ml', 'Shampoo'), 'higiene');
  assert.equal(farma('Elástico Kit 10 unidades', 'Elástico de Cabelo'), 'higiene');
  assert.equal(farma('Bala Halls Extra Forte 28g', 'Bala'), 'mercearia');
  assert.equal(farma('Pasta de Dente Colgate 90g', 'Higiene e Cuidados Pessoais > Saúde Bucal', { category: 'higiene' }), 'higiene');
});

test('mercado continua como antes', () => {
  assert.equal(fineCategory({ name: 'Arroz Camil 5kg', categoryRaw: 'Mercearia > Arroz', category: 'alimenticios' }), 'mercearia');
});
