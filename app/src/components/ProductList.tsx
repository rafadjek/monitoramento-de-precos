import { brl, each, type Group, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb, Validity } from './Parts';
import { useState } from 'react';
import { HistoryPanel } from './HistoryPanel';
import type { HistMeta } from '../history';

// Linha de produto: só os mercados que têm o produto, lado a lado, do mais barato ao mais caro.
// Clicar numa etiqueta seleciona aquela oferta (borda amarela) e mostra o botão para pôr na lista;
// o ícone no canto abre o produto no site do mercado.
type Props = {
  groups: Group[]; only: string; favs: Set<string>; onFav: (id: string) => void;
  inCart: Set<string>; onAdd: (id: string, market?: string) => void;
  selected: Record<string, string>; onSelect: (id: string, market: string) => void;
  hist: HistMeta | null; base: string;
};

const byQty = (o: Indexed) => !!o.condition && /levando|a partir|leve \d/i.test(o.condition);

// Texto da condição da oferta, mostrado ao passar o mouse (ou tocar) no asterisco
export function conditionText(it: Indexed, g: Group): string | null {
  const parts: string[] = [];
  if (it.condition) parts.push(it.condition.replace(/^R\$\s*[\d.,]+\s*/, ''));
  if (byQty(it) && it.listPrice) parts.push(`1 unidade sai por ${brl(it.listPrice)}`);
  const u = it._u ?? 1;
  if (g.perUnit && u > 1) parts.push(`preço de cada unidade; a embalagem com ${u} custa ${brl(it.price)}`);
  return parts.length ? parts.join(' · ') : null;
}

export function Star({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} tabIndex={0} className="ml-0.5 inline-grid h-4 w-4 cursor-help place-items-center rounded-full bg-gold text-[0.7rem] font-black leading-none text-night">*</span>
  );
}

