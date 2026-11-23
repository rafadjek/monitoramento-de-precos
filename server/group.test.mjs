import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOffers, parseSize, brandKeys } from './group.mjs';
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

test('marca deduzida do nome para quem não informa marca (Semar, Spani, encartes)', () => {
  const comMarca = [1, 2, 3].flatMap((k) => [b('A', `Óleo de Soja Liza ${k}L`, 'Liza', 7), b('B', `Café Pilão Tradicional ${k}00g`, 'Pilão', 20)]);
  const sem = [b('S', 'Óleo de Soja Tipo 1 Liza Garrafa 900ml', null, 7.5), b('S', 'Combo Óleo Liza 900ml + Café Pilão 500g', null, 30), b('S', 'Arroz Branco 5kg', null, 25)];
  const k = brandKeys([...comMarca, ...sem]);
  assert.deepEqual(k.slice(comMarca.length), ['liza', null, null]); // combo com 2 marcas fica sem marca
  // com a marca deduzida, nome quase igual (só palavra SOFT a mais) junta
  assert.ok(groupOffers([...comMarca, b('X', 'Óleo de Soja Liza 900ml', 'Liza', 7.2), sem[0]]).some((g) => g.idx.includes(comMarca.length + 1) && g.idx.includes(comMarca.length)));
});

test('remédio de farmácia só agrupa pelo EAN (Fase 14)', () => {
  const f = (market, name, ean = null) => ({ market, name, size: null, category: 'farmacia', ean });
  assert.ok(!grouped(f('A', 'Dipirona Monoidratada 500mg EMS 10 Comprimidos'), f('B', 'Dipirona Monoidratada 500mg EMS 10 Comprimidos')));
  assert.ok(grouped(f('A', 'Dipirona 500mg EMS 10 Comprimidos', '7896004713175'), f('B', 'Dipirona Monoidratada EMS 10 cp', '7896004713175')));
});

test('item vendido por kg não agrupa com pacote do mesmo peso', () => {
  const kg = { market: 'A', name: 'Bisteca Suína Sadia 500g', size: null, condition: 'preço por kg' };
  assert.ok(!grouped(kg, o('B', 'Bisteca Suína Sadia 500g')));
});

// ---------- Fase 17.3: marcas de mais de uma palavra, plural e submarca ----------
const mk = (market, name, brand = null) => ({ market, name, brand, price: 5 });
const informantes = (marca, nome, n = 4) => Array.from({ length: n }, (_, i) => mk(['A', 'B', 'C', 'D'][i % 4], `${nome} ${100 + i}g`, marca));

test('marca no plural (Trakinas) entra no dicionário e vale para quem não informa marca', () => {
  const k = brandKeys([...informantes('Trakinas', 'Biscoito Recheado Trakinas Chocolate'), mk('S', 'Biscoito Recheado Trakinas Morango 126g')]);
  assert.equal(k.at(-1), 'trakinas');
});

test('marca com preposição (Do Valle) vale colada ou separada', () => {
  const k = brandKeys([...informantes('Do Valle', 'Fubá Mimoso Do Valle'), mk('S', 'FAROFA DOVALLE TEMP. 400G PC'), mk('S', 'Cuscuz Do Valle 500g'), mk('S', 'Arroz Branco 5kg')]);
  assert.equal(k.at(-3), 'dovalle');
  assert.equal(k.at(-2), 'dovalle');
  assert.equal(k.at(-1), null);
  assert.equal(k[0], 'dovalle'); // quem informa "Do Valle" também fica com 'dovalle', não com o artigo 'do'
});

test('marca de duas palavras (Casa de Mãe) não vira combo com as palavras soltas', () => {
  const k = brandKeys([...informantes('Casa de Mãe', 'Farinha Casa de Mãe'), ...informantes('Mãe Terra', 'Granola Mãe Terra'), mk('S', 'Batata Palha Casa de Mae Extra Fina 400g')]);
  assert.equal(k.at(-1), 'casa');
});

test('marca e submarca (Nissin Cup Noodles): a mais conhecida vence; duas parecidas continuam combo', () => {
  const nissin = Array.from({ length: 12 }, (_, i) => mk('A', `Macarrão Instantâneo Nissin ${i}`, 'Nissin'));
  const cup = Array.from({ length: 2 }, (_, i) => mk('B', `Cup Noodles Galinha ${i}`, 'Cup Noodles'));
  const k = brandKeys([...nissin, ...cup, mk('S', 'Macarrão Instantâneo Nissin Cup Noodles Galinha 69g')]);
  assert.equal(k.at(-1), 'nissin');
  const liza = informantes('Liza', 'Óleo de Soja Liza'), pilao = informantes('Pilão', 'Café Pilão Tradicional');
  assert.equal(brandKeys([...liza, ...pilao, mk('S', 'Combo Óleo Liza 900ml + Café Pilão 500g')]).at(-1), null);
});

