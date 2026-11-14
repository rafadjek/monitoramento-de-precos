// Números reais da página de venda, lidos dos dados já publicados (data/index.json). Nada inventado:
// se a leitura falhar, a página some com a faixa de números em vez de mostrar valor chutado.
export type SiteStats = { markets: number; products: number; groups: number; updated: string };

type Idx = { generatedAt?: unknown; groups?: unknown; markets?: { products?: unknown }[] };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function parseStats(idx: unknown): SiteStats | null {
  const i = (idx ?? {}) as Idx;
  if (!Array.isArray(i.markets)) return null;
  const withData = i.markets.map((m) => num(m?.products) ?? 0).filter((p) => p > 0);
  const groups = num(i.groups);
  const t = typeof i.generatedAt === 'string' ? new Date(i.generatedAt) : null;
  if (!withData.length || groups === null || !t || Number.isNaN(t.getTime())) return null;
  return { markets: withData.length, products: withData.reduce((a, b) => a + b, 0), groups, updated: t.toLocaleDateString('pt-BR') };
}

export async function loadStats(base: string): Promise<SiteStats | null> {
  try {
    const r = await fetch(`${base}data/index.json`);
    return r.ok ? parseStats(await r.json()) : null;
  } catch {
    return null;
  }
}
