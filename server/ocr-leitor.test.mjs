// Testes do leitor OCR (sem rede e sem Python): conferência contra o OCR, caixa da foto e o fluxo com modelo de texto simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarLinhas, conferir, precosDoOcr, imageBoxDe, lerPorOcr, lerJson, OcrFalhou, Indisponivel, promptOcr } from './readers/ocr-leitor.mjs';

// página 1000x1000 px: as caixas já estão em "0 a 1000"
const L = (t, x0, y0, x1, y1) => ({ t, box: [x0, y0, x1, y1] });
const pagina = (linhas) => ({ w: 1000, h: 1000, linhas });
// duas células: arroz (preço inteiro "7" + ",89" partido) e feijão (preço numa linha só)
const PAG = pagina([
  L('ARROZ TIO JOAO 5KG', 50, 300, 300, 330), L('R$', 60, 340, 80, 360), L('7', 85, 335, 150, 420), L(',89', 152, 338, 200, 370),
  L('FEIJAO CARIOCA 1KG', 450, 300, 700, 330), L('R$ 8,49', 460, 340, 600, 420),
]);
const ls = normalizarLinhas(PAG);
const numDe = (t) => ls.find((l) => l.t === t).n; // número da linha pelo texto (a ordem de leitura reordena)
const arroz = { name: 'Arroz Tio Joao 5kg', price: 7.89, category: 'alimenticios', others: [], linhas: ['ARROZ TIO JOAO 5KG', '7', ',89'].map(numDe) };
const feijao = { name: 'Feijão Carioca 1kg', price: 8.49, category: 'alimenticios', others: [], linhas: ['FEIJAO CARIOCA 1KG', 'R$ 8,49'].map(numDe) };

