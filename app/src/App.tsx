import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildGroups, each, norm, type Group, type Indexed, type Offer } from './lib';
import { decodeCart, type CartItem } from './cart';
import { ProductList } from './components/ProductList';
import { CartPanel } from './components/CartPanel';
import { Offers, pickOffers } from './components/Offers';
import { Icon, MarketLogo } from './components/Parts';

const BASE = import.meta.env.BASE_URL;
const PAGE = 30;

type MarketInfo = { name: string; file: string; products: number; storeScope: string | null; collectedAt: string; cities?: string[]; source?: 'site' | 'encarte' };
type InfoOnly = { name: string; cities: string[]; note: string; address: string; links: { label: string; url: string }[] };

const CATEGORIES = [
  { id: '', label: 'Todos', icon: '▦' },
  { id: 'hortifruti', label: 'Hortifruti', icon: '🍎' },
  { id: 'carnes', label: 'Carnes', icon: '🥩' },
  { id: 'laticinios', label: 'Laticínios', icon: '🥛' },
  { id: 'bebidas', label: 'Bebidas', icon: '🍾' },
  { id: 'mercearia', label: 'Mercearia', icon: '🥫' },
  { id: 'limpeza', label: 'Limpeza', icon: '🧴' },
  { id: 'higiene', label: 'Higiene', icon: '🧻' },
  { id: 'outros', label: 'Mais', icon: '⋯' },
];
const SORTS = [
  { id: 'preco', label: 'Menor preço' },
  { id: 'preco-desc', label: 'Maior preço' },
  { id: 'nome', label: 'Nome' },
];

// guardado no navegador de quem usa (sem login)
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };

