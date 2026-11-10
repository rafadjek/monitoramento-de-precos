export type Offer = {
  id: string;
  market: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number;
  listPrice: number | null;
  unitPrice: string | null;
  category: string;
  imageUrl: string | null;
  productUrl: string | null;
  validUntil: string | null;
  validityNote: string | null;
  source?: 'encarte';
  condition?: string | null;
  units?: number; // caixa/fardo: quantas unidades vêm
  g?: string;
};

export type Indexed = Offer & { _n: string };

export type Group = {
  id: string;
  name: string;
  size: string | null;
  image: string | null;
  category: string;
  items: Indexed[]; // um por mercado, do mais barato ao mais caro
  saving: number;
  savingPct: number;
  perUnit: boolean; // embalagens com quantidades diferentes: compara pelo preço de cada unidade
  odd: string[]; // ids com preço fora do padrão (provável caixa sem quantidade no nome, ou erro no site)
  suspect: boolean; // só 2 mercados e preços muito distantes: não dá para saber qual está certo
  _n: string;
};

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function brlParts(n: number) {
  const [int, cents] = n.toFixed(2).split('.');
  return { int: Number(int).toLocaleString('pt-BR'), cents };
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function validity(o: Pick<Offer, 'validUntil'>) {
  if (!o.validUntil) return { text: 'validade não informada', urgent: false, known: false };
  const d = new Date(o.validUntil);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const when = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  if (days <= 0) return { text: `vence hoje (${when})`, urgent: true, known: true };
  if (days === 1) return { text: `vence amanhã (${when})`, urgent: true, known: true };
  return { text: `vale até ${when}`, urgent: false, known: true };
}

// Preço de cada unidade (caixa com 36 por R$ 49,90 = R$ 1,39 cada).
export const each = (o: Pick<Offer, 'price' | 'units'>) => o.price / (o.units ?? 1);
const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
// Mais de 2,5 vezes (ou menos de 1/2,5) do preço dos outros: fora do padrão.
const FAR = 2.5;

export function buildGroups(all: Indexed[]): Group[] {
  const byG = new Map<string, Indexed[]>();
  // produto que só um mercado tem também entra, sozinho no próprio grupo
  for (const o of all) { const k = o.g ?? `p:${o.id}`; (byG.get(k) ?? byG.set(k, []).get(k)!).push(o); }
  const out: Group[] = [];
  for (const [id, list] of byG) {
    const perMarket = new Map<string, Indexed>();
    for (const o of list) {
      const cur = perMarket.get(o.market);
      if (!cur || each(o) < each(cur)) perMarket.set(o.market, o);
    }
    let items = [...perMarket.values()].sort((a, b) => each(a) - each(b));
    const odd = new Set<string>();
    if (items.length >= 3) {
      for (const it of items) {
        const m = median(items.filter((x) => x !== it).map(each));
        const r = each(it) / m;
        if (r > FAR || r < 1 / FAR) odd.add(it.id);
      }
    }
    const suspect = items.length === 2 && each(items[1]) / each(items[0]) > FAR;
    // fora do padrão vai para o fim e não conta na economia
    items = [...items.filter((i) => !odd.has(i.id)), ...items.filter((i) => odd.has(i.id))];
    const fair = suspect ? [] : items.filter((i) => !odd.has(i.id));
    const max = fair.length >= 2 ? each(fair[fair.length - 1]) : 0;
    const saving = fair.length >= 2 ? max - each(fair[0]) : 0;
    const label = [...items].sort((a, b) => a.name.length - b.name.length)[0];
    out.push({
      id,
      name: label.name,
      size: label.size,
      image: items.find((i) => i.imageUrl)?.imageUrl ?? null,
      category: items[0].category,
      items,
      saving,
      savingPct: max > 0 ? saving / max : 0,
      perUnit: new Set(items.map((i) => i.units ?? 1)).size > 1,
      odd: [...odd],
      suspect,
      _n: items.map((i) => i._n).join(' '),
    });
  }
  return out;
}