// ---------- Fase 17.4: regra v2 de nomes (nomes-v2.mjs) ----------
test('v2: abreviação, erro de uma letra e palavra neutra nova juntam', () => {
  assert.ok(grouped(b('A', 'Biscoito Recheado Choc Bauducco 140g', 'Bauducco', 3.3), b('B', 'Biscoito Recheado Chocolate Bauducco 140g', 'Bauducco', 3.5)));
  assert.ok(grouped(b('A', 'Macarrão Espaguete Adria Sêmola 500g', 'Adria', 4.5), b('B', 'Macarrão Espaguete Adria 500g', 'Adria', 4.7)));
  assert.ok(grouped(b('A', 'Refresco em Pó Tang Sabor Laranja 25g', 'Tang', 1.5), b('B', 'Refresco em Pó Tang Laranja 25g', 'Tang', 1.6)));
  assert.ok(grouped(b('A', 'Requeijão Cremoso Vigor 200g', 'Vigor', 8.9), b('B', 'Requeijão Vigor 200g', 'Vigor', 9.4)));
});

test('v2: variante de um lado só (sabor, cor, versão) nunca junta', () => {
  assert.ok(!grouped(b('A', 'Iogurte Grego Vigor 90g', 'Vigor', 3.7), b('B', 'Iogurte Grego Vigor Frutas Vermelhas 90g', 'Vigor', 3.9)));
  assert.ok(!grouped(b('A', 'Iogurte Grego Vigor Frutas Vermelhas 90g', 'Vigor', 3.7), b('B', 'Iogurte Grego Vigor Frutas Amarelas 90g', 'Vigor', 3.9)));
  assert.ok(!grouped(b('A', 'Leite Condensado Moça 395g', 'Moça', 8.5), b('B', 'Leite Condensado Moça Semidesnatado 395g', 'Moça', 8.9)));
  assert.ok(!grouped(b('A', 'Suco Integral Aurora 1,5L', 'Aurora', 19.9), b('B', 'Suco Integral Aurora Tinto 1,5L', 'Aurora', 19.9)));
  assert.ok(!grouped(b('A', 'Bala Butter Toffees 400g', 'Arcor', 18.9), b('B', 'Bala Arcor Butter Toffees Intense Chocolate 400g', 'Arcor', 21.9)));
  assert.ok(!grouped(b('A', 'Biscoito Club Social 141g', 'Club Social', 5.9), b('B', 'Biscoito Club Social Pão de Alho 141g', 'Club Social', 6.2)));
});

test('v2: embalagem e forma diferentes separam (lata x garrafa, líquido x pó)', () => {
  assert.ok(!grouped(b('A', 'Cerveja Heineken Lata 350ml', 'Heineken', 5.5), b('B', 'Cerveja Heineken Garrafa 350ml', 'Heineken', 5.9)));
  assert.ok(!grouped(b('A', 'Lava Roupas Líquido Omo 1,6kg', 'Omo', 29.9), b('B', 'Lava Roupas em Pó Omo 1,6kg', 'Omo', 28.9)));
  assert.ok(!grouped(b('A', 'Achocolatado em Pó Nescau 370g', 'Nescau', 12.9), b('B', 'Achocolatado em Pó Nescau Sachê 370g', 'Nescau', 13.5)));
});

test('v2: preço muito distante não junta; interruptor GROUP_V2=0 volta à regra antiga', () => {
  assert.ok(!grouped(b('A', 'Macarrão Espaguete Adria Sêmola 500g', 'Adria', 4.5), b('B', 'Macarrão Espaguete Adria 500g', 'Adria', 9.9)));
  process.env.GROUP_V2 = '0';
  try {
    assert.ok(!grouped(b('A', 'Macarrão Espaguete Adria Sêmola 500g', 'Adria', 4.5), b('B', 'Macarrão Espaguete Adria 500g', 'Adria', 4.7))); // 'semola' não é SOFT
    assert.ok(grouped(b('A', 'Café Melitta Tradicional 500g', 'Melitta', 22.9), b('B', 'Café Torrado e Moído Melitta Tradicional Vácuo 500g', 'Melitta', 24.9)));
  } finally { delete process.env.GROUP_V2; }
});

test('v2: palavra colada, abreviação de embalagem e número no fim da palavra', () => {
  assert.ok(grouped(b('A', 'Batata Palha Extra Fina Parmesão Yoki 100g', 'Yoki', 9.9), b('B', 'Batata Palha Extrafina Parmesão Yoki 100g', 'Yoki', 7.9)));
  assert.ok(grouped(b('A', 'Energético Original Tnt Lata 473ml', 'Tnt', 6.98), b('B', 'Energetico Tnt Original Lt 473ml', 'Tnt', 7.2)));
  // "Comfort3" é outra versão do aparelho, não erro de digitação de "Comfort"
  assert.ok(!grouped(b('A', 'Aparelho de Barbear Bic Comfort 4 un', 'Bic', 16.7), b('B', 'Aparelho De Barbear Bic Comfort3 Embalagem 4Un', 'Bic', 16.9)));
  // Classic é linha de produto (Salton Classic)
  assert.ok(!grouped(b('A', 'Espumante Salton Classic Moscatel 750ml', 'Salton', 23.9), b('B', 'Espumante Salton Moscatel 750ml', 'Salton', 24.9)));
});

test('v2: congelado de um lado só pede preço parecido (fresco x congelado)', () => {
  assert.ok(grouped(b('A', 'Linguiça Toscana Sadia Congelada 700g', 'Sadia', 21.8), b('B', 'Linguiça Toscana Sadia 700g', 'Sadia', 23.9)));
  assert.ok(!grouped(b('A', 'Filé de Peito de Frango Sadia Congelado 1kg', 'Sadia', 19.9), b('B', 'Filé de Peito de Frango Sadia 1kg', 'Sadia', 26.9)));
});
