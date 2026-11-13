import { useEffect, useMemo, useState } from 'react';
import { brl, type Group } from '../lib';
import { dayDate, groupTrend, loadShard, shardOf, type HistMeta, type Point } from '../history';

// Gráfico pequeno do menor preço de cada dia (últimos 30 dias) entre os mercados do produto.
// Uma série só (sem legenda); tocar ou passar o mouse mostra o dia, o preço e o mercado.
export function HistoryPanel({ g, meta, base }: { g: Group; meta: HistMeta; base: string }) {
  const [series, setSeries] = useState<Record<string, [number, number][]> | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  useEffect(() => {
    let alive = true;
    const shards = [...new Set(g.items.map((i) => shardOf(i.id, meta.shards)))];
    Promise.all(shards.map((n) => loadShard(base, n))).then((parts) => { if (alive) setSeries(Object.assign({}, ...parts)); });
    return () => { alive = false; };
  }, [g, meta, base]);
  const t = useMemo(() => (series ? groupTrend(g, series, meta.today) : null), [g, series, meta.today]);

  if (!t) return <div className="mt-2 h-24 animate-pulse rounded-xl bg-panel2" aria-label="Carregando histórico" />;
  const pts = t.points;
  const W = 320, H = 96, PADY = 12, PADX = 4;
  const span = Math.max(t.max - t.min, t.max * 0.05, 0.01);
  const lo = t.min - span * 0.15, hi = t.max + span * 0.15;
  const x = (i: number) => PADX + (pts.length > 1 ? (i / (pts.length - 1)) * (W - PADX * 2) : W / 2);
  const y = (p: number) => PADY + (1 - (p - lo) / (hi - lo)) * (H - PADY * 2);
  // linha em degraus: o preço vale até o dia em que muda
  const d = pts.map((p, i) => (i === 0 ? `M${x(0)},${y(p.price)}` : `H${x(i)}V${y(p.price)}`)).join('');
  const changes = pts.filter((p, i) => i === 0 || p.price !== pts[i - 1].price || i === pts.length - 1);
  const shown = hover ?? pts[pts.length - 1];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1));
    setHover(pts[Math.max(0, Math.min(pts.length - 1, i))]);
  };

  return (
    <div className="mt-2 rounded-xl border border-edge bg-panel2/60 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="font-bold text-ink">Menor preço por dia</span>
        {t.isLow && <span className="rounded-full bg-neon/15 px-2 py-0.5 font-bold text-neon">menor preço {pts.length >= 30 ? 'dos últimos 30 dias' : `desde ${dayDate(meta, t.since)}`}</span>}
        {t.change7 != null && (
          <span className={`rounded-full px-2 py-0.5 font-bold ${t.change7 < 0 ? 'bg-neon/15 text-neon' : 'bg-signal/15 text-signal'}`}>
            {t.change7 < 0 ? 'caiu' : 'subiu'} {Math.round(Math.abs(t.change7) * 100)}% em 7 dias
          </span>
        )}
        {!t.changed && <span className="text-muted">preço igual desde {dayDate(meta, t.since)}</span>}
      </div>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full max-w-md touch-none"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
          role="img" aria-label={`Menor preço de ${brl(t.min)} a ${brl(t.max)} desde ${dayDate(meta, t.since)}`}>
          <line x1={0} x2={W} y1={y(t.min)} y2={y(t.min)} stroke="#1E2C55" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke="#22E36B" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {changes.map((p) => <circle key={p.day} cx={x(pts.indexOf(p))} cy={y(p.price)} r={3} fill="#22E36B" stroke="#0C1530" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          {hover && <line x1={x(pts.indexOf(hover))} x2={x(pts.indexOf(hover))} y1={0} y2={H} stroke="#8C9AC0" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
      {pts.length > 1 && (
        <p className="flex max-w-md justify-between text-[0.68rem] text-muted" aria-hidden>
          <span>{dayDate(meta, pts[0].day)}</span><span>hoje</span>
        </p>
      )}
      <p className="mt-1 flex justify-between text-[0.72rem] text-muted">
        <span>{dayDate(meta, shown.day)}: <b className="num text-ink">{brl(shown.price)}</b> no {shown.market}</span>
        {pts.length > 1 && <span>mín. <b className="num text-ink">{brl(t.min)}</b> · máx. <b className="num text-ink">{brl(t.max)}</b></span>}
      </p>
    </div>
  );
}
