// Menor preço que não exige cartão da loja. A condição traz "R$ 4,49 no app Meu Assaí",
// "R$ 23,90 a partir de 2 un.", "R$ 9,90 no pix". App ou clube com CPF, pix, quantidade e cooperado
// contam (só pedem CPF ou nada); cartão próprio da loja não conta e fica só como observação.
const brNum = (t) => parseFloat(t.replace(/\./g, '').replace(',', '.'));
export function bestPrice(price, condition) {
  if (!condition) return { price, listPrice: null, condition: null };
  const c = String(condition).trim();
  const m = c.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const alt = m ? brNum(m[1]) : null;
  const rest = m ? c.replace(m[0], '').replace(/\s+/g, ' ').trim() : c;
  const card = /cart[aã]o/i.test(c);
  const perKilo = /\b(o quilo|por kg|o kg|\/kg)\b/i.test(c);
  if (alt && alt < price && !card && !perKilo) return { price: alt, listPrice: price, condition: rest.toLowerCase() };
  if (card && alt) return { price, listPrice: null, condition: 'R$ ' + m[1] + ' ' + rest.toLowerCase() + ' (só com o cartão)' };
  return { price, listPrice: null, condition: c.toLowerCase() };
}
