import { brl, each, type Group, type Indexed } from '../lib';
import { Icon, MarketLogo, Price, Thumb, Validity } from './Parts';

// Linha de produto como na primeira versão: só os mercados que têm o produto, lado a lado,
// do mais barato ao mais caro, com o mais barato em destaque. Sem colunas vazias.
type Props = { groups: Group[]; only: string; favs: Set<string>; onFav: (id: string) => void; inCart: Set<string>; onAdd: (id: string) => void };

const byQty = (o: Indexed) => !!o.condition && /levando|a partir|leve \d/i.test(o.condition);

function Tag({ g, it, first }: { g: Group; it: Indexed; first: boolean }) {
  const odd = g.odd.includes(it.id);
  const alone = g.items.length === 1;
  const best = first && !odd && !g.suspect && !alone;
  const units = it._u ?? 1;
  const unitView = g.perUnit && units > 1;
  const value = g.perUnit ? each(it) : it.price;
  const diff = value - (g.perUnit ? each(g.items[0]) : g.items[0].price);
  const strike = it.listPrice && it.listPrice > it.price && !byQty(it) && !unitView ? it.listPrice : null;
  const cls = best
    ? 'border-neon/80 bg-neon/10 shadow-neon'
    : odd ? 'border-dashed border-signal/70 opacity-80' : 'border-edge bg-panel2';
  const body = (
    <>
      <MarketLogo name={it.market} h="h-7" />
      {strike && <s className="num mt-1 block text-[0.7rem] text-muted">{brl(strike)}</s>}
      <span className={`mt-1 block ${best ? 'text-neon' : 'text-ink'}`}><Price value={value} size={best ? 'lg' : 'md'} /></span>
      {unitView && <span className="block text-[0.7rem] text-muted">cada · {brl(it.price)} com {units}</span>}
      {it.condition && <span className="mt-0.5 block text-[0.66rem] font-bold uppercase leading-tight text-gold">{it.condition.replace(/^R\$\s*[\d.,]+\s*/, '')}</span>}
      {byQty(it) && it.listPrice && <span className="num block text-[0.7rem] text-muted">1 un: {brl(it.listPrice)}</span>}
      <span className={`mt-0.5 block text-[0.72rem] ${best ? 'font-bold text-neon' : 'text-muted'}`}>
        {odd ? <b className="text-signal">preço fora do padrão</b> : best ? <span className="inline-flex items-center gap-1"><Icon name="crown" className="h-3.5 w-3.5" fill />Menor preço</span> : !alone && diff > 0.004 ? `+ ${brl(diff)}${g.perUnit ? ' cada' : ''}` : ''}
      </span>
    </>
  );
  const box = `block min-w-[7.6rem] rounded-xl border px-3 py-2 text-left ${cls}`;
  return it.productUrl ? (
    <a href={it.productUrl} target="_blank" rel="noopener noreferrer" className={`${box} hover:brightness-125`} title={`Ver no ${it.market}`}>{body}</a>
  ) : <div className={box}>{body}</div>;
}

export function ProductList({ groups, only, favs, onFav, inCart, onAdd }: Props) {
  return (
    <ul className="divide-y divide-edge/80 overflow-hidden rounded-2xl border border-edge bg-panel">
      {groups.map((g) => {
        const best = g.items[0];
        const alone = g.items.length === 1;
        // com um mercado escolhido, a etiqueta dele vem primeiro (as outras continuam para comparar)
        const items = only ? [...g.items.filter((i) => i.market === only), ...g.items.filter((i) => i.market !== only)] : g.items;
        const fav = favs.has(g.id), added = inCart.has(g.id);
        return (
          <li key={g.id} className="flex gap-3 p-3 sm:p-4">
            <Thumb src={g.image} name={g.name} size={68} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-[0.95rem] font-bold leading-snug">{g.name}</h3>
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
              <ul className="mt-2 flex flex-wrap gap-2">
                {items.map((it) => <li key={it.id}><Tag g={g} it={it} first={it === g.items[0]} /></li>)}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button onClick={() => onAdd(g.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold ${added ? 'bg-neon/15 text-neon' : 'border border-sky/70 text-sky hover:bg-sky/10'}`}>
                  <Icon name="cart" className="h-4 w-4" />{added ? 'Na lista (+1)' : 'Pôr na lista'}
                </button>
                <span className="text-muted">
                  {best.validUntil ? <><Validity o={best} /> no {best.market}</> : `${best.market} não informa até quando vale`}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
