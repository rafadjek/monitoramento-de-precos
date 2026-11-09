import type { ReactNode } from 'react';
import { brl, brlParts, validity, type Indexed } from '../lib';

const BASE = import.meta.env.BASE_URL;
export const imgSrc = (u: string) => (u.startsWith('http') ? u : BASE + u);

export function Price({ value, big = false }: { value: number; big?: boolean }) {
  const { int, cents } = brlParts(value);
  return (
    <span className="num inline-flex items-start leading-none font-display font-extrabold" aria-label={brl(value)}>
      <span className="mt-[0.35em] text-[0.8rem] font-semibold">R$</span>
      <span className={big ? 'mx-0.5 text-[2.6rem]' : 'mx-0.5 text-[2rem]'}>{int}</span>
      <span className={big ? 'mt-[0.2em] text-xl' : 'mt-[0.15em] text-base'}>{cents}</span>
    </span>
  );
}

export function Thumb({ src, name }: { src: string | null; name: string }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-white sm:h-20 sm:w-20">
      {src ? (
        <img src={imgSrc(src)} alt="" loading="lazy" width={80} height={80} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="font-display text-3xl font-semibold text-line" aria-hidden>{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function Validity({ o }: { o: Pick<Indexed, 'validUntil'> }) {
  const v = validity(o);
  return <span className={v.urgent ? 'font-bold text-signal' : v.known ? 'text-ink' : 'text-muted'}>{v.text}</span>;
}

export function MarketTag({ o, cheapest, diff }: { o: Indexed; cheapest: boolean; diff: number }) {
  const body: ReactNode = (
    <>
      <span className="block text-sm font-bold leading-tight">{o.market}</span>
      <Price value={o.price} big={cheapest} />
      {o.source === 'encarte' && (
        <span className="mt-0.5 block text-[0.7rem] font-bold uppercase tracking-wide">encarte{o.condition ? ` · ${o.condition}` : ''}</span>
      )}
      <span className={`mt-0.5 block text-xs ${cheapest ? 'font-bold' : 'text-muted'}`}>
        {cheapest ? 'mais barato' : `+ ${brl(diff)}`}
      </span>
    </>
  );
  const cls = `block min-w-[7.5rem] px-3 py-2 text-left ${
    cheapest ? 'border-b-4 border-ink bg-tag' : 'border border-line bg-white'
  }`;
  return o.productUrl ? (
    <a href={o.productUrl} target="_blank" rel="noopener noreferrer" className={`${cls} hover:brightness-95`} title={o.source === 'encarte' ? `Ver a página do encarte do ${o.market}` : `Abrir ${o.name} no site do ${o.market}`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
