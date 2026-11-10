import { brl, brlParts, validity, type Indexed } from '../lib';

const BASE = import.meta.env.BASE_URL;
export const imgSrc = (u: string) => (u.startsWith('http') ? u : BASE + u);

export function Price({ value, size = 'md', className = '' }: { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { int, cents } = brlParts(value);
  const big = { sm: 'text-lg', md: 'text-2xl', lg: 'text-[2rem]' }[size];
  return (
    <span className={`num inline-flex items-start font-display font-bold leading-none ${className}`} aria-label={brl(value)}>
      <span className="mr-0.5 mt-[0.2em] text-[0.7rem] font-semibold opacity-80">R$</span>
      <span className={big}>{int}</span>
      <span className="mt-[0.1em] text-sm">,{cents}</span>
    </span>
  );
}

export function Thumb({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white" style={{ width: size, height: size }}>
      {src ? (
        <img src={imgSrc(src)} alt="" loading="lazy" width={size} height={size} className="max-h-full max-w-full object-contain p-0.5" />
      ) : (
        <span className="font-display text-2xl font-bold text-[#9aa6c4]" aria-hidden>{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function Validity({ o }: { o: Pick<Indexed, 'validUntil'> }) {
  const v = validity(o);
  return <span className={v.urgent ? 'font-bold text-signal' : v.known ? 'text-ink' : 'text-muted'}>{v.text}</span>;
}

// Cada mercado aparece pela própria marca: logotipo quando ele publica um, letreiro nas cores dele quando não.
// No tema escuro, logotipo de fundo claro vai numa pastilha branca.
const LOGOS: Record<string, { src?: string; bg?: string; word?: string; wordCls?: string; chipCls?: string }> = {
  'Atacadão': { src: 'logos/atacadao.svg' },
  'Assaí': { src: 'logos/assai.svg' },
  Coop: { src: 'logos/coop.png', bg: '#002846' },
  Baronesa: { src: 'logos/baronesa.png', word: 'Baronesa', wordCls: 'font-serif italic font-bold uppercase tracking-wide text-[#D7101A]' },
  Nagumo: { src: 'logos/nagumo.png', bg: '#D7182A' },
  Semar: { src: 'logos/semar.png' },
  Extra: { src: 'logos/extra.png' },
  Joanin: { src: 'logos/joanin.png' },
  Dia: { src: 'logos/dia.png', bg: '#E41E26' },
  'Roldão': { src: 'logos/roldao.svg', bg: '#082F63' },
  Spani: { word: 'SPANI', bg: '#E30613', wordCls: 'font-display text-lg font-extrabold italic tracking-wider text-[#FFD200] [text-shadow:1px_1px_0_#8a0410]' },
};

export function MarketLogo({ name, h = 'h-8' }: { name: string; h?: string }) {
  const l = LOGOS[name];
  if (!l) return <span className="text-sm font-bold leading-tight">{name}</span>;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex ${h} items-center gap-1 rounded-md px-1.5 ${l.chipCls ?? ''}`}
      style={{ background: l.bg ?? '#ffffff' }}
    >
      {l.src && <img src={imgSrc(l.src)} alt="" className="h-full w-auto max-w-[6.5rem] object-contain py-0.5" />}
      {l.word && <span aria-hidden className={`leading-none ${l.wordCls ?? ''}`}>{l.word}</span>}
    </span>
  );
}

// Ícones simples (traço), herdam a cor do texto.
const P: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  heart: 'M12 20s-7.5-4.6-9.2-9.3C1.6 7.2 4 4 7.3 4c2 0 3.4 1.1 4.7 2.7C13.3 5.1 14.7 4 16.7 4 20 4 22.4 7.2 21.2 10.7 19.5 15.4 12 20 12 20Z',
  cart: 'M3 4h2l2.4 11h11l2-8H6.3M9 20a1 1 0 1 0 0 .01M18 20a1 1 0 1 0 0 .01',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8Z',
  flame: 'M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.6 1.6-4.2 2.6-5 .2 1.8 1.2 3 2.4 3.4C11.4 8.6 12 5.6 12 3Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  share: 'M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};
export function Icon({ name, className = 'h-5 w-5', fill = false }: { name: keyof typeof P | string; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name]} />
    </svg>
  );
}
