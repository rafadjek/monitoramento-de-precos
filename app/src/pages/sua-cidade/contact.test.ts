// Teste do contato da página de venda: node --test src/pages/sua-cidade/contact.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, mailLink, validateLead, waLink, PROFILES, PLANS } from './contact.ts';

const ok = { nome: 'Ana', cidade: 'Santo André', perfil: PROFILES[0], plano: PLANS[1], mensagem: 'Quero 8 mercados & feira' };

test('link do WhatsApp usa o número autorizado e codifica o texto', () => {
  const u = new URL(waLink(buildMessage(ok)));
  assert.equal(u.origin + u.pathname, 'https://wa.me/5511943016366');
  const t = u.searchParams.get('text')!;
  assert.match(t, /Nome: Ana/);
  assert.match(t, /Cidade: Santo André/);
  assert.match(t, /Plano de interesse: Cidade Pro/);
  assert.match(t, /Quero 8 mercados & feira/);
});

test('e-mail alternativo leva a mesma mensagem', () => {
  const l = mailLink(buildMessage(ok));
  assert.ok(l.startsWith('mailto:rcarto@gmail.com?subject='));
  assert.ok(decodeURIComponent(l).includes('Cidade: Santo André'));
});

test('validação pede nome, cidade, perfil e plano', () => {
  assert.deepEqual(validateLead(ok), {});
  const e = validateLead({ nome: '', cidade: ' ', perfil: '', plano: '', mensagem: '' });
  assert.deepEqual(Object.keys(e).sort(), ['cidade', 'nome', 'perfil', 'plano']);
  assert.ok(validateLead({ ...ok, mensagem: 'x'.repeat(601) }).mensagem);
});

test('sem mensagem, a linha de mensagem não aparece', () => {
  assert.ok(!buildMessage({ ...ok, mensagem: '  ' }).includes('Mensagem:'));
});