export default function App() {
  const [all, setAll] = useState<Indexed[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [infoOnly, setInfoOnly] = useState<InfoOnly[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const params = new URLSearchParams(location.search);
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const dq = useDeferredValue(q);
  const [city, setCity] = useState(() => load('bate-cidade', ''));
  const [category, setCategory] = useState('');
  const [market, setMarket] = useState('');
  const [sort, setSort] = useState('preco');
  const [shown, setShown] = useState(PAGE);
  const [favs, setFavs] = useState<Set<string>>(() => new Set(load<string[]>('bate-favoritos', [])));
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [cart, setCartState] = useState<CartItem[]>(() => {
    // lista recebida por link (?lista=...) se junta à que já está no navegador
    const mine = load<CartItem[]>('bate-lista', []);
    for (const c of decodeCart(params.get('lista'))) if (!mine.some((m) => m.g === c.g)) mine.push(c);
    return mine;
  });
  const setCart = (c: CartItem[]) => { setCartState(c); save('bate-lista', c); };
  useEffect(() => {
    if (params.get('lista')) { save('bate-lista', cart); history.replaceState(null, '', location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => save('bate-cidade', city), [city]);

  useEffect(() => {
    setStatus('loading');
    (async () => {
      try {
        const idx = await (await fetch(`${BASE}data/index.json`)).json();
        const parts = await Promise.all(
          idx.markets.map(async (m: MarketInfo) => {
            const r = await fetch(`${BASE}data/${m.file}`);
            if (!r.ok) throw new Error(m.name);
            return (await r.json()) as Offer[];
          }),
        );
        setMarkets(idx.markets);
        setInfoOnly(idx.infoOnly ?? []);
        setGeneratedAt(idx.generatedAt);
        // oferta vencida some (um folheto pode vencer antes da próxima leitura)
        const now = Date.now();
        setAll(parts.flat().filter((o) => !o.validUntil || new Date(o.validUntil).getTime() > now).map((o) => ({ ...o, _n: norm(`${o.name} ${o.brand ?? ''}`) })));
        setStatus('ok');
      } catch {
        setStatus('error');
      }
    })();
  }, [attempt]);

  useEffect(() => setShown(PAGE), [dq, category, market, city, sort, onlyFavs]);
  const cities = useMemo(() => [...new Set(markets.flatMap((m) => m.cities ?? []))].filter((c) => c === 'Mauá' || c === 'Ribeirão Pires').sort(), [markets]);
  const inCity = useMemo(() => new Set(markets.filter((m) => !city || (m.cities ?? []).includes(city)).map((m) => m.name)), [markets, city]);
  // colunas: todos os mercados da região escolhida, do que tem mais produtos para o que tem menos
  const columns = useMemo(() => markets.filter((m) => inCity.has(m.name)).sort((a, b) => b.products - a.products).map((m) => m.name), [markets, inCity]);
  useEffect(() => { if (market && !inCity.has(market)) setMarket(''); }, [inCity, market]);

  const cityOffers = useMemo(() => (city ? all.filter((o) => inCity.has(o.market)) : all), [all, city, inCity]);
  const groups = useMemo(() => buildGroups(cityOffers), [cityOffers]);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const offers = useMemo(() => pickOffers(cityOffers), [cityOffers]);
  const terms = useMemo(() => norm(dq).split(/\s+/).filter(Boolean), [dq]);

  const list = useMemo(() => {
    const hit = (n: string) => terms.every((t) => n.includes(t));
    const r = groups.filter((g) => (!category || g.items.some((i) => i.category === category)) && (!market || g.items.some((i) => i.market === market)) && (!onlyFavs || favs.has(g.id)) && hit(g._n));
    // ordem pelo preço em destaque; com um mercado escolhido, pelo preço dele
    const price = (g: Group) => {
      if (!market) return g.shown;
      const it = g.items.find((i) => i.market === market)!;
      return g.perUnit ? each(it) : it.price;
    };
    return r.sort(sort === 'nome' ? (x, y) => x.name.localeCompare(y.name) : sort === 'preco-desc' ? (x, y) => price(y) - price(x) : (x, y) => price(x) - price(y));
  }, [groups, terms, category, market, sort, onlyFavs, favs]);

  const toggleFav = (id: string) => { const n = new Set(favs); if (n.has(id)) n.delete(id); else n.add(id); setFavs(n); save('bate-favoritos', [...n]); };
  // m: mercado escolhido na etiqueta (item fica fixo nele); sem m, o carrinho escolhe o mais barato
  const add = (g: string, m?: string) => {
    const has = cart.find((c) => c.g === g);
    if (!has) return setCart([...cart, m ? { g, qty: 1, m } : { g, qty: 1 }]);
    // trocar de mercado não soma quantidade; clicar de novo no mesmo soma 1
    const same = (has.m ?? '') === (m ?? '');
    setCart(cart.map((c) => (c.g === g ? { ...c, qty: same ? Math.min(99, c.qty + 1) : c.qty, m } : c)));
  };
  const inCart = useMemo(() => new Set(cart.map((c) => c.g)), [cart]);
  const clear = () => { setQ(''); setCategory(''); setMarket(''); setOnlyFavs(false); };
  const updated = generatedAt ? new Date(generatedAt).toLocaleDateString('pt-BR') : '';

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, rgba(6,11,26,.2) 0, rgba(6,11,26,.75) 300px, #060b1a 560px), url(${BASE}fundo.webp) top center / max(1500px, 100%) auto no-repeat, #060b1a` }}>
      <header className="sticky top-0 z-30 border-b border-edge/80 bg-night/95">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <a href={BASE} aria-label="Bate Ofertas, início"><img src={`${BASE}bate-ofertas.webp`} alt="Bate Ofertas" className="h-11 w-auto sm:h-14" /></a>
          <label className="ml-1 hidden items-center gap-2 rounded-xl border border-sky/60 bg-panel px-3 py-1.5 shadow-sky sm:flex">
            <Icon name="pin" className="h-5 w-5 text-sky" />
            <span className="leading-tight">
              <span className="block text-[0.7rem] text-muted">Minha região</span>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="bg-transparent text-sm font-bold outline-none" aria-label="Minha região">
                <option value="" className="bg-panel">Mauá e Ribeirão Pires</option>
                {cities.map((c) => <option key={c} value={c} className="bg-panel">{c}</option>)}
              </select>
            </span>
          </label>
          <nav className="ml-auto flex items-center gap-1 sm:gap-3">
            <a href="#ofertas" className="flex flex-col items-center px-2 text-xs text-muted hover:text-ink"><Icon name="flame" className="h-6 w-6 text-fire" fill />Ofertas</a>
            <button onClick={() => setOnlyFavs(!onlyFavs)} aria-pressed={onlyFavs} className={`flex flex-col items-center px-2 text-xs ${onlyFavs ? 'text-signal' : 'text-muted hover:text-ink'}`}>
              <Icon name="heart" className="h-6 w-6" fill={onlyFavs} />Favoritos
            </button>
            <a href="#carrinho" className="relative flex items-center gap-2 rounded-xl border border-sky/70 px-3 py-2 font-bold shadow-sky hover:bg-sky/10">
              <Icon name="cart" className="h-5 w-5 text-sky" /><span className="hidden sm:inline">Minha lista</span>
              {cart.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neon px-1 text-[0.7rem] font-bold text-night">{cart.length}</span>}
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-4 sm:pt-6">
        <div className="flex items-start gap-3">
          <Icon name="bolt" className="mt-1 h-9 w-9 shrink-0 text-fire drop-shadow-[0_0_12px_rgba(255,138,30,.8)] sm:h-12 sm:w-12" fill />
          <div>
            <h1 className="font-display text-[2rem] font-extrabold italic uppercase leading-[0.9] tracking-tight sm:text-5xl">
              Combate de <span className="title-fire">preços</span>
            </h1>
            <p className="mt-1.5 text-xs font-bold uppercase tracking-wide text-ink/85 sm:text-sm">
              Compare os preços dos mercados de Mauá e Ribeirão Pires{updated && `, atualizados em ${updated}`}.
            </p>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-sky/60 bg-panel px-3 py-2 sm:hidden">
          <Icon name="pin" className="h-5 w-5 text-sky" />
          <select value={city} onChange={(e) => setCity(e.target.value)} className="flex-1 bg-transparent text-sm font-bold outline-none" aria-label="Minha região">
            <option value="" className="bg-panel">Mauá e Ribeirão Pires</option>
            {cities.map((c) => <option key={c} value={c} className="bg-panel">{c}</option>)}
          </select>
        </label>
      </section>

      <div className="mx-auto grid max-w-[1400px] gap-5 px-4 pb-16 lg:grid-cols-[minmax(0,1fr)_370px]">
        <main className="min-w-0 space-y-4">
          <div className="glass p-2">
            <div className="flex gap-2 overflow-x-auto xl:grid xl:grid-cols-9 xl:overflow-visible">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={`flex min-w-[5.6rem] shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-sm font-bold ${category === c.id ? 'border-neon bg-neon/15 text-ink shadow-neon' : 'border-edge bg-panel2/70 text-ink/90 hover:border-sky/60'}`}
                >
                  <span className="text-2xl leading-none" aria-hidden>{c.icon}</span>{c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass space-y-3 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="glow-ring flex flex-1 items-center gap-2 rounded-2xl px-4">
                <Icon name="search" className="h-5 w-5 text-muted" />
                <span className="sr-only">Buscar produto</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque por produtos ou marcas..." className="h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted" />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                Ordenar por
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar por" className="rounded-xl border border-edge bg-panel2 px-3 py-2.5 font-bold text-ink">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* filtro por mercado: um botão com o logotipo de cada mercado da região */}
            <div role="group" aria-label="Mercado" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
              <button onClick={() => setMarket('')} aria-pressed={market === ''} className={`min-h-[2.75rem] shrink-0 rounded-xl border px-3 text-sm font-bold ${market === '' ? 'border-sky bg-sky/15 text-ink' : 'border-edge bg-panel2 text-muted'}`}>Todos</button>
              {columns.map((m) => (
                <button key={m} onClick={() => setMarket(market === m ? '' : m)} aria-pressed={market === m} className={`flex min-h-[2.75rem] shrink-0 items-center rounded-xl border px-2 ${market === m ? 'border-sky bg-sky/15' : 'border-edge bg-panel2 hover:border-sky/60'}`}>
                  <MarketLogo name={m} h="h-7" />
                </button>
              ))}
            </div>

            {status === 'ok' && (
              <p className="text-xs text-muted">
                {list.length.toLocaleString('pt-BR')} produtos
                {market && <> no <b className="text-ink">{market}</b> · <button onClick={() => setMarket('')} className="text-sky underline">ver todos os mercados</button></>}
                {onlyFavs && <> · só favoritos</>}
              </p>
            )}

            {status === 'loading' && <div className="h-64 animate-pulse rounded-2xl bg-panel2" aria-label="Carregando preços" />}
            {status === 'error' && (
              <div role="alert" className="rounded-xl border border-signal/60 p-4">
                <p className="font-bold">Não consegui carregar os preços.</p>
                <button onClick={() => setAttempt((a) => a + 1)} className="mt-2 rounded-xl bg-sky px-4 py-2 font-bold text-night">Tentar de novo</button>
              </div>
            )}
            {status === 'ok' && list.length === 0 && (
              <div className="rounded-xl border border-edge p-6 text-center">
                <p className="font-bold">{dq ? `Não achei "${dq}".` : onlyFavs ? 'Você ainda não favoritou nenhum produto.' : 'Nada por aqui com esses filtros.'}</p>
                <button onClick={clear} className="mt-3 rounded-xl border border-sky/70 px-4 py-2 font-bold text-sky">Limpar busca e filtros</button>
              </div>
            )}
            {status === 'ok' && list.length > 0 && (
              <ProductList groups={list.slice(0, shown)} only={market} favs={favs} onFav={toggleFav} inCart={inCart} onAdd={add} />
            )}
            {status === 'ok' && shown < list.length && (
              <button onClick={() => setShown((s) => s + PAGE)} className="w-full rounded-xl border border-sky/60 py-3 font-bold text-sky hover:bg-sky/10">
                Mostrar mais ({shown} de {list.length.toLocaleString('pt-BR')})
              </button>
            )}
          </div>
        </main>

        <aside className="space-y-5">
          <CartPanel cart={cart} setCart={setCart} groups={byId} markets={columns} />
          <Offers offers={offers} onAdd={(o) => add(o.g ?? `p:${o.id}`)} />
        </aside>
      </div>

      <footer className="border-t border-edge bg-night/90">
        <div className="mx-auto max-w-[1400px] px-4 py-6 text-xs text-muted">
          <p className="font-bold text-ink">De onde vêm os preços</p>
          <ul className="mt-1 space-y-0.5">
            {markets.map((m) => <li key={m.name}>{m.name}: {m.products.toLocaleString('pt-BR')} produtos{m.storeScope ? `, ${m.storeScope}` : ''}</li>)}
            {infoOnly.map((m) => (
              <li key={m.name}>
                {m.name} ({m.address}): {m.note}{' '}
                {m.links.map((l, i) => <span key={l.url}>{i > 0 && ' · '}<a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sky underline">{l.label}</a></span>)}
              </li>
            ))}
          </ul>
          <p className="mt-3">Parte das ofertas vem de folhetos lidos por inteligência artificial; o preço leva à oferta original. Sua lista e seus favoritos ficam só neste navegador.</p>
          <p className="mt-1">Preços e ofertas mudam a qualquer momento e variam por loja. Confirme na prateleira. As marcas pertencem aos seus donos.</p>
        </div>
      </footer>
    </div>
  );
}
