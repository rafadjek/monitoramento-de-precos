// Busca tolerante: ignora acento, caixa, hífen e espaço ("cocacola" acha "Coca-Cola"),
// entende sinônimos comuns de mercado e aceita um erro de digitação em palavras de 5 letras ou mais.
import { SYNONYMS } from './synonyms.ts';

// texto só com letras e números, palavras separadas por um espaço
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type Haystack = { text: string; joined: string; words: string[] };
export const haystack = (s: string): Haystack => {
  const text = fold(s);
  return { text: ` ${text} `, joined: text.replace(/ /g, ''), words: [...new Set(text.split(' '))] };
};

// uma edição no máximo (troca, falta, sobra ou duas letras vizinhas invertidas)
export function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // troca
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // inversão
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// cada termo da busca vira uma lista de alternativas (sinônimos); basta uma bater
export type Term = { alts: string[]; fuzzy: boolean };
export function parseQuery(q: string): Term[] {
  let s = ` ${fold(q)} `;
  const terms: Term[] = [];
  // frases de sinônimos primeiro ("sabao em po"), depois palavras soltas
  for (const [key, alts] of SYNONYMS) {
    if (!key.includes(' ')) continue;
    if (s.includes(` ${key} `)) { terms.push({ alts: [key, ...alts], fuzzy: false }); s = s.replace(` ${key} `, ' '); }
  }
  const single = new Map(SYNONYMS.filter(([k]) => !k.includes(' ')));
  for (const w of s.trim().split(' ').filter(Boolean)) terms.push({ alts: [w, ...(single.get(w) ?? [])], fuzzy: w.length >= 5 });
  return terms;
}

// 0 = não acha; 1 = acha exato; 2 = acha só com erro de digitação (vai para o fim da lista)
export function match(h: Haystack, terms: Term[]): 0 | 1 | 2 {
  let level: 1 | 2 = 1;
  for (const t of terms) {
    if (t.alts.some((a) => h.text.includes(a.includes(' ') ? ` ${a}` : a))) continue;
    if (!t.alts[0].includes(' ') && t.alts[0].length >= 4 && h.joined.includes(t.alts[0])) continue; // "cocacola"
    const w0 = t.alts[0];
    // erro de digitação: compara com a palavra inteira ou com o começo dela (busca enquanto digita)
    if (t.fuzzy && h.words.some((w) => oneEdit(w0, w) || (w.length > w0.length && oneEdit(w0, w.slice(0, w0.length))))) { level = 2; continue; }
    return 0;
  }
  return level;
}
