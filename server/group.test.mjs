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

const b = (market, name, brand, price, ean = null) => ({ market, name, brand, price, ean });

test('mesmo produto descrito de outro jeito junta (palavras que só descrevem)', () => {
  assert.ok(grouped(b('A', 'Café Melitta Tradicional 500g', 'Melitta', 22.9, '7891021006125'), b('B', 'Café Torrado e Moído Melitta Tradicional Vácuo 500g', 'Melitta', 27.99, '7891021001885')));
  assert.ok(grouped(b('A', 'Achocolatado em Pó Nescau 670g', 'Nescau', 17.9), b('B', 'ACHOCOLATADO EM PÓ NESCAU NESTLÉ 670G', 'Nescau', 18.5)));
  // "lata" de um lado só não é palavra neutra: não junta
  assert.ok(!grouped(b('A', 'Achocolatado em Pó Nescau 370g', 'Nescau', 12.9), b('B', 'Achocolatado em Pó Nescau Lata 370g', 'Nescau', 13.5)));
});

test('palavra que muda o produto nunca junta, mesmo com nome quase igual', () => {
  assert.ok(!grouped(b('A', 'Água Mineral Crystal Com gás 500ml', 'Crystal', 2.5, '7894900530001'), b('B', 'Água Mineral Crystal sem Gás 500ml', 'Crystal', 2.3, '7894900531008')));
  assert.ok(!grouped(b('A', 'Manteiga Aviação com Sal 200g', 'Aviação', 14.9), b('B', 'Manteiga Aviação sem Sal 200g', 'Aviação', 14.9)));
  assert.ok(!grouped(b('A', 'Refresco em Pó Clight Limonada 8g', 'Clight', 1.5), b('B', 'Refresco em pó Clight Sem Açúcar Limonada 8g', 'Clight', 1.5)));
  assert.ok(!grouped(b('A', 'Torrada Bauducco Tradicional 284g', 'Bauducco', 8.9), b('B', 'Torrada Integral Bauducco 284g', 'Bauducco', 9.2)));
  assert.ok(!grouped(b('A', 'Requeijão Vigor Tradicional 200g', 'Vigor', 8.9), b('B', 'Requeijão Cremoso Light Vigor 200g', 'Vigor', 8.9)));
  assert.ok(!grouped(b('A', 'Refrigerante Coca-Cola 2L', 'Coca-Cola', 10.9), b('B', 'Refrigerante Coca-Cola Zero 2L', 'Coca-Cola', 10.9)));
});

test('nome quase igual com preço muito diferente não junta', () => {
  assert.ok(!grouped(b('A', 'Café Melitta Tradicional 500g', 'Melitta', 22.9), b('B', 'Café Torrado Melitta Tradicional 500g', 'Melitta', 49.9)));
});

test('quantidade de unidades lida do nome', async () => {
  const { parsePack } = await import('./group.mjs');
  assert.equal(parsePack('Hambúrguer Bovino Misto 36x56g Aurora Faroeste'), 36);
  assert.equal(parsePack('Bolinho Ana Maria Triplo Chocolate 70g | Com 2 Unidades'), 2);
  assert.equal(parsePack('Cerveja Brahma Lata 350ml c/12'), 12);
  assert.equal(parsePack('Água Mineral Fardo 12 Unidades 500ml'), 12);
  assert.equal(parsePack('Refrigerante Guaraná Pack 6 350ml'), 6);
  assert.equal(parsePack('Arroz Camil Pacote 5kg'), 1);
  assert.equal(parsePack('Energético Sabor Maçã Sugarfree Red Bull 250ml'), 1);
  assert.equal(parsePack('Feijão Carioca Tipo 1 1kg'), 1);
  assert.equal(parsePack('Caixa de Bombom Garoto 250g'), 1);
  // contagem que é o próprio produto (sem peso/volume) não é caixa
  assert.equal(parsePack('Fralda Descartável Huggies Máxima Proteção G Com 58 Unidades'), 1);
  assert.equal(parsePack('Escova Dental Colgate White Active Prevenção C/2'), 1);
  // desconto não é quantidade
  assert.equal(parsePack('Limpador Desengordurante Veja 500ml Com 30% De Desconto Cozinha'), 1);
  assert.equal(parsePack('Alvejante Vanish 1.2l Sachê Sacola Com 2 Unidades Com 50% De Desconto Na Segunda'), 2);
  assert.equal(parsePack('Chocolate Lacta Bis 3 Pack De 100,8g Leite'), 3);
  assert.equal(parsePack('Inseticida Elétrico Sbp Refil Cheiro Suave 2un 32,9ml'), 2);
  assert.equal(parsePack('Odorizador Bom Ar Freshmatic 250ml Refil Sacola Com 50% Na Segunda Unidade'), 2);
  assert.equal(parsePack('2 Inseticida Elétrico Suave 45 Noites SBP com Refil 35ML'), 2);
  assert.equal(parsePack('Kit Tira Manchas Vanish Gel Multiuso 1,2L + Crystal White 1,2L'), 2);
  assert.equal(parsePack('Kit Shampoo 350Ml + Condicionador 175Ml Dove'), 1);
  assert.equal(parsePack('Água Mineral 1,5L'), 1);
});

test('garrafa/pet de um lado só juntam; lata contra garrafa não', () => {
  assert.ok(grouped(b('A', 'Cachaça Ypióca Ouro 965ml', 'Ypióca', 28.89), b('B', 'Cachaça Ouro Ypióca Garrafa 965ml', 'Ypióca', 24.99)));
  assert.ok(!grouped(b('A', 'Cerveja Heineken Lata 350ml', 'Heineken', 5.49), b('B', 'Cerveja Heineken Garrafa 350ml', 'Heineken', 5.99)));
});