test('conferir: preço partido ("7" + ",89") é aceito', () => {
  assert.equal(precosDoOcr(ls).set.has(789), true);
  assert.equal(conferir([arroz, feijao], ls).ok, true);
});
test('conferir: preço partido com vírgula no inteiro ("35," + "90") é aceito', () => {
  const l2 = normalizarLinhas(pagina([L('MUSCULO KG', 100, 400, 300, 430), L('35,', 100, 300, 200, 390), L('90', 195, 305, 240, 340), L('KG', 200, 350, 240, 370)]));
  assert.equal(conferir([{ name: 'Músculo kg', price: 35.9 }], l2).ok, true);
});
test('conferir: preço inventado é rejeitado (principal, alternativo e "de")', () => {
  const c1 = conferir([{ ...arroz, price: 7.99 }, feijao], ls);
  assert.equal(c1.ok, false); assert.match(c1.motivo, /fora do OCR: 7\.99/);
  assert.equal(conferir([{ ...arroz, others: [{ price: 6.5, condition: 'a partir de 3 un.' }] }, feijao], ls).ok, false);
  assert.equal(conferir([{ ...arroz, listPrice: 9.99 }, feijao], ls).ok, false);
});
test('conferir: número de itens incoerente com os preços da página', () => {
  const muitos = Array.from({ length: 5 }, (_, i) => ({ ...feijao, name: 'Feijão ' + i }));
  assert.equal(conferir(muitos, ls).ok, false); // 5 itens, só 2 preços
  const cheia = normalizarLinhas(pagina(Array.from({ length: 10 }, (_, i) => L(`R$ ${i + 1},99`, 50 + i * 80, 400, 120 + i * 80, 430))));
  assert.equal(conferir([{ name: 'Só um', price: 1.99 }], cheia).ok, false); // 1 preço usado de 10 na página
  assert.equal(conferir([], cheia).ok, false);
});
test('conferir: preço inteiro sem centavos só vale se o inteiro aparece', () => {
  const l2 = normalizarLinhas(pagina([L('PEÇA', 10, 10, 100, 40), L('12', 10, 50, 100, 90), L('OUTRO', 300, 10, 400, 40), L('4,99', 300, 50, 400, 90)]));
  assert.equal(conferir([{ name: 'Peça', price: 12 }, { name: 'Outro', price: 4.99 }], l2).ok, true);
  assert.equal(conferir([{ name: 'Peça', price: 13 }, { name: 'Outro', price: 4.99 }], l2).ok, false);
});
test('imageBoxDe: união das linhas ampliada, no formato [y0,x0,y1,x1]', () => {
  const b = imageBoxDe(arroz.linhas, ls);
  assert.equal(b.length, 4);
  const [y0, x0, y1, x1] = b;
  assert.ok(y0 < 300 && x0 < 50 && y1 > 420 && x1 > 300, JSON.stringify(b));
  assert.ok(b.every((n) => n >= 0 && n <= 1000));
  assert.equal(imageBoxDe([99], ls), null); // linha que não existe
  assert.equal(imageBoxDe(undefined, ls), null);
  assert.equal(imageBoxDe([1, 2], normalizarLinhas(pagina([L('a', 0, 0, 10, 10), L('b', 900, 900, 990, 990)]))), null); // união enorme: linha citada errada
});
test('lerJson: aceita cerca de markdown e rejeita JSON cortado', () => {
  assert.deepEqual(lerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(lerJson('{"products": [{"name": "x"'), null);
  assert.equal(lerJson('sem json'), null);
});
test('promptOcr: tira a regra do box e traz os exemplos de erro conhecidos', () => {
  const p = promptOcr('Você lê uma página de encarte.\n- box = [ymin, xmin, ymax, xmax] da foto.\n- outra regra\nResponda só com o objeto JSON.');
  assert.ok(!p.includes('ymin') && p.includes('outra regra') && /a partir de 3 un/.test(p) && /linhas/.test(p));
});

const resposta = (prods) => JSON.stringify({ validFrom: '2026-11-19', validUntil: '2026-11-25', products: prods });
const falso = (respostas, nome = 'falso') => {
  const p = { nome, tpm: 1e9, maxEntrada: 1e9, chamadas: [], chamar: async (prompt) => { p.chamadas.push(prompt); const r = respostas.shift(); if (r instanceof Error) throw r; return r; } };
  return p;
};
const ocrFalso = async () => [PAG];
const lerCom = (provedores) => lerPorOcr(Buffer.from('x'), 'Você lê uma página.\nResponda só com o objeto JSON.', { ocr: ocrFalso, provedores, log: null });

test('lerPorOcr: caminho feliz, com caixa da foto e leitor registrado', async () => {
  const r = await lerCom([falso([resposta([arroz, feijao])])]);
  assert.equal(r.products.length, 2);
  assert.equal(r.reader, 'ocr+falso'); assert.equal(r.model, 'ocr+falso');
  assert.equal(r.validUntil, '2026-11-25');
  assert.equal(r.products[0].box.length, 4);
  assert.equal(r.products[0].linhas, undefined);
});
test('lerPorOcr: JSON inválido na 1ª vez, válido na nova tentativa', async () => {
  const p = falso(['{"products": [{"name"', resposta([arroz, feijao])]);
  const r = await lerCom([p]);
  assert.equal(r.products.length, 2); assert.equal(p.chamadas.length, 2);
  assert.match(p.chamadas[1], /JSON inválido/);
});
test('lerPorOcr: preço inventado duas vezes manda a página para o Gemini (OcrFalhou)', async () => {
  const ruim = resposta([{ ...arroz, price: 7.79 }, feijao]);
  const p = falso([ruim, ruim]);
  await assert.rejects(lerCom([p]), (e) => e instanceof OcrFalhou && /fora do OCR: 7\.79/.test(e.message));
  assert.equal(p.chamadas.length, 2);
});
test('lerPorOcr: modelo indisponível passa a vez para o próximo', async () => {
  const a = falso([new Indisponivel('gemma: cota do dia esgotada')], 'a'), b = falso([resposta([arroz, feijao])], 'b');
  const r = await lerCom([a, b]);
  assert.equal(r.reader, 'ocr+b');
});
test('lerPorOcr: todos indisponíveis, página grande demais e sem chave viram OcrFalhou', async () => {
  await assert.rejects(lerCom([falso([new Indisponivel('x')])]), /nenhum modelo de texto respondeu/);
  const pequeno = falso([resposta([arroz, feijao])]); pequeno.maxEntrada = 10;
  await assert.rejects(lerCom([pequeno]), /passa do limite/);
  await assert.rejects(lerCom([]), OcrFalhou);
});
test('lerPorOcr: Python indisponível vira OcrFalhou com o motivo', async () => {
  await assert.rejects(lerPorOcr(Buffer.from('x'), 'p', { ocr: async () => { throw new Error('ocr indisponível: Python não encontrado'); }, provedores: [falso([])], log: null }),
    (e) => e instanceof OcrFalhou && /Python/.test(e.message));
});
