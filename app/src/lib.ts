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

export function buildGroups(all: Indexed[]): Group[] {
  const byG = new Map<string, Indexed[]>();
  // produto que só um mercado tem também entra, sozinho no próprio grupo
  for (const o of all) { const k = o.g ?? `p:${o.id}`; (byG.get(k) ?? byG.set(k, []).get(k)!).push(o); }
  const out: Group[] = [];
  for (const [id, list] of byG) {
    const perMarket = new Map<string, Indexed>();
    for (const o of list) {
      const cur = perMarket.get(o.market);
      if (!cur || o.price < cur.price) perMarket.set(o.market, o);
    }
    const items = [...perMarket.values()].sort((a, b) => a.price - b.price);
    const max = items[items.length - 1].price;
    const saving = max - items[0].price;
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
      _n: items.map((i) => i._n).join(' '),
    });
  }
  return out;
}
