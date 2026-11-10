import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildGroups, each, norm, type Group, type Indexed, type Offer } from './lib';
import { GroupRow, SkeletonRows } from './components/Rows';
import { MarketLogo } from './components/Parts';

const BASE = import.meta.env.BASE_URL;
const PAGE = 40;

type MarketInfo = { name: string; file: string; products: number; storeScope: string | null; collectedAt: string; cities?: string[]; source?: 'site' | 'encarte' };
type InfoOnly = { name: string; cities: string[]; note: string; address: string; links: { label: string; url: string }[] };

const CATEGORIES = [
  { id: '', label: 'Tudo' },
  { id: 'alimenticios', label: 'Alimentos e bebidas' },
  { id: 'higiene', label: 'Higiene' },
  { id: 'limpeza', label: 'Limpeza' },
];
const SORTS = [
  { id: 'economia', label: 'Maior economia' },
  { id: 'preco', label: 'Menor preço' },
  { id: 'nome', label: 'Nome' },
];

export default function App() {
  const [all, setAll] = useState<Indexed[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [infoOnly, setInfoOnly] = useState<InfoOnly[]>([]);
  const [city, setCity] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  // ?q=café no endereço abre já com a busca (dá para mandar o link de uma busca)
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const dq = useDeferredValue(q);
  const [category, setCategory] = useState('');
  const [market, setMarket] = useState('');
  const [sort, setSort] = useState('economia');
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

  useEffect(() => setShown(PAGE), [dq, category, market, city, sort]);
  const cities = useMemo(() => [...new Set(markets.flatMap((m) => m.cities ?? []))].sort(), [markets]);
  // mercados com loja na cidade escolhida
  const inCity = useMemo(() => new Set(markets.filter((m) => !city || (m.cities ?? []).includes(city)).map((m) => m.name)), [markets, city]);

  const groups = useMemo(() => buildGroups(city ? all.filter((o) => inCity.has(o.market)) : all), [all, city, inCity]);
  const terms = useMemo(() => norm(dq).split(/\s+/).filter(Boolean), [dq]);

  const list = useMemo(() => {
    const hit = (n: string) => terms.every((t) => n.includes(t));
    const r = groups.filter((g) => (!category || g.category === category) && (!market || g.items.some((i) => i.market === market)) && hit(g._n));
    // Com busca, quem "é" o produto (nome começa com o termo) vem antes de quem só o menciona (tempero de feijão).
    const lead = (g: Group) => (terms.length && !g.items.some((i) => i._n.startsWith(terms[0])) ? 1 : 0);
    const disc = (g: Group) => { const o = g.items[0]; return o.listPrice && o.listPrice > o.price ? (o.listPrice - o.price) / o.listPrice : 0; };
    return r.sort(
      sort === 'nome' ? (a, b) => a.name.localeCompare(b.name)
        : sort === 'preco' ? (a, b) => lead(a) - lead(b) || each(a.items[0]) - each(b.items[0])
        // quem dá para comparar vem primeiro; depois, o maior desconto de quem está sozinho
        : (a, b) => lead(a) - lead(b) || b.saving - a.saving || b.items.length - a.items.length || disc(b) - disc(a),
    );
  }, [groups, terms, category, market, sort]);

  const clear = () => { setQ(''); setCategory(''); setMarket(''); setCity(''); };
  const updated = generatedAt ? new Date(generatedAt).toLocaleDateString('pt-BR') : '';
  const shownMarkets = markets.filter((m) => inCity.has(m.name));

  return (
    <div className="min-h-screen">
      <header className="on-ink bg-ink text-paper">
        <div className="mx-auto max-w-4xl px-4 pb-5 pt-6">
          <h1 className="font-display text-[2.5rem] font-extrabold leading-[0.95] sm:text-6xl">
            Quanto custa em Mauá e Ribeirão Pires
          </h1>
          <p className="mt-3 max-w-prose text-sm text-paper/75">
            Compare o mesmo produto em {markets.length || 'vários'} mercados{updated && `. Preços atualizados em ${updated}`}.
          </p>
          <label className="mt-4 block">
            <span className="sr-only">Buscar produto</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Arroz 5kg, café, detergente"
              className="h-14 w-full border-b-4 border-tag bg-paper px-4 text-lg text-ink placeholder:text-muted"
            />
          </label>
        </div>
      </header>

      <div className="border-b border-line bg-paper/95 backdrop-blur sm:sticky sm:top-0 sm:z-10">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-2">
          <div role="group" aria-label="Mercado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              aria-pressed={market === ''}
              onClick={() => setMarket('')}
              className={`min-h-[2.75rem] shrink-0 border px-3 text-sm font-bold ${market === '' ? 'border-ink bg-ink text-paper' : 'border-line bg-white'}`}
            >
              Todos
            </button>
            {shownMarkets.map((m) => (
              <button
                key={m.name}
                aria-pressed={market === m.name}
                onClick={() => setMarket(market === m.name ? '' : m.name)}
                className={`flex min-h-[2.75rem] shrink-0 items-center border bg-white px-2 ${market === m.name ? 'border-ink ring-2 ring-ink' : 'border-line'}`}
              >
                <MarketLogo name={m.name} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="-mx-4 flex min-w-0 basis-full gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-1 sm:basis-auto sm:px-0">
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
            <div className="flex flex-wrap gap-2">
              {cities.length > 1 && (
                <select aria-label="Cidade" value={city} onChange={(e) => { setCity(e.target.value); setMarket(''); }} className="min-h-[2.5rem] border border-line bg-white px-2 text-sm">
                  <option value="">Mauá e Ribeirão Pires</option>
                  {cities.map((c) => <option key={c} value={c}>Lojas em {c}</option>)}
                </select>
              )}
              <select aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-[2.5rem] border border-line bg-white px-2 text-sm">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-2">
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
            <p className="text-lg font-bold">{dq ? `Não achei "${dq}".` : 'Nada por aqui com esses filtros.'}</p>
            <p className="mt-1 text-sm text-muted">Tente só o nome do produto, sem marca nem tamanho, ou tire um filtro.</p>
            <button onClick={clear} className="mt-3 min-h-[2.75rem] border border-ink px-4 font-bold">Limpar busca e filtros</button>
          </div>
        )}

        {status === 'ok' && list.length > 0 && (
          <>
            <p className="mt-2 text-xs text-muted">{list.length.toLocaleString('pt-BR')} produtos</p>
            <ul>
              {list.slice(0, shown).map((g) => <GroupRow key={g.id} g={g} />)}
            </ul>
          </>
        )}

        {status === 'ok' && shown < list.length && (
          <button onClick={() => setShown((s) => s + PAGE)} className="mt-5 min-h-[3rem] w-full border-2 border-ink font-bold">
            Mostrar mais ({shown} de {list.length.toLocaleString('pt-BR')})
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
            {infoOnly.map((m) => (
              <li key={m.name}>
                {m.name} ({m.address}): {m.note}{' '}
                {m.links.map((l, i) => (
                  <span key={l.url}>
                    {i > 0 && ' · '}
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{l.label}</a>
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-3">Parte das ofertas vem de folhetos em imagem, lidos por inteligência artificial. Clique no preço para ver a oferta original.</p>
          <p className="mt-1">Preços e ofertas podem mudar a qualquer momento e variam por loja. Confirme na prateleira antes de ir.</p>
          <p className="mt-1">As marcas e logotipos pertencem aos seus donos; aparecem aqui só para identificar cada mercado.</p>
        </footer>
      </main>
    </div>
  );
}
