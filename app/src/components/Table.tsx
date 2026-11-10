import type { CSSProperties } from 'react';
import { brl, each, type Group, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb, Validity } from './Parts';

type Props = {
  groups: Group[];
  markets: string[];
  active: string;
  onMarket: (m: string) => void;
  favs: Set<string>;
  onFav: (id: string) => void;
  inCart: Set<string>;
  onAdd: (id: string) => void;
};

// Colunas (larguras em .tbl no index.css): produto fixa à esquerda, um mercado por coluna (cabem 4; a barra
// arrasta até os outros), ação fixa à direita.
const qty = (o: Indexed) => !!o.condition && /levando|a partir|leve \d/i.test(o.condition);

function Cell({ g, it }: { g: Group; it?: Indexed }) {
  if (!it) return <div className="flex flex-1 items-center justify-center text-muted/60">—</div>;
  const odd = g.odd.includes(it.id);
  const best = !odd && !g.suspect && g.items.length > 1 && it === g.items[0];
  const units = it._u ?? 1;
  const unitView = g.perUnit && units > 1;
  const value = g.perUnit ? each(it) : it.price;
  const strike = it.listPrice && it.listPrice > it.price && !qty(it) && !unitView ? it.listPrice : null;
  const body = (
    <div className={`flex flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center ${best ? 'bg-neon/10 text-neon shadow-neon' : odd ? 'border border-dashed border-signal/70 text-ink/70' : 'text-ink'}`}>
      {strike && <s className="num text-[0.7rem] text-muted">{brl(strike)}</s>}
      <Price value={value} size={best ? 'md' : 'sm'} />
      {unitView && <span className="text-[0.65rem] text-muted">cada · {brl(it.price)} c/ {units}</span>}
      {it.condition && <span className="mt-0.5 line-clamp-2 text-[0.65rem] font-bold uppercase leading-tight text-gold">{it.condition.replace(/^R\$\s*[\d.,]+\s*/, '')}</span>}
      {qty(it) && it.listPrice && <span className="num text-[0.65rem] text-muted">1 un: {brl(it.listPrice)}</span>}
      {best && <span className="mt-0.5 inline-flex items-center gap-1 text-[0.7rem] font-bold"><Icon name="crown" className="h-3.5 w-3.5" fill />Menor preço</span>}
      {odd && <span className="mt-0.5 text-[0.65rem] font-bold text-signal">fora do padrão</span>}
    </div>
  );
  return it.productUrl ? (
    <a href={it.productUrl} target="_blank" rel="noopener noreferrer" className="flex flex-1 p-1 hover:brightness-125" title={`Ver no ${it.market}`}>{body}</a>
  ) : <div className="flex flex-1 p-1">{body}</div>;
}

export function PriceTable({ groups, markets, active, onMarket, favs, onFav, inCart, onAdd }: Props) {
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `var(--pc) repeat(${markets.length}, var(--mc)) var(--ac)` };
  return (
    <div className="bar-x overflow-x-auto rounded-2xl border border-edge bg-panel/90 pb-1">
      <div style={grid} className="tbl min-w-max">
        {/* cabeçalho */}
        <div className="sticky left-0 z-20 flex items-center border-b border-edge bg-panel px-4 py-3 text-sm font-bold text-muted">Produto</div>
        {markets.map((m) => (
          <button
            key={m}
            onClick={() => onMarket(m)}
            aria-pressed={active === m}
            title={active === m ? 'Mostrar todos os mercados' : `Só produtos do ${m}`}
            className={`flex items-center justify-center border-b border-edge px-1 py-3 ${active === m ? 'bg-sky/15 shadow-sky' : 'hover:bg-panel2'}`}
          >
            <MarketLogo name={m} h="h-8" />
          </button>
        ))}
        {/* no celular a coluna tem largura 0: fica invisível, mas não pode sumir (a grade desalinharia) */}
        <div className="sticky right-0 z-20 flex items-center justify-center overflow-hidden border-b border-edge bg-panel py-3 text-sm font-bold text-muted max-sm:invisible">Ação</div>

        {groups.map((g) => {
          const by = new Map(g.items.map((i) => [i.market, i]));
          const best = g.items[0];
          const fav = favs.has(g.id), added = inCart.has(g.id);
          return [
            <div key={g.id + ':p'} className="sticky left-0 z-10 flex items-center gap-2 border-b border-edge/70 bg-panel px-2 py-2 sm:gap-3 sm:px-3">
              <button onClick={() => onFav(g.id)} aria-pressed={fav} aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar'} className={`hidden shrink-0 sm:block ${fav ? 'text-signal' : 'text-muted hover:text-ink'}`}>
                <Icon name="heart" className="h-5 w-5" fill={fav} />
              </button>
              <Thumb src={g.image} name={g.name} size={52} />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[0.82rem] font-bold leading-snug sm:text-sm">{g.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-muted">
                  {/* o mais barato pode estar numa coluna fora da tela: fica sempre escrito aqui */}
                  {g.items.length > 1 && !g.suspect && !g.odd.includes(best.id) ? (
                    <>Menor: <b className="text-neon">{brl(g.shown)}</b> no {best.market} · {g.items.length} mercados</>
                  ) : g.items.length > 1 ? `${g.items.length} mercados` : `só no ${best.market}`}
                  {best.validUntil && <> · <Validity o={best} /></>}
                </p>
                {/* no celular a coluna de ação some; o botão da lista fica aqui */}
                <button onClick={() => onAdd(g.id)} className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-bold sm:hidden ${added ? 'bg-neon/20 text-neon' : 'bg-sky/20 text-sky'}`}>
                  <Icon name={added ? 'plus' : 'cart'} className="h-3.5 w-3.5" />{added ? 'na lista' : 'lista'}
                </button>
              </div>
            </div>,
            ...markets.map((m) => (
              <div key={g.id + ':' + m} className={`flex border-b border-edge/70 ${active === m ? 'bg-sky/5' : ''}`}>
                <Cell g={g} it={by.get(m)} />
              </div>
            )),
            <div key={g.id + ':a'} className="sticky right-0 z-10 flex flex-col items-stretch justify-center gap-1.5 overflow-hidden border-b border-edge/70 bg-panel px-2 py-2 max-sm:invisible max-sm:px-0">
              {best.productUrl && (
                <a href={best.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg border border-sky/70 px-2 py-1.5 text-xs font-bold text-sky shadow-sky hover:bg-sky/10">
                  Ver no mercado <Icon name="arrow" className="h-4 w-4" />
                </a>
              )}
              <button onClick={() => onAdd(g.id)} className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold ${added ? 'bg-neon/15 text-neon' : 'bg-panel2 text-ink hover:bg-edge'}`}>
                <Icon name={added ? 'plus' : 'cart'} className="h-4 w-4" />{added ? 'Na lista (+1)' : 'Pôr na lista'}
              </button>
            </div>,
          ];
        })}
      </div>
    </div>
  );
}