function Tag({ g, it, first, picked, onSelect }: { g: Group; it: Indexed; first: boolean; picked: boolean; onSelect: () => void }) {
  const odd = g.odd.includes(it.id);
  const alone = g.items.length === 1;
  const best = first && !odd && !g.suspect && !alone;
  const value = g.perUnit ? each(it) : it.price;
  const diff = value - (g.perUnit ? each(g.items[0]) : g.items[0].price);
  const strike = it.listPrice && it.listPrice > it.price && !byQty(it) && !(g.perUnit && (it._u ?? 1) > 1) ? it.listPrice : null;
  const cond = conditionText(it, g);
  // selecionada: borda amarela de alerta (tem prioridade sobre o verde do mais barato)
  const cls = picked ? 'border-2 border-gold bg-gold/10 shadow-[0_0_0_1px_rgba(255,194,26,.6),0_0_18px_rgba(255,194,26,.35)]'
    : best ? 'border-neon/80 bg-neon/10 shadow-neon' : odd ? 'border-dashed border-signal/70 opacity-80' : 'border-edge bg-panel2';
  return (
    <div className="relative">
      <button type="button" onClick={onSelect} aria-pressed={picked} title={picked ? 'Selecionado' : `Selecionar a oferta do ${it.market}`}
        className={`block min-w-[7.2rem] rounded-xl border px-3 py-2 pr-9 text-left hover:brightness-125 ${cls}`}>
        <MarketLogo name={it.market} h="h-7" />
        {strike && <s className="num mt-1 block text-[0.7rem] text-muted">{brl(strike)}</s>}
        <span className={`mt-1 flex items-start ${picked ? 'text-gold' : best ? 'text-neon' : 'text-ink'}`}>
          <Price value={value} size={best ? 'lg' : 'md'} />
          {cond && <Star text={cond} />}
        </span>
        <span className={`mt-0.5 block text-[0.72rem] ${best ? 'font-bold text-neon' : 'text-muted'}`}>
          {odd ? <b className="text-signal">preço fora do padrão</b> : best ? <span className="inline-flex items-center gap-1"><Icon name="crown" className="h-3.5 w-3.5" fill />Menor preço</span> : !alone && diff > 0.004 ? `+ ${brl(diff)}` : ''}
        </span>
      </button>
      {it.productUrl && (
        <a href={it.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ver no site do ${it.market}`} title={`Ver no site do ${it.market}`}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg border border-sky/70 bg-night/60 text-sky hover:bg-sky hover:text-night">
          <Icon name="external" className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export function ProductList({ groups, only, favs, onFav, inCart, onAdd, selected, onSelect, hist, base }: Props) {
  const [openHist, setOpenHist] = useState<Set<string>>(new Set());
  return (
    <ul className="divide-y divide-edge/80 overflow-hidden rounded-2xl border border-edge bg-panel">
      {groups.map((g) => {
        const best = g.items[0];
        const alone = g.items.length === 1;
        // com um mercado escolhido, a etiqueta dele vem primeiro (as outras continuam para comparar)
        const items = only ? [...g.items.filter((i) => i.market === only), ...g.items.filter((i) => i.market !== only)] : g.items;
        const fav = favs.has(g.id), added = inCart.has(g.id);
        const pick = selected[g.id];
        const pickedItem = pick ? g.items.find((i) => i.market === pick) : undefined;
        return (
          <li key={g.id} className="p-3 sm:flex sm:gap-4 sm:p-4">
            <div className="hidden sm:block"><Thumb src={g.image} name={g.name} size={104} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="sm:hidden"><Thumb src={g.image} name={g.name} size={64} /></div>
                <h3 className="min-w-0 flex-1 text-base font-bold leading-snug">{g.name}</h3>
                <button onClick={() => onFav(g.id)} aria-pressed={fav} aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar'} className={`shrink-0 p-0.5 ${fav ? 'text-signal' : 'text-muted hover:text-ink'}`}>
                  <Icon name="heart" className="h-5 w-5" fill={fav} />
                </button>
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {alone ? `Por enquanto só achei no ${best.market}`
                  : g.suspect ? <b className="text-gold">Preços muito diferentes: um deles pode ser caixa ou fardo. Confira.</b>
                  : g.saving > 0.004 ? <>Economize <b className="text-neon">{brl(g.saving)}</b>{g.perUnit ? ' em cada unidade' : ''} ({Math.round(g.savingPct * 100)}%) comprando no {best.market}</>
                  : `Mesmo preço em ${g.items.length - g.odd.length} mercados`}
              </p>
              {/* no celular: etiquetas lado a lado numa linha que arrasta (a mais barata primeiro); no computador quebram linha */}
              <ul className="tags-row -mx-3 mt-2 flex snap-x gap-2 overflow-x-auto pb-1 pl-3 pr-8 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {items.map((it) => (
                  <li key={it.id} className="shrink-0 snap-start"><Tag g={g} it={it} first={it === g.items[0]} picked={pick === it.market} onSelect={() => onSelect(g.id, it.market)} /></li>
                ))}
              </ul>
              {items.length > 2 && <p className="mt-0.5 text-[0.7rem] text-muted sm:hidden">arraste para o lado para ver os {items.length} mercados →</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {pickedItem ? (
                  <button onClick={() => onAdd(g.id, pickedItem.market)} className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 font-bold text-night hover:brightness-110">
                    <Icon name="cart" className="h-4 w-4" />Pôr na lista: {pickedItem.market} {brl(g.perUnit ? each(pickedItem) : pickedItem.price)}
                  </button>
                ) : (
                  <button onClick={() => onAdd(g.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold ${added ? 'bg-neon/15 text-neon' : 'border border-sky/70 text-sky hover:bg-sky/10'}`}>
                    <Icon name="cart" className="h-4 w-4" />{added ? 'Na lista (+1)' : 'Pôr na lista (mais barato)'}
                  </button>
                )}
                {hist && (
                  <button onClick={() => setOpenHist((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                    aria-expanded={openHist.has(g.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-bold ${openHist.has(g.id) ? 'border-neon/70 text-neon' : 'border-edge text-muted hover:text-ink'}`}>
                    <Icon name="chart" className="h-4 w-4" />Histórico
                  </button>
                )}
                <span className="text-muted">
                  {pickedItem ? 'toque de novo na etiqueta para desmarcar' : best.validUntil ? <><Validity o={best} /> no {best.market}</> : 'toque numa etiqueta para escolher o mercado'}
                </span>
              </div>
              {hist && openHist.has(g.id) && <HistoryPanel g={g} meta={hist} base={base} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
