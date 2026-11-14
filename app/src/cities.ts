// Escolha de cidades (lógica pura, sem React). Lista vazia = todas as cidades.

export const DEFAULT_REGION = 'Mauá e Ribeirão Pires';

const strs = (v: unknown[]): string[] => v.filter((x): x is string => typeof x === 'string' && x !== '');

/** Lê o que está guardado: a lista nova ou, se não houver, a cidade única da versão antiga. */
export function migrateCities(rawNew: string | null, rawOld: string | null): string[] {
  const parse = (r: string | null): unknown => { try { return r ? JSON.parse(r) : null; } catch { return null; } };
  const n = parse(rawNew);
  if (Array.isArray(n)) return [...new Set(strs(n))];
  const o = parse(rawOld);
  return typeof o === 'string' && o ? [o] : [];
}

/** Seleção válida: só cidades que existem; marcar todas equivale a não filtrar (lista vazia). */
export function effectiveCities(sel: string[], available: string[]): string[] {
  const ok = [...new Set(sel)].filter((c) => available.includes(c));
  return ok.length === 0 || ok.length >= available.length ? [] : ok;
}

/** Marca ou desmarca uma cidade. */
export function toggleCity(sel: string[], city: string, available: string[]): string[] {
  const next = sel.includes(city) ? sel.filter((c) => c !== city) : [...sel, city];
  return effectiveCities(next, available);
}

/** O mercado entra? (sem filtro, todos entram; mercado sem cidade informada só entra sem filtro) */
export function marketInCities(marketCities: string[] | undefined, sel: string[]): boolean {
  return sel.length === 0 || (marketCities ?? []).some((c) => sel.includes(c));
}

/** Texto do botão: 'Mauá', 'Mauá + 1' ou 'Todas as cidades'. */
export function cityLabel(sel: string[]): string {
  if (sel.length === 0) return 'Todas as cidades';
  return sel.length === 1 ? sel[0] : `${sel[0]} + ${sel.length - 1}`;
}

/** Cidades para o subtítulo: 'Mauá', 'Mauá e Ribeirão Pires', 'A, B e C'. Sem filtro, o texto de sempre. */
export function citiesText(sel: string[]): string {
  if (sel.length === 0) return DEFAULT_REGION;
  if (sel.length === 1) return sel[0];
  return `${sel.slice(0, -1).join(', ')} e ${sel[sel.length - 1]}`;
}
