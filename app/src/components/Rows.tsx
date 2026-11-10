import { brl, each, type Group } from '../lib';
import { MarketTag, Thumb, Validity } from './Parts';

export function GroupRow({ g }: { g: Group }) {
  const best = g.items[0];
  const alone = g.items.length === 1;
  return (
    <li className="flex gap-3 border-b border-line py-4">
      <Thumb src={g.image} name={g.name} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold leading-snug">{g.name}</h3>
        <p className="mt-0.5 text-sm text-muted">
          {alone ? (
            `Por enquanto só achei no ${best.market}`
          ) : g.suspect ? (
            <b className="text-signal">Preços muito diferentes: um deles pode ser caixa ou fardo. Confira no site.</b>
          ) : g.saving > 0 ? (
            <>
              Economize <b className="text-ink">{brl(g.saving)}</b>{g.perUnit ? ' em cada unidade' : ''} ({Math.round(g.savingPct * 100)}%) comprando no {best.market}
            </>
          ) : (
            `Mesmo preço em ${g.items.length - g.odd.length} mercados`
          )}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {g.items.map((it, i) => (
            <li key={it.id}>
              <MarketTag
                o={it}
                cheapest={i === 0 && !g.suspect}
                diff={each(it) - each(best)}
                alone={alone || g.suspect}
                perUnit={g.perUnit}
                odd={g.odd.includes(it.id)}
              />
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
