import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOffers, parseSize } from './group.mjs';
import { normalizeEan } from './ean.mjs';

const o = (market, name, size = null) => ({ market, name, size });
const grouped = (a, b) => groupOffers([a, b]).length === 1;

test('mesmo produto com palavras em outra ordem e embalagem neutra agrupa', () => {
  assert.ok(grouped(o('A', 'Feijão Carioca Camil Tipo 1 1kg'), o('B', 'Feijão Carioca Tipo 1 Camil 1kg')));
  assert.ok(grouped(o('A', 'Coco Ralado Menina 100g'), o('B', 'Coco Ralado Menina 100g Tradicional')));
  assert.ok(grouped(o('A', 'Refrigerante Coca-Cola 350ml'), o('B', 'Refrigerante Coca Cola 350 ml')));
});

test('tamanhos diferentes nunca agrupam', () => {
  assert.ok(!grouped(o('A', 'Arroz Tio João Tipo 1 5kg'), o('B', 'Arroz Tio João Tipo 1 1kg')));
  assert.ok(!grouped(o('A', 'Leite Integral 1L'), o('B', 'Leite Integral 500ml')));
});

test('tipos ou sabores diferentes nunca agrupam', () => {
  assert.ok(!grouped(o('A', 'Arroz Tio João Tipo 1 5kg'), o('B', 'Arroz Tio João Tipo 2 5kg')));
  assert.ok(!grouped(o('A', 'Arroz Integral Camil 1kg'), o('B', 'Arroz Camil 1kg')));
  assert.ok(!grouped(o('A', 'Biscoito Marilan Coco 300g'), o('B', 'Biscoito Marilan Chocolate 300g')));
});

test('embalagens diferentes (lata x pet) não agrupam', () => {
  assert.ok(!grouped(o('A', 'Óleo Composto Faisão Lata 500ml'), o('B', 'Óleo Composto Faisão Pet 500ml')));
});

test('mesmo mercado sozinho não forma grupo', () => {
  assert.equal(groupOffers([o('A', 'Fubá Mimoso 1kg'), o('A', 'Fubá Mimoso 1kg')]).length, 0);
});

const e = (market, name, ean) => ({ market, name, ean });

test('mesmo EAN agrupa mesmo com nomes bem diferentes', () => {
  assert.ok(grouped(e('A', 'Bala Pocket 500g Café', '7896058256093'), e('B', 'Bala Riclan Pocket Coffee 500g', '7896058256093')));
  assert.ok(grouped(e('A', 'Biscoito Club Social 144g Integral', '07622300862343'), e('B', 'Club Social Integral Multipack', '7622300862343')));
});

const ep = (market, name, ean, price) => ({ market, name, ean, price });

test('mesmo EAN com tamanho e preço muito diferentes não agrupa (cadastro errado)', () => {
  assert.ok(!grouped(ep('A', 'Biscoito de Polvilho Biscoitone 100g', '7896058256093', 3.99), ep('B', 'Biscoito de Polvilho Biscoitone 200g', '7896058256093', 8.49)));
  // peso drenado: tamanho diferente, preço igual -> mesmo produto
  assert.ok(grouped(ep('A', 'Sardinha Gomes da Costa Óleo 125g', '7896058256093', 6.19), ep('B', 'Sardinha Gomes da Costa Óleo 75g', '7896058256093', 6.25)));
});

test('EANs diferentes barram a regra de nomes', () => {
  assert.ok(!grouped(e('A', 'Creme Dental Colgate 90g', '7891024134702'), e('B', 'Creme Dental Colgate 90g', '7891528038568')));
});

test('com gás e sem gás nunca agrupam', () => {
  assert.ok(!grouped(o('A', 'Água Mineral Minalba Sem Gás 1,5L'), o('B', 'Água Mineral Minalba Com gás 1,5L')));
});

test('EAN inválido ou de balança é ignorado (cai na regra de nomes)', () => {
  assert.equal(normalizeEan('7896058256094'), null); // dígito verificador errado
  assert.equal(normalizeEan('2000123000005'), null); // código interno de loja
  assert.ok(!grouped(e('A', 'Queijo Mussarela kg', '2000123000005'), e('B', 'Presunto Cozido kg', '2000123000005')));
  assert.equal(normalizeEan('7896058256093'), '07896058256093');
});

test('sem EAN de um lado, a regra de nomes ainda junta', () => {
  assert.ok(grouped(e('A', 'Feijão Carioca Camil Tipo 1 1kg', null), e('B', 'Feijão Carioca Tipo 1 Camil 1kg', '7896006711155')));
});

test('conversão de tamanho', () => {
  assert.equal(parseSize('1,5L').key, 'ml:1500');
  assert.equal(parseSize('', 'Arroz 5 kg').key, 'g:5000');
  assert.equal(parseSize('4x90g').key, 'g:360');
});

test('palavra de embalagem do encarte não impede juntar', () => {
  assert.ok(grouped(o('A', 'REQUEIJÃO CREMOSO BATAVO TRADICIONAL POTE 400G'), o('B', 'Requeijão Cremoso Batavo Tradicional 400g')));
  assert.ok(grouped(o('A', 'ÁGUA SANITÁRIA YPÊ GALÃO 5L'), o('B', 'Água Sanitária Ypê 5L')));
});
