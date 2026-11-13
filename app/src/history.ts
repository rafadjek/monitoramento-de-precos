// Histórico de preço no site: baixa só o pedaço (data/hist/NN.json) das ofertas do produto aberto
// e monta a linha do menor preço de cada dia entre os mercados do produto.
import { each, type Group } from './lib.ts';

export type HistMeta = { day0: string; today: number; shards: number };
type Series = [number, number][]; // [dia, preço], só quando o preço mudou

// mesmo cálculo do servidor (build-site.mjs): FNV-1a do id
export const shardOf = (id: string, n: number) => {
  let x = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { x ^= id.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return x % n;
};

const cache = new Map<number, Promise<Record<string, Series>>>();
export function loadShard(base: string, n: number): Promise<Record<string, Series>> {
  if (!cache.has(n)) cache.set(n, fetch(`${base}data/hist/${n}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return cache.get(n)!;
}

const priceAt = (s: Series, day: number) => { let p: number | null = null; for (const [d, v] of s) { if (d > day) break; p = v; } return p; };

export type Point = { day: number; price: number; market: string };
export type Trend = { points: Point[]; min: number; max: number; isLow: boolean; change7: number | null; changed: boolean; since: number };

// pontos dos últimos `days` dias: em cada dia, o menor preço (por unidade, se o grupo compara assim) e de qual mercado
export function groupTrend(g: Group, series: Record<string, Series>, today: number, days = 30): Trend {
  const its = g.items.filter((i) => !g.odd.includes(i.id));
  const first = Math.min(...its.map((i) => series[i.id]?.[0]?.[0] ?? today));
  const from = Math.max(today - days + 1, first);
  const points: Point[] = [];
  for (let d = from; d <= today; d++) {
    let best: Point | null = null;
    for (const it of its) {
      const s = series[it.id];
      // oferta sem histórico = preço que não mudou desde o começo do histórico
      const raw = s ? priceAt(s, d) : it.price;
      if (raw == null) continue;
      const v = g.perUnit ? raw / (it._u ?? 1) : raw;
      if (!best || v < best.price) best = { day: d, price: Math.round(v * 100) / 100, market: it.market };
    }
    if (best) points.push(best);
  }
  // o ponto de hoje sai do preço atual (o arquivo de histórico pode ser de ontem)
  const now = g.perUnit ? each(g.items[0]) : g.items[0].price;
  if (points.length && points[points.length - 1].day === today) points[points.length - 1] = { day: today, price: Math.round(now * 100) / 100, market: g.items[0].market };
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const cur = prices[prices.length - 1];
  const week = points.find((p) => p.day === today - 7);
  return {
    points, min, max,
    changed: max - min > 0.004,
    isLow: max - min > 0.004 && cur <= min + 0.004,
    change7: week && Math.abs(cur / week.price - 1) >= 0.03 ? cur / week.price - 1 : null,
    since: points[0]?.day ?? today,
  };
}

export const dayDate = (meta: HistMeta, d: number) => {
  const t = new Date(`${meta.day0}T12:00:00Z`).getTime() + d * 86400e3;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};
