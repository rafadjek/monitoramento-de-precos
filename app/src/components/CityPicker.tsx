import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Parts';
import { cityLabel, toggleCity } from '../cities';

type Props = {
  available: string[];
  selected: string[];
  onChange: (cities: string[]) => void;
  /** classes do contêiner (cada lugar da tela ajusta a largura) */
  className?: string;
  /** painel alinhado à esquerda ou à direita do botão */
  align?: 'left' | 'right';
};

/** Botão "Minha região" com painel de caixinhas. Vazio = todas as cidades. */
export function CityPicker({ available, selected, onChange, className = '', align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const row = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-sky/10 focus-within:bg-sky/10';
  const box = 'h-5 w-5 shrink-0 accent-neon';

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-2 rounded-xl border border-sky/60 bg-panel px-3 py-1.5 text-left shadow-sky hover:bg-sky/10"
      >
        <Icon name="pin" className="h-5 w-5 shrink-0 text-sky" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[0.7rem] text-muted">Minha região</span>
          <span className="block truncate text-sm font-bold">{cityLabel(selected)}</span>
        </span>
        <span aria-hidden className={`text-xs text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Escolha as cidades"
          className={`absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-sky/60 bg-panel p-2 shadow-sky ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <label className={row}>
            <input type="checkbox" className={box} checked={selected.length === 0} onChange={() => onChange([])} />
            Todas
          </label>
          <div className="my-1 h-px bg-edge" />
          <div className="max-h-[50vh] overflow-y-auto">
            {available.map((c) => (
              <label key={c} className={row}>
                <input type="checkbox" className={box} checked={selected.includes(c)} onChange={() => onChange(toggleCity(selected, c, available))} />
                {c}
              </label>
            ))}
          </div>
          <div className="my-1 h-px bg-edge" />
          <a href="#/sua-cidade" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-neon hover:bg-neon/10 focus:bg-neon/10 focus:outline-none">
            📍 Quero o Bate Ofertas na minha cidade →
          </a>
        </div>
      )}
    </div>
  );
}
