// Regras de farmácia e comércio de bairro (lógica pura, sem React; testada em pharma.test.ts).

export type Segment = 'farmacia' | 'bairro';
export type SegInfo = { name: string; segment?: Segment };

export const RX_AVISO = 'Venda sob prescrição médica';

/** Remédio de venda sob prescrição: aparece com preço, mas nunca como oferta ou destaque. */
export const isRx = (o: { rx?: unknown }) => !!o.rx;

/** Tira da lista o que não pode virar destaque de oferta (remédio de receita). */
export const semReceita = <T extends { rx?: unknown }>(all: T[]): T[] => all.filter((o) => !isRx(o));

/** Mercados que carregam na primeira tela (todos menos farmácia) e os que carregam depois, em segundo plano. */
export function splitLoad<T extends SegInfo>(markets: T[]): { first: T[]; later: T[] } {
  return { first: markets.filter((m) => m.segment !== 'farmacia'), later: markets.filter((m) => m.segment === 'farmacia') };
}

const GROUPS: { id: string; title: string; segment?: Segment }[] = [
  { id: 'mercado', title: 'Supermercados' },
  { id: 'farmacia', title: 'Farmácias', segment: 'farmacia' },
  { id: 'bairro', title: 'Comércio de bairro', segment: 'bairro' },
];

/** Agrupa nomes de mercado (já ordenados) por segmento, na ordem: supermercados, farmácias, comércio de bairro. Grupo vazio some. */
export function groupBySegment(names: string[], markets: SegInfo[]): { id: string; title: string; names: string[] }[] {
  const seg = new Map(markets.map((m) => [m.name, m.segment]));
  return GROUPS.map((g) => ({ id: g.id, title: g.title, names: names.filter((n) => seg.get(n) === g.segment) })).filter((g) => g.names.length > 0);
}
