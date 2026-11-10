import { useMemo } from 'react';
import { brl, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb } from './Parts';

// Maiores descontos de verdade (preço "de" riscado contra o atual), no máximo 2 por mercado, sem preço por quantidade.
export function pickOffers(all: Indexed[], n = 6): Indexed[] {
  const real = all.filter((o) => o.listPrice && o.listPrice > o.price && !(o.condition && /levando|a partir|leve \d|cart[aã]o/i.test(o.condition)) && o.imageUrl);
  const off = (o: Indexed) => 1 - o.price / o.listPrice!;
  const out: Indexed[] = [];
  const per = new Map<string, number>();
  const seen = new Set<string>();
  for (const o of real.filter((x) => off(x) >= 0.1 && off(x) <= 0.7).sort((a, b) => off(b) - off(a))) {
    const key = o.g ?? o.name.toLowerCase();
    if (seen.has(key) || (per.get(o.market) ?? 0) >= 2) continue;
    seen.add(key);
    per.set(o.market, (per.get(o.market) ?? 0) + 1);
    out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

export function Offers({ offers, onAdd }: { offers: Indexed[]; onAdd: (o: Indexed) => void }) {
  const list = useMemo(() => offers, [offers]);
  if (!list.length) return null;
  return (
    <section id="ofertas" className="glass p-4" aria-label="Ofertas do dia">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Icon name="flame" className="h-7 w-7 text-fire" fill />Ofertas do Dia</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {list.map((o) => {
          const pct = Math.round((1 - o.price / o.listPrice!) * 100);
          return (
            <li key={o.id} className="relative flex flex-col rounded-xl bg-white p-2 text-night">
              <span className="absolute right-2 top-2 rounded-md bg-signal px-1.5 py-0.5 text-[0.7rem] font-bold text-white">-{pct}%</span>
              <div className="flex justify-center"><Thumb src={o.imageUrl} name={o.name} size={72} /></div>
              <p className="mt-1 line-clamp-2 text-[0.75rem] font-bold leading-tight">{o.name}</p>
              <div className="mt-1"><MarketLogo name={o.market} h="h-5" /></div>
              <div className="mt-auto flex items-end justify-between pt-1">
                <span>
                  <s className="num block text-[0.65rem] text-[#7b8399]">{brl(o.listPrice!)}</s>
                  <Price value={o.price} size="sm" className="text-night" />
                </span>
                <button onClick={() => onAdd(o)} aria-label="Pôr na lista" className="rounded-lg bg-neon p-1.5 text-night hover:brightness-110"><Icon name="cart" className="h-4 w-4" /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
