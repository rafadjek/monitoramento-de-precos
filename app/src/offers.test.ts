// Teste das Ofertas do Dia: node --test src/offers.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESCONTO_MAX_FARMACIA, MAX_FARMACIA, isFarmacia, pickOffers, tipoDe } from './offers.ts';

let n = 0;
// nome único por item (a regra de "um produto só" olha marca e nome) e desconto = pct
const item = (market: string, category: string, pct: number, extra: Record<string, unknown> = {}) => {
  n++;
  const palavra = `Produto${String.fromCharCode(97 + (n % 26))}${String.fromCharCode(97 + ((n * 7) % 26))}${String.fromCharCode(97 + ((n * 11) % 26))}`;
  return { id: `${market}:${n}`, market, name: `${palavra} Especial${n}`, brand: null, size: null, price: +(100 * (1 - pct)).toFixed(2), listPrice: 100, category, imageUrl: 'x.jpg', productUrl: null, validUntil: null, _n: '', ...extra } as never;
};

test('farmácia não toma a lista: no máximo 4 e nunca com desconto acima de 40%', () => {
  const farmacia = Array.from({ length: 30 }, (_, i) => item('Farma Conde', 'farmacia', 0.65 - i * 0.005, { segment: 'farmacia' }));
  const farmaciaOk = Array.from({ length: 30 }, (_, i) => item('Drogaria São Paulo', 'farmacia', 0.39 - i * 0.002, { segment: 'farmacia' }));
  const mercado = [
    ...Array.from({ length: 8 }, (_, i) => item('Semar', 'mercearia', 0.3 - i * 0.01)),
    ...Array.from({ length: 5 }, (_, i) => item('Nagumo', 'carnes', 0.25 - i * 0.01)),
    ...Array.from({ length: 5 }, (_, i) => item('Extra', 'laticinios', 0.2 - i * 0.01)),
    ...Array.from({ length: 5 }, (_, i) => item('Coop', 'limpeza', 0.18 - i * 0.01)),
    ...Array.from({ length: 5 }, (_, i) => item('Spani', 'higiene', 0.16 - i * 0.01)),
  ];
  const r = pickOffers([...farmacia, ...farmaciaOk, ...mercado]);
  assert.equal(r.length, 20);
  const f = r.filter(isFarmacia);
  assert.ok(f.length <= MAX_FARMACIA, `farmácia: ${f.length}`);
  assert.ok(f.every((o) => 1 - o.price / o.listPrice! <= DESCONTO_MAX_FARMACIA + 1e-9), 'desconto de farmácia acima do teto');
  assert.ok(new Set(r.map(tipoDe)).size >= 5, 'poucos tipos de produto');
  assert.ok(new Set(r.map((o) => o.market)).size >= 5, 'poucos mercados');
});

test('sem farmácia na base, a lista enche só com o que há; nunca passa de 8 por mercado', () => {
  const so = Array.from({ length: 40 }, (_, i) => item('Semar', 'mercearia', 0.5 - i * 0.005));
  const r = pickOffers(so);
  assert.equal(r.length, 8);
});

test('remédio de receita, desconto por quantidade e item sem foto ficam de fora', () => {
  const lixo = [item('Semar', 'mercearia', 0.4, { rx: 1 }), item('Semar', 'mercearia', 0.4, { condition: 'a partir de 3 un.' }), item('Semar', 'mercearia', 0.4, { imageUrl: null }), item('Semar', 'mercearia', 0.05)];
  assert.equal(pickOffers(lixo).length, 0);
});

test('preço de app do folheto (sem cartão) entra como oferta', () => {
  const app = item('Atacadão', 'mercearia', 0.12, { condition: 'no app' });
  assert.equal(pickOffers([app]).length, 1);
});

test('a ordem final é do maior desconto para o menor', () => {
  const r = pickOffers([item('Semar', 'mercearia', 0.2), item('Nagumo', 'carnes', 0.5), item('Extra', 'limpeza', 0.35)]);
  const d = r.map((o) => 1 - o.price / o.listPrice!);
  assert.deepEqual(d, [...d].sort((a, b) => b - a));
});
