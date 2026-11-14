import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeEvent, endLabel, EVENTS, PLANS_DATA, promoText, shownPrice } from './content.ts';

const bf = EVENTS[0];

test('Black Friday ativa de 14/11 a 30/11 (23:59 em Brasília)', () => {
  assert.equal(activeEvent(new Date('2026-11-13T23:59:59-03:00')), null);
  assert.equal(activeEvent(new Date('2026-11-14T00:00:00-03:00'))?.id, 'black-friday');
  assert.equal(activeEvent(new Date('2026-11-25T12:00:00-03:00'))?.id, 'black-friday');
  assert.equal(activeEvent(new Date('2026-11-30T23:59:00-03:00'))?.id, 'black-friday');
  assert.equal(activeEvent(new Date('2026-12-01T00:00:00-03:00')), null);
  assert.equal(activeEvent(new Date('2027-03-01T12:00:00-03:00')), null);
});

test('data inválida ou lista vazia não ativa nada', () => {
  assert.equal(activeEvent(new Date('x')), null);
  assert.equal(activeEvent(new Date('2026-11-20T12:00:00-03:00'), []), null);
});

test('rótulo do fim da oferta', () => assert.equal(endLabel(bf), '30/11'));

test('preço mostrado: promocional com evento, normal sem', () => {
  const start = PLANS_DATA[0];
  assert.deepEqual(shownPrice(start, bf), { setup: '790', monthly: '67', promo: true, oldSetup: '1.490', oldMonthly: '97' });
  assert.deepEqual(shownPrice(PLANS_DATA[2], bf), { setup: '3.900', monthly: '297', promo: true, oldSetup: '5.900', oldMonthly: '397' });
  const n = shownPrice(start, null);
  assert.equal(n.promo, false);
  assert.equal(n.setup, '1.490');
  assert.equal(n.monthly, '97');
});

test('texto do WhatsApp cita evento e preço promocional', () => {
  assert.equal(promoText('Cidade Pro', null), '');
  const t = promoText('Cidade Pro', bf);
  assert.match(t, /Black Friday/);
  assert.match(t, /30\/11/);
  assert.match(t, /R\$ 1\.490 \+ R\$ 127/);
  assert.match(promoText('Rede / Entidade', bf), /a partir de R\$ 3\.900 \+ R\$ 297/);
  assert.equal(promoText('Ainda não sei', bf), 'Vi a oferta Black Friday (até 30/11).');
});
