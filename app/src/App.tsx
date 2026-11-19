import { lazy, startTransition, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { buildGroups, each, norm, type Group, type Indexed, type Offer } from './lib';
import { decodeCart, keyOf, type CartItem } from './cart';
import { ProductList } from './components/ProductList';
import { CartPanel } from './components/CartPanel';
import { Offers, pickOffers } from './components/Offers';
import { Icon, MarketLogo } from './components/Parts';
import { haystack, match, parseQuery } from './search';
import type { HistMeta } from './history';
import { CityAdBanner, CityAdCard } from './components/CityAd';
import { CityPicker } from './components/CityPicker';
import { Logo } from './components/Logo';
import { ScrollRow } from './components/ScrollRow';
import { DATA_BASE, isApp, useFromCache } from './native';
import { groupBySegment, splitLoad, type Segment } from './pharma';
import { effectiveCities, marketInCities, migrateCities, serializeCities, type Sel } from './cities';

const SuaCidade = lazy(() => import('./pages/SuaCidade'));
const BASE = import.meta.env.BASE_URL;
const PAGE = 30;

type MarketInfo = { name: string; file: string; products: number; storeScope: string | null; collectedAt: string; cities?: string[]; source?: 'site' | 'encarte'; segment?: Segment };

const CATEGORIES = [
  { id: '', label: 'Todos', icon: '▦' },
  { id: 'hortifruti', label: 'Hortifruti', icon: '🍎' },
  { id: 'carnes', label: 'Carnes', icon: '🥩' },
  { id: 'laticinios', label: 'Laticínios', icon: '🥛' },
  { id: 'bebidas', label: 'Bebidas', icon: '🍾' },
  { id: 'mercearia', label: 'Mercearia', icon: '🥫' },
  { id: 'limpeza', label: 'Limpeza', icon: '🧴' },
  { id: 'higiene', label: 'Higiene', icon: '🧻' },
  { id: 'farmacia', label: 'Farmácia', icon: '💊' },
];
const SORTS = [
  { id: 'preco', label: 'Menor preço' },
  { id: 'preco-desc', label: 'Maior preço' },
  { id: 'nome', label: 'Nome' },
];

// guardado no navegador de quem usa (sem login)
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };

