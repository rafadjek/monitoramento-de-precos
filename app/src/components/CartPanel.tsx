import { useMemo, useState } from 'react';
import { bestPair, encodeCart, rankMarkets, type CartItem } from '../cart';
import { brl, type Group } from '../lib';
import { Icon, MarketLogo } from './Parts';

type Props = { cart: CartItem[]; setCart: (c: CartItem[]) => void; groups: Map<string, Group>; markets: string[] };

export function CartPanel({ cart, setCart, groups, markets }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const items = cart.filter((c) => groups.has(c.g));
  const rank = useMemo(() => rankMarkets(groups, items, markets), [groups, items, markets]);
  const pair = useMemo(() => bestPair(groups, items, markets), [groups, items, markets]);
  const complete = rank.filter((r) => r.missing.length === 0);
  const best = complete[0];
  const worst = complete[complete.length - 1];
  const pairGain = best && pair ? best.total - pair.total : 0;
  const setQty = (g: string, q: number) => setCart(q <= 0 ? cart.filter((c) => c.g !== g) : cart.map((c) => (c.g === g ? { ...c, qty: Math.min(99, q) } : c)));

  const share = async () => {
    const url = `${location.origin}${location.pathname}?lista=${encodeCart(items)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Minha lista no Bate Ofertas', url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    } catch { /* o usuário cancelou */ }
  };

  return (
    <section id="carrinho" className="glass p-4" aria-label="Carrinho Inteligente">
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 text-sky"><Icon name="cart" className="h-9 w-9" /><span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-neon text-[0.7rem] font-bold text-night">{items.length}</span></span>
        <div>
          <h2 className="font-display text-2xl font-bold leading-none">Carrinho Inteligente</h2>
          <p className="mt-1 text-sm text-muted">Monte sua lista e veja em que mercado ela sai mais barata.</p>
        </div>
      </div>

      {!items.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-edge p-4 text-sm text-muted">
          Toque em <b className="text-ink">Pôr na lista</b> nos produtos. O total aparece aqui, mercado por mercado.
        </p>
      ) : (
        <>
          <button onClick={() => setOpen(!open)} className="mt-3 flex w-full items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-sm font-bold">
            <span>{items.length} {items.length === 1 ? 'item' : 'itens'} na lista</span><span className="text-muted">{open ? 'esconder' : 'ver e mudar'}</span>
          </button>
          {open && (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
              {items.map((c) => (
                <li key={c.g} className="flex items-center gap-2 rounded-lg bg-panel2/60 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{groups.get(c.g)!.name}</span>
                  <button onClick={() => setQty(c.g, c.qty - 1)} aria-label="Menos" className="rounded bg-edge p-1"><Icon name="minus" className="h-3.5 w-3.5" /></button>
                  <span className="num w-5 text-center font-bold">{c.qty}</span>
                  <button onClick={() => setQty(c.g, c.qty + 1)} aria-label="Mais" className="rounded bg-edge p-1"><Icon name="plus" className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setQty(c.g, 0)} aria-label="Tirar da lista" className="p-1 text-muted hover:text-signal"><Icon name="x" className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}

          <ol className="mt-3 divide-y divide-edge/70 overflow-hidden rounded-xl border border-edge">
            {rank.slice(0, 6).map((r, i) => (
              <li key={r.market} className={`flex items-center gap-3 px-3 py-2 ${r === best ? 'bg-neon/5' : ''}`}>
                <span className="num w-4 text-sm font-bold text-muted">{i + 1}</span>
                <MarketLogo name={r.market} h="h-7" />
                <span className="ml-auto text-right">
                  <span className="num block font-display text-lg font-bold">{brl(r.total)}</span>
                  {r.missing.length > 0 && <span className="block text-[0.7rem] text-gold">tem {r.have} de {items.length}</span>}
                </span>
              </li>
            ))}
          </ol>

          {best ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-neon/60 bg-neon/10 p-3 shadow-neon">
              <Icon name="trophy" className="h-9 w-9 shrink-0 text-gold" />
              <div className="min-w-0">
                <p className="text-xs text-muted">Melhor compra</p>
                <MarketLogo name={best.market} h="h-6" />
              </div>
              <p className="num ml-auto font-display text-[1.7rem] font-bold text-neon">{brl(best.total)}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-gold/50 p-3 text-sm text-gold">Nenhum mercado tem a lista inteira. Veja abaixo a melhor divisão.</p>
          )}

          {best && worst && worst !== best && (
            <p className="mt-2 flex items-center gap-2 rounded-xl bg-panel2 p-3 text-sm">
              <span className="text-2xl" aria-hidden>💰</span>
              <span>Você economiza <b className="num text-neon">{brl(worst.total - best.total)}</b> em relação ao mais caro ({worst.market}).</span>
            </p>
          )}

          {pair && (!best || pairGain > 0.5) && (
            <div className="mt-2 rounded-xl border border-sky/50 bg-sky/5 p-3 text-sm">
              <p className="font-bold">Dividindo a compra em 2 mercados</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                <MarketLogo name={pair.a} h="h-6" /> + <MarketLogo name={pair.b} h="h-6" />
                <b className="num ml-auto font-display text-xl text-sky">{brl(pair.total)}</b>
              </p>
              <p className="mt-1 text-muted">
                {pair.picks.filter((p) => p.market === pair.a).length} itens no {pair.a}, {pair.picks.filter((p) => p.market === pair.b).length} no {pair.b}
                {best && <>; economiza mais <b className="text-neon">{brl(pairGain)}</b></>}.
              </p>
            </div>
          )}

          {rank.some((r) => r.warn > 0) && (
            <p className="mt-2 text-xs text-gold">Alguns preços valem levando várias unidades ou vencem logo; confira na tabela.</p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={share} className="inline-flex items-center justify-center gap-2 rounded-xl bg-neon px-3 py-2.5 font-bold text-night hover:brightness-110">
              <Icon name="share" className="h-4 w-4" />{copied ? 'Link copiado' : 'Compartilhar'}
            </button>
            <button onClick={() => setCart([])} className="rounded-xl border border-edge px-3 py-2.5 text-sm font-bold text-muted hover:text-ink">Limpar lista</button>
          </div>
        </>
      )}
    </section>
  );
}
