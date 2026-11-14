// Escolha de cidades (lógica pura, sem React).
// Seleção: null = todas as cidades (padrão); lista explícita = só essas; lista vazia = nenhuma.

export const DEFAULT_REGION = 'Mauá e Ribeirão Pires';
export type Sel = string[] | null;

const strs = (v: unknown[]): string[] => [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))];
const parse = (r: string | null): unknown => { try { return r ? JSON.parse(r) : null; } catch { return null; } };

/** O que gravar na chave nova 'bate-cidades2' (null vira 'todas'). */
export function serializeCities(sel: Sel): string {
  return sel === null ? 'todas' : JSON.stringify(sel);
}

/** Lê o que está guardado: chave nova; senão a 'bate-cidades' (lá [] significava todas); senão a 'bate-cidade' (texto único). */
export function migrateCities(raw2: string | null, raw1: string | null = null, raw0: string | null = null): Sel {
  if (raw2 !== null) {
    if (raw2 === 'todas') return null;
    const n = parse(raw2);
    return Array.isArray(n) ? strs(n) : null;
  }
  const a = parse(raw1);
  if (Array.isArray(a)) { const l = strs(a); return l.length ? l : null; }
  const o = parse(raw0);
  return typeof o === 'string' && o ? [o] : null;
}

/** Seleção válida: só cidades que existem; se cobrir todas as disponíveis, vira null. */
export function effectiveCities(sel: Sel, available: string[]): Sel {
  if (sel === null) return null;
  if (available.length === 0) return sel;
  const e = strs(sel).filter((c) => available.includes(c));
  return available.every((c) => e.includes(c)) ? null : e;
}

/** Todas marcadas? */
export function isAll(sel: Sel, available: string[]): boolean {
  return sel === null || (available.length > 0 && available.every((c) => sel.includes(c)));
}

/** A cidade está marcada? */
export function isChecked(sel: Sel, city: string): boolean {
  return sel === null || sel.includes(city);
}

/** Marca ou desmarca uma cidade, em qualquer ordem. A última desmarcada deixa nenhuma. */
export function toggleCity(sel: Sel, city: string, available: string[]): Sel {
  const base = sel ?? available;
  const next = base.includes(city) ? base.filter((c) => c !== city) : [...base, city];
  return effectiveCities(next, available);
}

/** Caixinha "Todas": se já estava tudo marcado, desmarca tudo; senão marca tudo. */
export function toggleAll(sel: Sel, available: string[]): Sel {
  return isAll(sel, available) ? [] : null;
}

/** O mercado entra? (null = todos entram; lista vazia = nenhum) */
export function marketInCities(marketCities: string[] | undefined, sel: Sel): boolean {
  return sel === null || (marketCities ?? []).some((c) => sel.includes(c));
}

/** Texto do botão: 'Todas as cidades', 'Mauá', 'Mauá + 1' ou 'Nenhuma cidade'. */
export function cityLabel(sel: Sel, total = 0): string {
  if (sel === null || (total > 0 && sel.length >= total)) return 'Todas as cidades';
  if (sel.length === 0) return 'Nenhuma cidade';
  return sel.length === 1 ? sel[0] : `${sel[0]} + ${sel.length - 1}`;
}

/** Cidades para o subtítulo: 'Mauá', 'Mauá e Ribeirão Pires', 'A, B e C'. */
export function citiesText(sel: Sel): string {
  if (sel === null) return DEFAULT_REGION;
  if (sel.length === 0) return 'nenhuma cidade';
  if (sel.length === 1) return sel[0];
  return `${sel.slice(0, -1).join(', ')} e ${sel[sel.length - 1]}`;
}
