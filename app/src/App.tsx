import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildGroups, norm, type Group, type Indexed, type Offer } from './lib';
import { GroupRow, OfferRow, SkeletonRows } from './components/Rows';

const BASE = import.meta.env.BASE_URL;
const PAGE = 40;

type MarketInfo = { name: string; file: string; products: number; storeScope: string | null; collectedAt: string };
type View = 'comparar' | 'todos';

const CATEGORIES = [
  { id: '', label: 'Tudo' },
  { id: 'alimenticios', label: 'Alimentos e bebidas' },
  { id: 'higiene', label: 'Higiene' },
  { id: 'limpeza', label: 'Limpeza' },
];
const SORTS: Record<View, { id: string; label: string }[]> = {
  comparar: [{ id: 'economia', label: 'Maior economia' }, { id: 'nome', label: 'Nome' }],
  todos: [{ id: 'preco', label: 'Menor preço' }, { id: 'desconto', label: 'Maior desconto' }, { id: 'nome', label: 'Nome' }],
};

export default function App() {
  const [all, setAll] = useState<Indexed[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [view, setView] = useState<View>('comparar');
  const [category, setCategory] = useState('');
  const [market, setMarket] = useState('');
  const [sort, setSort] = useState('economia');
  const [focus, setFocus] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

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
        setGeneratedAt(idx.generatedAt);
        setAll(parts.flat().map((o) => ({ ...o, _n: norm(`${o.name} ${o.brand ?? ''}`) })));
        setStatus('ok');
      } catch {
        setStatus('error');
      }
    })();
  }, [attempt]);

  useEffect(() => setShown(PAGE), [dq, view, category, market, sort, focus]);
  useEffect(() => setSort(SORTS[view][0].id), [view]);

  const groups = useMemo(() => buildGroups(all), [all]);
  const terms = useMemo(() => norm(dq).split(/\s+/).filter(Boolean), [dq]);
  const hit = (n: string) => terms.every((t) => n.includes(t));

  const groupList = useMemo(() => {
    const r = groups.filter(
      (g) => (!focus || g.id === focus) && (!category || g.category === category) && (!market || g.items.some((i) => i.market === market)) && hit(g._n),
    );
    const lead = (g: Group) => (terms.length && !g.items.some((i) => i._n.startsWith(terms[0])) ? 1 : 0);
    return r.sort(sort === 'nome' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => lead(a) - lead(b) || b.saving - a.saving);
  }, [groups, terms, category, market, sort, focus]);

  const offerList = useMemo(() => {
    const disc = (o: Indexed) => (o.listPrice && o.listPrice > o.price ? (o.listPrice - o.price) / o.listPrice : 0);
    const r = all.filter((o) => (!category || o.category === category) && (!market || o.market === market) && hit(o._n));
    // Com busca, quem "é" o produto (nome começa com o termo) vem antes de quem só o menciona (tempero de feijão).
    const lead = (o: Indexed) => (terms.length && !o._n.startsWith(terms[0]) ? 1 : 0);
    return r.sort(
      sort === 'nome' ? (a, b) => a._n.localeCompare(b._n)
        : sort === 'desconto' ? (a, b) => lead(a) - lead(b) || disc(b) - disc(a)
        : (a, b) => lead(a) - lead(b) || a.price - b.price,
    );
  }, [all, terms, category, market, sort]);

  const list = view === 'comparar' ? groupList : offerList;
  const clear = () => { setQ(''); setCategory(''); setMarket(''); setFocus(null); };
  const updated = generatedAt ? new Date(generatedAt).toLocaleDateString('pt-BR') : '';

  return (
    <div className="min-h-screen">
      <header className="on-ink bg-ink text-paper">
        <div className="mx-auto max-w-4xl px-4 pb-5 pt-6">
          <h1 className="font-display text-[2.5rem] font-extrabold leading-[0.95] sm:text-6xl">
            Quanto custa em Mauá e Ribeirão Pires
          </h1>
          <p className="mt-3 max-w-prose text-sm text-paper/75">
            Compare o mesmo produto em {markets.length || 'vários'} mercados. Os preços vêm dos sites e folhetos de cada um{updated && `, atualizados em ${updated}`}.
          </p>
          <label className="mt-4 block">
            <span className="sr-only">Buscar produto</span>
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setFocus(null); }}
              placeholder="Arroz 5kg, café, detergente"
              className="h-14 w-full border-b-4 border-tag bg-paper px-4 text-lg text-ink placeholder:text-muted"
            />
          </label>
        </div>
      </header>

      <div className="border-b border-line bg-paper/95 backdrop-blur sm:sticky sm:top-0 sm:z-10">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Tipo de lista" className="flex border border-ink">
              {([['comparar', `Comparar (${groupList.length})`], ['todos', `Todos os produtos (${offerList.length})`]] as [View, string][]).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => { setView(v); setFocus(null); }}
                  className={`min-h-[2.75rem] px-3 text-sm font-bold ${view === v ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <select aria-label="Mercado" value={market} onChange={(e) => setMarket(e.target.value)} className="min-h-[2.75rem] border border-line bg-white px-2 text-sm">
                <option value="">Todos os mercados</option>
                {markets.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
              <select aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-[2.75rem] border border-line bg-white px-2 text-sm">
                {SORTS[view].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`min-h-[2.5rem] shrink-0 border px-3 text-sm ${category === c.id ? 'border-ink bg-tag font-bold' : 'border-line bg-white'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-2">
        {focus && (
          <button onClick={() => setFocus(null)} className="mb-1 mt-2 min-h-[2.5rem] text-sm font-bold underline underline-offset-2">
            Voltar para todos os produtos comparáveis
          </button>
        )}

        {status === 'loading' && <SkeletonRows />}

        {status === 'error' && (
          <div role="alert" className="my-8 border-l-4 border-signal bg-white p-4">
            <p className="font-bold">Não consegui carregar os preços.</p>
            <p className="mt-1 text-sm text-muted">Confira sua conexão e tente de novo. Se continuar, o site pode estar sendo atualizado.</p>
            <button onClick={() => setAttempt((a) => a + 1)} className="mt-3 min-h-[2.75rem] bg-ink px-4 font-bold text-paper">Tentar de novo</button>
          </div>
        )}

        {status === 'ok' && list.length === 0 && (
          <div className="my-8">
            <p className="text-lg font-bold">
              {view === 'comparar' && offerList.length > 0
                ? `Nenhum mercado tem "${dq}" para comparar.`
                : dq ? `Não achei "${dq}".` : 'Nada por aqui com esses filtros.'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {view === 'comparar' && offerList.length > 0
                ? `Ele aparece em ${offerList.length} ${offerList.length === 1 ? 'oferta' : 'ofertas'}, mas só em um mercado.`
                : 'Tente só o nome do produto, sem marca nem tamanho, ou tire um filtro.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {view === 'comparar' && offerList.length > 0 && (
                <button onClick={() => setView('todos')} className="min-h-[2.75rem] bg-ink px-4 font-bold text-paper">Ver {offerList.length} em Todos os produtos</button>
              )}
              <button onClick={clear} className="min-h-[2.75rem] border border-ink px-4 font-bold">Limpar busca e filtros</button>
            </div>
          </div>
        )}

        {status === 'ok' && list.length > 0 && (
          <ul>
            {view === 'comparar'
              ? groupList.slice(0, shown).map((g: Group) => <GroupRow key={g.id} g={g} />)
              : offerList.slice(0, shown).map((o) => (
                  <OfferRow key={o.id} o={o} onCompare={() => { setView('comparar'); setFocus(o.g!); }} />
                ))}
          </ul>
        )}

        {status === 'ok' && shown < list.length && (
          <button onClick={() => setShown((s) => s + PAGE)} className="mt-5 min-h-[3rem] w-full border-2 border-ink font-bold">
            Mostrar mais ({shown} de {list.length})
          </button>
        )}

        <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
          <p className="font-bold text-ink">De onde vêm os preços</p>
          <ul className="mt-1 space-y-0.5">
            {markets.map((m) => (
              <li key={m.name}>
                {m.name}: {m.products.toLocaleString('pt-BR')} produtos{m.storeScope ? `, ${m.storeScope}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-3">Preços e ofertas podem mudar a qualquer momento e variam por loja. Confirme na prateleira antes de ir.</p>
        </footer>
      </main>
    </div>
  );
}
