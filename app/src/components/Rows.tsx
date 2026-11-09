import { brl, type Group, type Indexed } from '../lib';
import { MarketTag, Price, Thumb, Validity } from './Parts';

export function GroupRow({ g }: { g: Group }) {
  const best = g.items[0];
  return (
    <li className="flex gap-3 border-b border-line py-4">
      <Thumb src={g.image} name={g.name} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold leading-snug">{g.name}</h3>
        <p className="mt-0.5 text-sm text-muted">
          Economize <b className="text-ink">{brl(g.saving)}</b> ({Math.round(g.savingPct * 100)}%) comprando no {best.market}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {g.items.map((it, i) => (
            <li key={it.id}>
              <MarketTag o={it} cheapest={i === 0} diff={it.price - best.price} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {best.validUntil ? (
            <>
              <Validity o={best} /> no {best.market}
            </>
          ) : (
            `${best.market} não informa até quando vale`
          )}
        </p>
      </div>
    </li>
  );
}

export function OfferRow({ o, onCompare }: { o: Indexed; onCompare?: () => void }) {
  const off = o.listPrice && o.listPrice > o.price ? Math.round((1 - o.price / o.listPrice) * 100) : 0;
  return (
    <li className="flex gap-3 border-b border-line py-3">
      <Thumb src={o.imageUrl} name={o.name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-muted">{o.market}</p>
        <h3 className="text-base leading-snug">
          {o.productUrl ? (
            <a href={o.productUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-ink">
              {o.name}
            </a>
          ) : (
            o.name
          )}
        </h3>
        <p className="mt-0.5 text-xs">
          <Validity o={o} />
          {o.source === 'encarte' && o.productUrl && (
            <>
              {' · '}
              <a href={o.productUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">ver no encarte</a>
            </>
          )}
        </p>
        {o.condition && <p className="mt-0.5 text-xs font-bold text-signal">{o.condition}</p>}
        {o.g && onCompare && (
          <button onClick={onCompare} className="mt-1 min-h-[2.25rem] text-sm font-bold underline underline-offset-2">
            Comparar com outros mercados
          </button>
        )}
      </div>
      <div className="shrink-0 text-right">
        {off > 0 && o.listPrice && (
          <p className="num text-xs text-muted">
            <s>{brl(o.listPrice)}</s> <b className="text-signal">-{off}%</b>
          </p>
        )}
        <Price value={o.price} big />
      </div>
    </li>
  );
}

export function SkeletonRows() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex gap-3 border-b border-line py-4">
          <div className="h-16 w-16 shrink-0 bg-line/60 sm:h-20 sm:w-20" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-line/60" />
            <div className="h-3 w-1/2 bg-line/60" />
            <div className="h-10 w-40 bg-line/60" />
          </div>
        </li>
      ))}
    </ul>
  );
}
