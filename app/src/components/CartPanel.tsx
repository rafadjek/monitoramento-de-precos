import { useMemo, useState } from 'react';
import { bestPair, buildPlan, rankMarkets, shareText, type CartItem } from '../cart';
import { brl, type Group } from '../lib';
import { Icon, MarketLogo } from './Parts';
import { Star, conditionText } from './ProductList';

type Props = { cart: CartItem[]; setCart: (c: CartItem[]) => void; groups: Map<string, Group>; markets: string[] };

export function CartPanel({ cart, setCart, groups, markets }: Props) {
  const [copied, setCopied] = useState(false);
  const items = cart.filter((c) => groups.has(c.g));
  const key = items.map((c) => c.g + c.qty).join();
  const rank = useMemo(() => rankMarkets(groups, items, markets), [groups, key, markets]); // eslint-disable-line react-hooks/exhaustive-deps
  const pair = useMemo(() => bestPair(groups, items, markets), [groups, key, markets]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildPlan(groups, items, markets), [groups, key, markets]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = rank.find((r) => r.missing.length === 0);
  const pairGain = best && pair ? best.total - pair.total : 0;
  const showPair = pair && (!best || pairGain > 0.009);
  const setQty = (g: string, q: number) => setCart(q <= 0 ? cart.filter((c) => c.g !== g) : cart.map((c) => (c.g === g ? { ...c, qty: Math.min(99, q) } : c)));
  const name = (g: string) => groups.get(g)?.name ?? '';

  const share = async () => {
    if (!plan) return;
    const text = shareText(plan, name);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { return; /* cancelou */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão */ }
  };

  return (
    <section id="carrinho" className="glass p-4" aria-label="Carrinho Inteligente">
      <div className="flex items-center gap-3">
        <span className="relative text-sky"><Icon name="cart" className="h-8 w-8" /><span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-neon text-[0.7rem] font-bold text-night">{items.length}</span></span>
        <h2 className="font-display text-2xl font-bold leading-none">Carrinho Inteligente</h2>
      </div>

      {!items.length ? (
        <p className="mt-3 rounded-xl border border-dashed border-edge p-4 text-sm text-muted">
          Marque produtos ou toque em <b className="text-ink">Pôr na lista</b>. Aqui aparece onde a sua lista sai mais barata.
        </p>
      ) : (
        <>
          {/* 1. itens, cada um com o mercado onde comprar (pelo plano mais barato) */}
          <ul className="mt-3 space-y-1">
            {items.map((c) => {
              const line = plan?.lines.find((l) => l.g === c.g);
              const g = groups.get(c.g)!;
              const it = line && g.items.find((i) => i.market === line.market);
              const cond = it ? conditionText(it, g) : null;
              return (
                <li key={c.g} className="rounded-lg bg-panel2/70 px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold" title={g.name}>{g.name}</span>
                    <button onClick={() => setQty(c.g, c.qty - 1)} aria-label="Menos" className="rounded bg-edge p-1"><Icon name="minus" className="h-3 w-3" /></button>
                    <span className="num w-5 text-center font-bold">{c.qty}</span>
                    <button onClick={() => setQty(c.g, c.qty + 1)} aria-label="Mais" className="rounded bg-edge p-1"><Icon name="plus" className="h-3 w-3" /></button>
                    <button onClick={() => setQty(c.g, 0)} aria-label="Tirar da lista" className="p-0.5 text-muted hover:text-signal"><Icon name="x" className="h-4 w-4" /></button>
                  </div>
                  {line ? (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <MarketLogo name={line.market} h="h-5" />
                      <span className="num ml-auto inline-flex items-center font-bold text-ink">{brl(line.total)}{cond && <Star text={cond} />}</span>
                    </div>
                  ) : <p className="mt-1 text-xs text-gold">nenhum mercado da lista tem este item</p>}
                </li>
              );
            })}
          </ul>

          {/* 2. melhor mercado para a lista toda */}
          <h3 className="mt-4 flex items-center gap-2 font-display text-lg font-bold"><Icon name="trophy" className="h-5 w-5 text-gold" />Melhor mercado para a lista toda</h3>
          <ol className="mt-2 divide-y divide-edge/70 overflow-hidden rounded-xl border border-edge">
            {rank.slice(0, 5).map((r, i) => {
              const top = r === best;
              return (
                <li key={r.market} className={`flex items-center gap-3 px-3 py-2 ${top ? 'bg-neon/10' : ''}`}>
                  <span className={`num w-4 text-sm font-bold ${top ? 'text-neon' : 'text-muted'}`}>{i + 1}</span>
                  <MarketLogo name={r.market} h="h-6" />
                  <span className="ml-auto text-right">
                    <span className={`num block font-display text-lg font-bold ${top ? 'text-neon' : ''}`}>{brl(r.total)}</span>
                    {r.missing.length > 0 && <span className="block text-[0.7rem] text-gold">tem {r.have} de {items.length}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {!best && <p className="mt-2 text-xs text-gold">Nenhum mercado tem a lista inteira.</p>}

          {/* 3. divisão em 2 mercados, separada */}
          {showPair && pair && (
            <div className="mt-4 rounded-xl border border-sky/60 bg-sky/5 p-3">
              <h3 className="font-display text-lg font-bold">Ou divida em 2 mercados</h3>
              <p className="mt-0.5 text-xs text-muted">{best ? <>Sai <b className="text-neon">{brl(pairGain)}</b> mais barato que o melhor mercado sozinho.</> : 'Assim a lista inteira fica coberta.'}</p>
              {[pair.a, pair.b].map((m) => {
                const ls = pair.picks.filter((p) => p.market === m);
                return (
                  <div key={m} className="mt-2 rounded-lg bg-panel2/70 p-2">
                    <div className="flex items-center"><MarketLogo name={m} h="h-6" /><span className="num ml-auto font-bold">{brl(ls.reduce((s, p) => s + p.cost, 0))}</span></div>
                    <ul className="mt-1 text-xs text-muted">{ls.map((p) => <li key={p.g} className="truncate">• {name(p.g)}</li>)}</ul>
                  </div>
                );
              })}
              <p className="mt-2 flex items-center justify-between font-bold"><span>Total</span><span className="num font-display text-xl text-sky">{brl(pair.total)}</span></p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button onClick={share} disabled={!plan} className="inline-flex items-center justify-center gap-2 rounded-xl bg-neon px-3 py-2.5 font-bold text-night hover:brightness-110 disabled:opacity-50">
              <Icon name="share" className="h-4 w-4" />{copied ? 'Texto copiado' : 'Mandar no WhatsApp'}
            </button>
            <button onClick={() => setCart([])} className="rounded-xl border border-edge px-3 py-2.5 text-sm font-bold text-muted hover:text-ink">Limpar</button>
          </div>
        </>
      )}
    </section>
  );
}

