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

/** Seleção válida: só cidades que existem. Lista vazia = todas (as duas formas filtram igual). */
export function effectiveCities(sel: string[], available: string[]): string[] {
  return [...new Set(sel)].filter((c) => available.includes(c));
}

/** Lista vazia ou com todas as cidades = sem filtro. */
export function isAll(sel: string[], available: string[]): boolean {
  return sel.length === 0 || available.every((c) => sel.includes(c));
}

/** Marca ou desmarca uma cidade. Com "todas" valendo, as caixinhas aparecem todas marcadas:
 *  desmarcar uma deixa as outras. Desmarcar a última volta para "todas". */
export function toggleCity(sel: string[], city: string, available: string[]): string[] {
  const base = sel.length === 0 ? available : sel;
  const next = base.includes(city) ? base.filter((c) => c !== city) : [...base, city];
  return effectiveCities(next, available);
}

/** O mercado entra? (sem filtro, todos entram; mercado sem cidade informada só entra sem filtro) */
export function marketInCities(marketCities: string[] | undefined, sel: string[]): boolean {
  return sel.length === 0 || (marketCities ?? []).some((c) => sel.includes(c));
}

/** Texto do botão: 'Mauá', 'Mauá + 1' ou 'Todas as cidades'. */
export function cityLabel(sel: string[], total = 0): string {
  if (sel.length === 0 || (total > 0 && sel.length >= total)) return 'Todas as cidades';
  return sel.length === 1 ? sel[0] : `${sel[0]} + ${sel.length - 1}`;
}

/** Cidades para o subtítulo: 'Mauá', 'Mauá e Ribeirão Pires', 'A, B e C'. Sem filtro, o texto de sempre. */
export function citiesText(sel: string[]): string {
  if (sel.length === 0) return DEFAULT_REGION;
  if (sel.length === 1) return sel[0];
  return `${sel.slice(0, -1).join(', ')} e ${sel[sel.length - 1]}`;
}
