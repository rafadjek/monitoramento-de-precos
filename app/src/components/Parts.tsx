import type { ReactNode } from 'react';
import { brl, brlParts, each, validity, type Indexed } from '../lib';

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

// Cada mercado aparece pela própria marca: logotipo quando ele publica um, letreiro nas cores dele quando não.
const LOGOS: Record<string, { src?: string; bg?: string; word?: string; wordCls?: string; chipCls?: string }> = {
  'Atacadão': { src: 'logos/atacadao.svg' },
  'Assaí': { src: 'logos/assai.svg' },
  Coop: { src: 'logos/coop.png', bg: '#002846' },
  Baronesa: { src: 'logos/baronesa.png', word: 'Baronesa', wordCls: 'font-serif italic font-bold uppercase tracking-wide text-[#D7101A]' },
  Spani: { word: 'SPANI', chipCls: 'bg-[#E30613] px-2 -skew-x-6', wordCls: 'font-display text-lg font-extrabold italic tracking-wider text-[#FFD200] [text-shadow:1px_1px_0_#8a0410]' },
};

export function MarketLogo({ name }: { name: string }) {
  const l = LOGOS[name];
  if (!l) return <span className="text-sm font-bold leading-tight">{name}</span>;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex h-7 items-center gap-1 ${l.bg ? 'px-1.5' : ''} ${l.chipCls ?? ''}`}
      style={l.bg ? { background: l.bg } : undefined}
    >
      {l.src && <img src={imgSrc(l.src)} alt="" className="h-full w-auto max-w-[6.5rem] object-contain py-0.5" />}
      {l.word && <span aria-hidden className={`leading-none ${l.wordCls ?? ''}`}>{l.word}</span>}
    </span>
  );
}

type TagProps = { o: Indexed; cheapest: boolean; diff: number; alone?: boolean; perUnit?: boolean; odd?: boolean };

export function MarketTag({ o, cheapest, diff, alone, perUnit, odd }: TagProps) {
  const off = o.listPrice && o.listPrice > o.price ? o.listPrice : null;
  const units = o.units ?? 1;
  // Embalagens diferentes no grupo: o preço grande é o de cada unidade, e o da caixa fica embaixo.
  const unitView = perUnit && units > 1;
  const highlight = cheapest && !alone && !odd;
  const body: ReactNode = (
    <>
      <MarketLogo name={o.market} />
      {off && !unitView && <s className="num mt-1 block text-xs text-muted">{brl(off)}</s>}
      <span className="block"><Price value={unitView ? each(o) : o.price} big={highlight} /></span>
      {unitView && <span className="block text-xs font-bold">cada · {brl(o.price)} com {units}</span>}
      {!perUnit && units > 1 && <span className="block text-xs text-muted">embalagem com {units}</span>}
      {o.condition && <span className="mt-0.5 block text-[0.7rem] font-bold uppercase tracking-wide text-signal">{o.condition}</span>}
      {odd ? (
        <span className="mt-0.5 block text-xs font-bold text-signal">preço fora do padrão, confira</span>
      ) : (
        !alone && (
          <span className={`mt-0.5 block text-xs ${highlight ? 'font-bold' : 'text-muted'}`}>
            {highlight ? 'mais barato' : `+ ${brl(diff)}${perUnit ? ' cada' : ''}`}
          </span>
        )
      )}
    </>
  );
  const cls = `block min-w-[7.5rem] px-3 py-2 text-left ${
    highlight ? 'border-b-4 border-ink bg-tag' : odd ? 'border border-dashed border-signal bg-white opacity-80' : 'border border-line bg-white'
  }`;
  return o.productUrl ? (
    <a href={o.productUrl} target="_blank" rel="noopener noreferrer" className={`${cls} hover:brightness-95`} title={`Ver a oferta no ${o.market}`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
