// Trava de variação: dois nomes que dizem sabor ou versão diferentes são produtos diferentes.
// Usada pelo juiz de IA (para não gastar cota) e pelo agrupamento por nome (group.mjs).
// (strip repetido aqui de propósito: group.mjs importa este módulo e não pode haver ciclo)
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Filtro de regra antes do juiz (não gasta cota): os dois nomes dizem sabor ou versão, e são diferentes.
// Só vale quando OS DOIS lados dizem algo; um lado calado é dúvida e vai para o juiz. Encarte "sabores/diversos" nunca cai aqui.
// Cada grupo é comparado à parte: sabor com sabor, versão do leite com versão do leite etc.
export const GRUPOS_VARIACAO = [
  ['morango', 'uva', 'laranja', 'limao', 'chocolate', 'baunilha', 'coco', 'abacaxi', 'maracuja', 'pessego', 'framboesa',
    'menta', 'hortela', 'cereja', 'banana', 'maca', 'manga', 'goiaba', 'caju', 'acerola', 'tangerina', 'melancia', 'amendoim', 'avela',
    'caramelo', 'frango', 'carne', 'presunto', 'calabresa', 'bacon', 'cebola', 'picanha', 'costela', 'camarao', 'atum', 'sardinha'],
  ['integral', 'desnatado', 'semidesnatado'],
  ['sem gas', 'com gas'],
  ['sem sal', 'com sal'],
  ['zero', 'light', 'diet'],
];
const norm = (nome) => ' ' + strip(nome).replace(/[^a-z0-9]+/g, ' ').replace(/ semi desnatad/g, ' semidesnatad') + ' ';
export function conflitoDeRegra(nomeA, nomeB) {
  if (/\bsabores\b|divers|varios|sortid/i.test(strip(nomeA + ' ' + nomeB))) return false;
  const na = norm(nomeA), nb = norm(nomeB);
  return GRUPOS_VARIACAO.some((g) => {
    const a = g.filter((v) => na.includes(' ' + v + ' ')), b = g.filter((v) => nb.includes(' ' + v + ' '));
    return a.length && b.length && (a.length !== b.length || a.some((v) => !b.includes(v)));
  });
}

