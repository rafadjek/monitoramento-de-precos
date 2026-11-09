// Código de barras (EAN/GTIN) como chave exata de produto entre mercados.
// Devolve o GTIN-14 normalizado, ou null quando o código não serve para comparar:
// dígito verificador errado, tamanho estranho, ou código interno de loja (prefixo 2: balança e uso interno,
// cada mercado usa o seu).

const checkDigitOk = (d) => {
  let sum = 0;
  for (let i = 0; i < d.length - 1; i++) sum += Number(d[d.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d.at(-1));
};

export function normalizeEan(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d) || !checkDigitOk(d)) return null;
  const g14 = d.padStart(14, '0');
  const g13 = g14.slice(1);
  if (d.length !== 8 && g13.startsWith('2')) return null; // código interno de loja
  return g14;
}
