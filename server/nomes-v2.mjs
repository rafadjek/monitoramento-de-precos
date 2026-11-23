// Regra v2 de "mesmo produto pelo nome" (Fase 17.4). Para duas ofertas da mesma marca e do mesmo tamanho:
//  1) as palavras que sobram de cada lado (depois de tolerar abreviação e erro de uma letra) precisam ser todas neutras;
//  2) nenhuma palavra de variante (sabor, cor, light/zero, versão) pode estar na diferença, nem de um lado só;
//  3) embalagem diferente (lata x garrafa x sachê) ou forma diferente (líquido x pó x barra) separa;
//  4) o preço não pode estar muito distante.
// Sem IA e sem aprendizado diário: as listas abaixo foram curadas à mão com o gabarito de EAN e os rótulos do Rafael
// (tools/gabarito.mjs) e só mudam por decisão.
import { GRUPOS_VARIACAO } from './variacao.mjs';

// Palavras que só descrevem o produto (valem as de SOFT em group.mjs e estas).
export const NEUTRAS_V2 = new Set([
  'sabor', 'semola', 'cremoso', 'cremosa', 'congelado', 'congelada', 'roupa', 'massa', 'brasileiro', 'classic', 'uht', 'nacional',
  // embalagem (separadas por classe em EMBALAGEM abaixo). Decisão do Rafael: lata e sachê de um lado só NÃO são neutros
  // (Nescau lata x sachê são produtos diferentes); garrafa, pet e vidro são, com squeeze e copo.
  'squeeze', 'copo', 'garrafa', 'pet', 'vidro',
  // forma (separadas por classe em FORMA)
  'liquido', 'liquida',
]);

// Embalagem: palavra -> classe. Duas classes diferentes, uma de cada lado, separam. Garrafa, pet e vidro são a mesma classe (decisão do Rafael).
const EMBALAGEM = { lata: 'lata', garrafa: 'garrafa', pet: 'garrafa', vidro: 'garrafa', sache: 'sache', squeeze: 'squeeze', tubo: 'tubo', pouch: 'pouch', copo: 'copo', caixa: 'caixa', pote: 'pote' };
// Forma do produto (detergente líquido x em pó x em barra x gel x spray)
const FORMA = { liquido: 'liquido', liquida: 'liquido', po: 'po', barra: 'barra', gel: 'gel', spray: 'spray', creme: 'creme', espuma: 'espuma' };

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// variantes: tudo que as listas do juiz tratam como sabor/versão (só as palavras soltas), mais cores, "frutas vermelhas" etc.
const VARIANTES = new Set([
  ...GRUPOS_VARIACAO.flatMap((g) => g.flatMap((v) => v.split(' '))),
  'gas', 'sal', 'sem', 'acucar', 'lactose', 'gluten',
  'fruta', 'vermelha', 'vermelho', 'amarela', 'amarelo', 'verde', 'azul', 'preto', 'preta', 'branco', 'branca', 'rosa', 'rose', 'tinto', 'dourado', 'prata',
  'intense', 'forte', 'suave', 'extraforte', 'descafeinado', 'dark', 'picante', 'apimentado', 'defumado', 'defumada', 'temperado', 'temperada',
  'infantil', 'baby', 'plus', 'max', 'pro', 'ultra', 'kids', 'adulto', 'filhote', 'castrado',
]);

const lev = (a, b) => {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
};
// abreviação ("rech" x "recheado") ou erro de uma letra em palavra de 5+ letras
export const parecida = (t, u) => t === u || (t.length >= 4 && u.length >= 4 && (u.startsWith(t) || t.startsWith(u))) || (t.length >= 5 && u.length >= 5 && lev(t, u) <= 1);

/** Palavras que sobram de cada lado depois de casar as parecidas. */
export function diferenca(ca, cb) {
  const A = [...ca].filter((t) => !cb.has(t)), B = [...cb].filter((t) => !ca.has(t));
  const restoB = new Set(B), soA = [];
  for (const t of A) { const m = [...restoB].find((u) => parecida(t, u)); if (m) restoB.delete(m); else soA.push(t); }
  return { a: soA, b: [...restoB] };
}

const classes = (palavras, mapa) => new Set(palavras.map((w) => mapa[w]).filter(Boolean));
const separam = (ca, cb) => ca.size > 0 && cb.size > 0 && ![...ca].some((c) => cb.has(c));

/**
 * @param {Set<string>} ca palavras do nome A (signature().core, sem acento, no singular)
 * @param {Set<string>} cb palavras do nome B
 * @param {Set<string>} soft palavras neutras de group.mjs (SOFT)
 * @param {number} pa preço de A
 * @param {number} pb preço de B
 */
export function pareQuaseIgualV2(ca, cb, soft, pa, pb) {
  const { a, b } = diferenca(ca, cb);
  const todas = a.concat(b);
  const razao = pa > 0 && pb > 0 ? Math.max(pa, pb) / Math.min(pa, pb) : 1;
  if (!todas.length) return razao <= 2; // nomes iguais depois de tolerar abreviação: só o preço pode desconfiar
  if (todas.some((t) => VARIANTES.has(t) || /^\d+$/.test(t) && t !== '1')) return false; // variante de sabor, cor, versão ou número
  if (!todas.every((t) => soft.has(t) || NEUTRAS_V2.has(t))) return false;
  if (separam(classes(a, EMBALAGEM), classes(b, EMBALAGEM))) return false;
  if (separam(classes(a, FORMA), classes(b, FORMA))) return false;
  return razao <= 1.5;
}

void strip;