function Comparador() {
  const [all, setAll] = useState<Indexed[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [hist, setHist] = useState<HistMeta | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const offline = useFromCache(); // so no app: precos vindos da copia guardada no aparelho

  const params = new URLSearchParams(location.search);
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const dq = useDeferredValue(q);
  // null = todas as cidades; lista = só essas; lista vazia = nenhuma
  const [rawCities, setCities] = useState<Sel>(() => {
    try { return migrateCities(localStorage.getItem('bate-cidades2'), localStorage.getItem('bate-cidades'), localStorage.getItem('bate-cidade')); } catch { return null; }
  });
  const [category, setCategory] = useState('');
  const [market, setMarket] = useState('');
  const [sort, setSort] = useState('preco');
  const [shown, setShown] = useState(PAGE);
  const [favs, setFavs] = useState<Set<string>>(() => new Set(load<string[]>('bate-favoritos', [])));
  const [onlyFavs, setOnlyFavs] = useState(false);
  // oferta selecionada em cada produto (borda amarela): id do grupo -> mercado
  const [selected, setSelected] = useState<Record<string, string>>({});
  const onSelect = (id: string, m: string) => setSelected((s) => { const n = { ...s }; if (n[id] === m) delete n[id]; else n[id] = m; return n; });
  const [cart, setCartState] = useState<CartItem[]>(() => {
    // lista recebida por link (?lista=...) se junta à que já está no navegador
    const mine = load<CartItem[]>('bate-lista', []);
    for (const c of decodeCart(params.get('lista'))) if (!mine.some((m) => m.g === c.g)) mine.push(c);
    return mine;
  });
  const setCart = (c: CartItem[]) => { setCartState(c); save('bate-lista', c); };
  // no celular o carrinho abre por toque (no computador fica sempre aberto); lista recebida por link já chega aberta
  // no app o carrinho já chega aberto quando a lista tem itens
  const [cartOpen, setCartOpen] = useState(() => !!params.get('lista') || (isApp() && load<CartItem[]>('bate-lista', []).length > 0));
  useEffect(() => {
    if (params.get('lista')) { save('bate-lista', cart); history.replaceState(null, '', location.pathname + location.hash); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      localStorage.setItem('bate-cidades2', serializeCities(rawCities));
      localStorage.removeItem('bate-cidades'); localStorage.removeItem('bate-cidade'); // chaves antigas, já migradas
    } catch { /* sem armazenamento */ }
  }, [rawCities]);

  // Carrega o arquivo de cada mercado; o que falhar é ignorado só quando `tolerant` (farmácia, em segundo plano).
  const fetchMarket = async (m: MarketInfo) => {
    const r = await fetch(`${DATA_BASE}data/${m.file}`);
    if (!r.ok) throw new Error(m.name);
    return (await r.json()) as Offer[];
  };
  // oferta vencida some (um folheto pode vencer antes da próxima leitura)
  const prepare = (parts: Offer[][]): Indexed[] => {
    const now = Date.now();
    return parts.flat().filter((o) => !o.validUntil || new Date(o.validUntil).getTime() > now).map((o) => ({ ...o, _n: norm(`${o.name} ${o.brand ?? ''}`) }));
  };
  // Cada recarga tem um número; uma recarga antiga que chega atrasada não sobrescreve a nova.
  const loadId = useRef(0);
  // silent: recarga em segundo plano (volta da internet no app): sem tela de carregando e sem mostrar erro
  const loadData = async (silent: boolean) => {
    const id = ++loadId.current;
    if (!silent) setStatus('loading');
    try {
      const idx = await (await fetch(`${DATA_BASE}data/index.json`)).json();
      // peso no celular: farmácias (dezenas de milhares de itens) só depois que a primeira tela já apareceu
      const { first, later } = splitLoad<MarketInfo>(idx.markets);
      const parts = await Promise.all(first.map(fetchMarket));
      if (id !== loadId.current) return;
      setMarkets(first);
      setGeneratedAt(idx.generatedAt);
      setHist(idx.hist ?? null);
      setAll(prepare(parts));
      setStatus('ok');
      // uma farmácia por vez: a busca passa a incluí-la quando ela chega; falha numa não derruba as outras
      await new Promise((r) => setTimeout(r, 400));
      for (const m of later) {
        try {
          const rows = prepare([await fetchMarket(m)]);
          if (id !== loadId.current) return;
          startTransition(() => { setMarkets((cur) => [...cur.filter((x) => x.name !== m.name), m]); setAll((cur) => [...cur.filter((o) => o.market !== m.name), ...rows]); });
        } catch { /* farmácia fora do ar: o resto do site segue */ }
      }
    } catch {
      if (!silent && id === loadId.current) setStatus('error');
    }
  };
  useEffect(() => { void loadData(false); }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // so no app: com o aviso "sem internet" na tela, recarrega quando a rede volta e tenta de novo a cada ~20 s
  const refreshing = useRef(false);
  const loadRef = useRef(loadData); loadRef.current = loadData;
  useEffect(() => {
    if (!isApp() || !offline) return;
    const refresh = () => {
      if (refreshing.current) return;
      refreshing.current = true;
      void loadRef.current(true).finally(() => { refreshing.current = false; });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const t = setInterval(refresh, 20000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [offline]);

  useEffect(() => setShown(PAGE), [dq, category, market, rawCities, sort, onlyFavs]);
  const cityList = useMemo(() => [...new Set(markets.flatMap((m) => m.cities ?? []))].filter((c) => c === 'Mauá' || c === 'Ribeirão Pires').sort((a, b) => a.localeCompare(b, 'pt-BR')), [markets]);
  // cidades marcadas que existem de verdade (todas marcadas = sem filtro)
  const cities = useMemo(() => effectiveCities(rawCities, cityList), [rawCities, cityList]);
  const none = cities !== null && cities.length === 0;
  const inCity = useMemo(() => new Set(markets.filter((m) => marketInCities(m.cities, cities)).map((m) => m.name)), [markets, cities]);
  // colunas: todos os mercados da região escolhida, do que tem mais produtos para o que tem menos
  const columns = useMemo(() => markets.filter((m) => inCity.has(m.name)).sort((a, b) => b.products - a.products).map((m) => m.name), [markets, inCity]);
  const colGroups = useMemo(() => groupBySegment(columns, markets), [columns, markets]);
  const scopeOf = useMemo(() => new Map(markets.map((m) => [m.name, m.storeScope])), [markets]);
  useEffect(() => { if (market && !inCity.has(market)) setMarket(''); }, [inCity, market]);

  const cityOffers = useMemo(() => (cities === null ? all : all.filter((o) => inCity.has(o.market))), [all, cities, inCity]);
  const groups = useMemo(() => buildGroups(cityOffers), [cityOffers]);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const offers = useMemo(() => pickOffers(cityOffers), [cityOffers]);
  const offerById = useMemo(() => new Map(cityOffers.map((o) => [o.id, o])), [cityOffers]);
  const terms = useMemo(() => parseQuery(dq), [dq]);
  // texto de busca de cada produto preparado uma vez (sem acento, sem hífen, palavras separadas)
  const hays = useMemo(() => new Map(groups.map((g) => [g.id, haystack(g._n)])), [groups]);

  const list = useMemo(() => {
    const lvl = new Map<string, number>();
    const hit = (g: Group) => { if (!terms.length) return true; const m = match(hays.get(g.id)!, terms); if (m) lvl.set(g.id, m); return m > 0; };
    const r = groups.filter((g) => (!category || g.items.some((i) => i.category === category)) && (!market || g.items.some((i) => i.market === market)) && (!onlyFavs || favs.has(g.id)) && hit(g));
    // ordem pelo preço em destaque; com um mercado escolhido, pelo preço dele
    const price = (g: Group) => {
      if (!market) return g.shown;
      const it = g.items.find((i) => i.market === market)!;
      return g.perUnit ? each(it) : it.price;
    };
    const by = sort === 'nome' ? (x: Group, y: Group) => x.name.localeCompare(y.name) : sort === 'preco-desc' ? (x: Group, y: Group) => price(y) - price(x) : (x: Group, y: Group) => price(x) - price(y);
    // achados só com erro de digitação: entram só quando a busca exata acha pouco (menos de 5), e vão para o fim
    const exact = r.filter((g) => (lvl.get(g.id) ?? 1) === 1);
    const out = exact.length >= 5 ? exact : r;
    return out.sort((x, y) => ((lvl.get(x.id) ?? 1) - (lvl.get(y.id) ?? 1)) || by(x, y));
  }, [groups, hays, terms, category, market, sort, onlyFavs, favs]);

  const toggleFav = (id: string) => { const n = new Set(favs); if (n.has(id)) n.delete(id); else n.add(id); setFavs(n); save('bate-favoritos', [...n]); };
  // m: mercado escolhido na etiqueta (item fica fixo nele); sem m, o carrinho escolhe o mais barato
  // mesmo produto em mercados diferentes vira linhas diferentes; repetir o mesmo soma 1
  const add = (g: string, m?: string) => {
    const item: CartItem = m ? { g, qty: 1, m } : { g, qty: 1 };
    const k = keyOf(item);
    setCart(cart.some((c) => keyOf(c) === k) ? cart.map((c) => (keyOf(c) === k ? { ...c, qty: Math.min(99, c.qty + 1) } : c)) : [...cart, item]);
    if (m) setSelected((s) => { const n = { ...s }; delete n[g]; return n; });
    if (isApp()) setCartOpen(true); // no app o carrinho abre ao adicionar, mostrando o ranking
  };
  const inCart = useMemo(() => new Set(cart.map((c) => c.g)), [cart]);
  const clear = () => { setQ(''); setCategory(''); setMarket(''); setOnlyFavs(false); };
  const app = isApp();
  const updated = generatedAt ? new Date(generatedAt).toLocaleDateString('pt-BR') : '';

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, rgba(6,11,26,.2) 0, rgba(6,11,26,.75) 300px, #060b1a 560px), url(${BASE}fundo.webp) top center / max(1500px, 100%) auto no-repeat, #060b1a` }}>
      <header className="sticky top-0 z-30 border-b border-edge/80 bg-night/95">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <Logo compact={app} />
          <CityPicker available={cityList} selected={cities} onChange={setCities} className="ml-1 hidden w-56 sm:block" />
          <nav className="ml-auto flex items-center gap-1 sm:gap-3">
            <a href="#ofertas" className={`${app ? 'flex' : 'hidden sm:flex'} flex-col items-center px-2 text-xs text-muted hover:text-ink`}><Icon name="flame" className="h-6 w-6 text-fire" fill />Ofertas</a>
            {!app && <button onClick={() => setOnlyFavs(!onlyFavs)} aria-pressed={onlyFavs} className={`flex flex-col items-center px-2 text-xs ${onlyFavs ? 'text-signal' : 'text-muted hover:text-ink'}`}>
              <Icon name="heart" className="h-6 w-6" fill={onlyFavs} />Favoritos
            </button>}
            <a href="#carrinho" onClick={() => setCartOpen(true)} className="relative flex items-center gap-2 rounded-xl border border-sky/70 px-3 py-2 font-bold shadow-sky hover:bg-sky/10">
              <Icon name="cart" className="h-5 w-5 text-sky" /><span className="hidden sm:inline">Minha lista</span>
              {cart.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neon px-1 text-[0.7rem] font-bold text-night">{cart.length}</span>}
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-4 sm:pt-6">
        {app && <h1 id="comparador-h1" tabIndex={-1} className="sr-only">Bate Ofertas</h1>}
        {!app && <div className="flex items-start gap-3">
          <Icon name="bolt" className="mt-1 h-9 w-9 shrink-0 text-fire drop-shadow-[0_0_12px_rgba(255,138,30,.8)] sm:h-12 sm:w-12" fill />
          <div>
            <h1 id="comparador-h1" tabIndex={-1} className="outline-none font-display text-[2rem] font-extrabold italic uppercase leading-[0.9] tracking-tight sm:text-5xl">
              Combate de <span className="title-fire">preços</span>
            </h1>
            <p className="mt-1.5 text-xs font-bold uppercase tracking-wide text-ink/85 sm:text-sm">
              Todos supermercados num duelo pelo menor preço: e quem ganha é você!{updated && ` Atualizado em ${updated}.`}
            </p>
          </div>
        </div>}
        {offline && status === 'ok' && (
          <p role="status" className="mt-3 rounded-lg border border-edge bg-panel2/70 px-3 py-1.5 text-xs text-muted">
            Sem internet: mostrando os dados salvos{updated && <> de <b className="text-ink">{updated}</b></>}.
          </p>
        )}
        <CityPicker available={cityList} selected={cities} onChange={setCities} className="mt-4 sm:hidden" />
      </section>

      {/* celular: carrinho no topo (fechado num resumo), depois a lista, depois as ofertas.
          computador: lista à esquerda; carrinho e ofertas na coluna da direita */}
      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 pb-16 lg:grid-cols-[minmax(0,1fr)_370px] lg:grid-rows-[auto_1fr] lg:gap-5">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <CartPanel cart={cart} setCart={setCart} groups={byId} markets={columns} open={cartOpen} onToggle={() => setCartOpen(!cartOpen)} />
          <div className="mt-4 empty:hidden"><CityAdCard /></div>
        </div>
        <main className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="glass p-2">
            <div className="flex gap-2 overflow-x-auto xl:grid xl:grid-cols-10 xl:overflow-visible">
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
            <ScrollRow role="group" label="Mercado" className="gap-2 pb-1">
              <button onClick={() => setMarket('')} aria-pressed={market === ''} className={`min-h-[2.75rem] shrink-0 rounded-xl border px-3 text-sm font-bold ${market === '' ? 'border-sky bg-sky/15 text-ink' : 'border-edge bg-panel2 text-muted'}`}>Todos</button>
              {colGroups.map((gr) => (
                <div key={gr.id} role="group" aria-label={gr.title} className="flex shrink-0 items-center gap-2">
                  {colGroups.length > 1 && <span className="shrink-0 pl-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted">{gr.title}</span>}
                  {gr.names.map((m) => (
                    <button key={m} onClick={() => setMarket(market === m ? '' : m)} aria-pressed={market === m} className={`flex min-h-[2.75rem] shrink-0 items-center rounded-xl border px-2 ${market === m ? 'border-sky bg-sky/15' : 'border-edge bg-panel2 hover:border-sky/60'}`}>
                      <MarketLogo name={m} h="h-7" />
                    </button>
                  ))}
                </div>
              ))}
            </ScrollRow>

            {status === 'ok' && !none && (
              <p className="text-xs text-muted">
                {list.length.toLocaleString('pt-BR')} produtos
                {market && <> no <b className="text-ink">{market}</b>{scopeOf.get(market) && <> ({scopeOf.get(market)})</>} · <button onClick={() => setMarket('')} className="text-sky underline">ver todos os mercados</button></>}
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
            {status === 'ok' && none && (
              <div role="status" className="rounded-xl border border-gold/60 p-6 text-center">
                <p className="font-bold">Nenhuma cidade selecionada. Marque uma cidade em Minha região para ver os preços.</p>
                <button onClick={() => setCities(null)} className="mt-3 rounded-xl bg-neon px-4 py-2 font-bold text-night hover:brightness-110">Marcar todas</button>
              </div>
            )}
            {status === 'ok' && !none && list.length === 0 && (
              <div className="rounded-xl border border-edge p-6 text-center">
                <p className="font-bold">{dq ? `Não achei "${dq}".` : onlyFavs ? 'Você ainda não favoritou nenhum produto.' : 'Nada por aqui com esses filtros.'}</p>
                <button onClick={clear} className="mt-3 rounded-xl border border-sky/70 px-4 py-2 font-bold text-sky">Limpar busca e filtros</button>
              </div>
            )}
            {status === 'ok' && !none && list.length > 0 && (
              <ProductList groups={list.slice(0, shown)} only={market} favs={favs} onFav={toggleFav} inCart={inCart} onAdd={add} selected={selected} onSelect={onSelect} hist={hist} base={DATA_BASE} />
            )}
            {status === 'ok' && !none && shown < list.length && (
              <button onClick={() => setShown((s) => s + PAGE)} className="w-full rounded-xl border border-sky/60 py-3 font-bold text-sky hover:bg-sky/10">
                Mostrar mais ({shown} de {list.length.toLocaleString('pt-BR')})
              </button>
            )}
          </div>
        </main>

        <aside className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2">
          <Offers offers={offers} onAdd={(o) => add(o.g ?? `p:${o.id}`)} />
        </aside>
      </div>

      <CityAdBanner />
    </div>
  );
}

// Rota por hash, sem biblioteca: "#/sua-cidade" abre a página de venda (carregada só quando pedida).
// O comparador fica montado (escondido) para não perder busca, filtros nem rolagem ao voltar.
export default function App() {
  const [hash, setHash] = useState(() => location.hash);
  const scrollBack = useRef(0);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // baixa a página de venda em segundo plano (o service worker guarda, e ela abre sem internet)
  useEffect(() => { const t = setTimeout(() => { import('./pages/SuaCidade'); }, 4000); return () => clearTimeout(t); }, []);
  const sale = hash === '#/sua-cidade';
  const was = useRef(false);
  useEffect(() => {
    const focusH1 = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
    if (sale && !was.current) { scrollBack.current = window.scrollY; window.scrollTo(0, 0); focusH1('venda-h1'); }
    else if (!sale && was.current) { const y = scrollBack.current; requestAnimationFrame(() => window.scrollTo(0, hash && hash !== '#' ? 0 : y)); focusH1('comparador-h1'); }
    was.current = sale;
  }, [sale, hash]);
  return (
    <>
      <div hidden={sale}><Comparador /></div>
      {sale && (
        <Suspense fallback={<div className="grid min-h-screen place-items-center bg-night text-muted" role="status">Carregando...</div>}>
          <SuaCidade />
        </Suspense>
      )}
    </>
  );
}
