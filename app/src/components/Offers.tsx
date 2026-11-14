import { useMemo } from 'react';
import { brl, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb } from './Parts';

// Ofertas do dia: os maiores descontos de verdade (preço "de" riscado contra o atual), do maior para o menor.
// Um produto só: se duas ofertas são da mesma marca (ou, sem marca, têm o mesmo nome quase todo), fica a de maior desconto.
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PALAVRAS_NEUTRAS = new Set(['de', 'da', 'do', 'com', 'e', 'em', 'para', 'the', 'o', 'a', 'un', 'unidade', 'pote', 'caixa', 'pacote', 'garrafa', 'lata', 'bandeja', 'frasco', 'sache']);
const palavras = (s: string) => new Set(semAcento(s).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_NEUTRAS.has(w)));
const chaveMarca = (b: string | null | undefined) => semAcento(b ?? '').replace(/[^a-z]/g, '').slice(0, 5);
const semelhanca = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i || 1); };

export function pickOffers(all: Indexed[], n = 20): Indexed[] {
  const real = all.filter((o) => o.listPrice && o.listPrice > o.price && !(o.condition && /levando|a partir|leve \d|cart[aã]o/i.test(o.condition)) && o.imageUrl);
  const off = (o: Indexed) => 1 - o.price / o.listPrice!;
  // marcas conhecidas: as informadas em 3 ou mais ofertas; sem marca, a palavra do nome que é uma delas
  const cont = new Map<string, number>();
  for (const o of all) { const k = chaveMarca(o.brand); if (k.length >= 4) cont.set(k, (cont.get(k) ?? 0) + 1); }
  const conhecidas = new Set([...cont].filter(([, c]) => c >= 3).map(([k]) => k));
  const marcaDe = (o: Indexed) => {
    const k = chaveMarca(o.brand);
    if (k) return k;
    const w = semAcento(o.name).split(/[^a-z]+/).find((x) => x.length >= 4 && conhecidas.has(x.slice(0, 5)));
    return w ? w.slice(0, 5) : '';
  };
  const out: Indexed[] = [];
  const marcas = new Set<string>();
  const nomes: Set<string>[] = []; // palavras do nome de cada oferta já escolhida
  for (const o of real.filter((x) => off(x) >= 0.1 && off(x) <= 0.7).sort((a, b) => off(b) - off(a))) {
    const mk = marcaDe(o), p = palavras(o.name);
    if ((mk && marcas.has(mk)) || nomes.some((x) => semelhanca(x, p) >= 0.6)) continue;
    if (mk) marcas.add(mk);
    nomes.push(p);
    out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

export function Offers({ offers, onAdd }: { offers: Indexed[]; onAdd: (o: Indexed) => void }) {
  const list = useMemo(() => offers, [offers]);
  if (!list.length) return null;
  return (
    <section id="ofertas" className="glass p-4" aria-label="Ofertas do dia">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Icon name="flame" className="h-7 w-7 text-fire" fill />Ofertas do Dia</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {list.map((o) => {
          const pct = Math.round((1 - o.price / o.listPrice!) * 100);
          return (
            <li key={o.id} className="relative flex flex-col rounded-xl bg-white p-2 text-night">
              <span className="absolute right-2 top-2 rounded-md bg-signal px-1.5 py-0.5 text-[0.7rem] font-bold text-white">-{pct}%</span>
              <div className="flex justify-center"><Thumb src={o.imageUrl} name={o.name} size={72} /></div>
              <p className="mt-1 line-clamp-2 text-[0.75rem] font-bold leading-tight">{o.name}</p>
              <div className="mt-1"><MarketLogo name={o.market} h="h-5" /></div>
              <div className="mt-auto flex items-end justify-between pt-1">
                <span>
                  <s className="num block text-[0.65rem] text-[#7b8399]">{brl(o.listPrice!)}</s>
                  <Price value={o.price} size="sm" className="text-night" />
                </span>
                <button onClick={() => onAdd(o)} aria-label="Pôr na lista" className="rounded-lg bg-neon p-1.5 text-night hover:brightness-110"><Icon name="cart" className="h-4 w-4" /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
