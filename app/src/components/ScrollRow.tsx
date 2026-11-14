import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { percent, scrollForThumbLeft, scrollForTrackClick, thumbMetrics, type Metrics } from '../scrollbar';

// Contêiner rolável na horizontal (com snap) e barra própria sempre visível: trilho azul, marcador azul→verde.
// A barra só aparece quando o conteúdo não cabe. Com wrapOnWide, a partir de 640px o conteúdo quebra linha
// (não precisa de barra). A rolagem nativa (toque, roda, teclado) continua funcionando.
type Props = {
  children: ReactNode;
  className?: string;   // classes do contêiner rolável (ex.: gap, padding)
  label: string;        // nome acessível
  hint?: string;        // dica pequena que some após a primeira rolagem
  wrapOnWide?: boolean; // sm:flex-wrap, sem rolagem no computador
  as?: 'div' | 'ul';
  role?: string;
};

const OFF: Metrics = { visible: false, thumbWidth: 0, thumbLeft: 0, maxScroll: 0 };

export function ScrollRow({ children, className = '', label, hint = 'arraste →', wrapOnWide = false, as = 'div', role }: Props) {
  const id = useId();
  const box = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>(OFF);
  const [pos, setPos] = useState(0);
  const [moved, setMoved] = useState(false);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);

  const measure = useCallback(() => {
    const el = box.current, tr = track.current;
    if (!el) return;
    const trackW = tr?.clientWidth || el.clientWidth;
    const next = thumbMetrics(el.scrollLeft, el.clientWidth, el.scrollWidth, trackW);
    setM((p) => (p.visible === next.visible && p.thumbWidth === next.thumbWidth && p.thumbLeft === next.thumbLeft && p.maxScroll === next.maxScroll ? p : next));
    setPos(el.scrollLeft);
  }, []);

  useLayoutEffect(measure);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  const scrollTo = (x: number, smooth = false) => box.current?.scrollTo({ left: x, behavior: smooth ? 'smooth' : 'auto' });
  const onScroll = () => { measure(); setMoved(true); };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (box.current) box.current.style.scrollSnapType = 'none'; // sem snap durante o arraste, para o marcador seguir o dedo
    drag.current = { startX: e.clientX, startLeft: m.thumbLeft };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current, tr = track.current;
    if (!d || !tr) return;
    scrollTo(scrollForThumbLeft(d.startLeft + e.clientX - d.startX, m.thumbWidth, tr.clientWidth, m.maxScroll));
  };
  const up = () => { drag.current = null; if (box.current) box.current.style.scrollSnapType = ''; };
  const clickTrack = (e: PointerEvent<HTMLDivElement>) => {
    const tr = track.current;
    if (!tr) return;
    scrollTo(scrollForTrackClick(e.clientX - tr.getBoundingClientRect().left, m.thumbWidth, tr.clientWidth, m.maxScroll), true);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    const step = el.clientWidth * 0.8;
    if (e.key === 'ArrowRight') scrollTo(el.scrollLeft + 60, true);
    else if (e.key === 'ArrowLeft') scrollTo(el.scrollLeft - 60, true);
    else if (e.key === 'PageDown') scrollTo(el.scrollLeft + step, true);
    else if (e.key === 'PageUp') scrollTo(el.scrollLeft - step, true);
    else if (e.key === 'Home') scrollTo(0, true);
    else if (e.key === 'End') scrollTo(m.maxScroll, true);
    else return;
    e.preventDefault();
  };
  const page = (dir: 1 | -1) => scrollTo((box.current?.scrollLeft ?? 0) + dir * (box.current?.clientWidth ?? 200) * 0.8, true);

  const Tag = as as 'div';
  const canLeft = m.visible && pos > 2, canRight = m.visible && pos < m.maxScroll - 2;
  const arrow = 'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border-2 border-sky bg-night/90 text-2xl font-bold leading-none text-ink shadow-lg hover:bg-sky/30 sm:grid';
  const wide = wrapOnWide ? 'sm:flex-wrap sm:overflow-visible' : '';

  return (
    <div className="relative">
      <Tag ref={box as never} id={id} role={role} aria-label={label} onScroll={onScroll}
        className={`scroll-hide flex snap-x overflow-x-auto ${wide} ${className}`}>
        {children}
      </Tag>
      {canLeft && <button type="button" aria-label="Rolar para a esquerda" onClick={() => page(-1)} className={`${arrow} left-1`}>‹</button>}
      {canRight && <button type="button" aria-label="Rolar para a direita" onClick={() => page(1)} className={`${arrow} right-1`}>›</button>}
      <div className={m.visible ? (wrapOnWide ? 'sm:hidden' : '') : 'hidden'}>
        <div ref={track} onPointerDown={clickTrack} data-testid="scroll-track"
          className="relative mt-1.5 h-3.5 cursor-pointer rounded-full bg-[#101c3d] shadow-[inset_0_0_0_1.5px_#2f8bff]">
          <div role="scrollbar" aria-controls={id} aria-orientation="horizontal" aria-label={`Rolagem: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(pos, m.maxScroll)}
            tabIndex={0} onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="scroll-thumb"
            style={{ width: m.thumbWidth, transform: `translateX(${m.thumbLeft}px)`, touchAction: 'none' }}
            className="absolute inset-y-0 left-0 cursor-grab rounded-full bg-gradient-to-r from-[#2f8bff] to-[#22e36b] shadow-[inset_0_0_0_1.5px_#0b1430] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold" />
        </div>
        {hint && !moved && <p className="mt-0.5 text-xs font-bold text-sky sm:hidden">{hint}</p>}
      </div>
    </div>
  );
}
