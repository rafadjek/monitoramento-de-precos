// Data de publicação de um post do Instagram a partir do código da URL (/p/<código>/).
// O código é o id do post em base 64; os bits altos do id guardam os milissegundos desde 2011-08-24.
// Serve quando o serviço de leitura não devolve a data do post (caso do Crawlbase).
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const EPOCA_MS = 1314220021721;

export function dataDoCodigo(codigo) {
  const c = String(codigo || '').slice(0, 11);
  if (c.length < 10) return null;
  let n = 0n;
  for (const ch of c) {
    const i = ALFABETO.indexOf(ch);
    if (i < 0) return null;
    n = n * 64n + BigInt(i);
  }
  const ms = Number(n >> 23n) + EPOCA_MS;
  // fora de 2015 até amanhã = código que não é de post
  if (!(ms > Date.parse('2015-01-01') && ms < Date.now() + 86400e3)) return null;
  return new Date(ms).toISOString();
}
