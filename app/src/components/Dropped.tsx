import { brl, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb } from './Parts';

export type Drop = { id: string; g: string; before: number; pct: number };

// "Baixou esta semana": ofertas que estão mais baratas que o maior preço delas nos 7 dias anteriores
// (calculado no build-site.mjs pelo histórico). Faixa que arrasta para o lado, na abertura do site.
export function Dropped({ drops, byId, onAdd }: { drops: Drop[]; byId: Map<string, Indexed>; onAdd: (o: Indexed) => void }) {
  const list = drops.map((d) => ({ d, o: byId.get(d.id) })).filter((x): x is { d: Drop; o: Indexed } => !!x.o && x.o.price < x.d.before);
  if (list.length < 3) return null;
  return (
    <section className="glass p-3" aria-label="Baixou esta semana">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Icon name="down" className="h-6 w-6 text-neon" />Baixou esta semana</h2>
      <p className="text-xs text-muted">Mais barato que na semana passada, no mesmo mercado.</p>
      <ul className="tags-row -mx-3 mt-2 flex snap-x gap-2.5 overflow-x-auto pb-1 pl-3 pr-8">
        {list.map(({ d, o }) => (
          <li key={o.id} className="relative flex w-36 shrink-0 snap-start flex-col rounded-xl bg-white p-2 text-night">
            <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-md bg-neon px-1.5 py-0.5 text-[0.7rem] font-bold text-night">
              <Icon name="down" className="h-3 w-3" />{Math.round(d.pct * 100)}%
            </span>
            <div className="flex justify-center"><Thumb src={o.imageUrl} name={o.name} size={72} /></div>
            <p className="mt-1 line-clamp-2 text-[0.75rem] font-bold leading-tight">{o.name}</p>
            <div className="mt-1"><MarketLogo name={o.market} h="h-5" /></div>
            <div className="mt-auto flex items-end justify-between pt-1">
              <span>
                <s className="num block text-[0.65rem] text-[#7b8399]" title="maior preço nos 7 dias anteriores">{brl(d.before)}</s>
                <Price value={o.price} size="sm" className="text-night" />
              </span>
              <button onClick={() => onAdd(o)} aria-label="Pôr na lista" className="rounded-lg bg-neon p-1.5 text-night hover:brightness-110"><Icon name="cart" className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
