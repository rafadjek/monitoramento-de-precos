import { useEffect, useMemo, useState } from 'react';
import { ProductCard, type Offer } from './components/ProductCard';

const BASE = import.meta.env.BASE_URL;
const PAGE = 60;
const CATEGORIES = [
  { id: '', label: 'Todas' },
  { id: 'alimenticios', label: 'Alimentícios' },
  { id: 'higiene', label: 'Higiene' },
  { id: 'limpeza', label: 'Limpeza' },
];

type MarketInfo = { name: string; file: string; products: number; storeScope: string | null; collectedAt: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function App() {
  const [all, setAll] = useState<(Offer & { _n: string })[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [market, setMarket] = useState('');
  const [sort, setSort] = useState('preco');
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const idx = await (await fetch(`${BASE}data/index.json`)).json();
        setMarkets(idx.markets);
        setGeneratedAt(idx.generatedAt);
        const parts = await Promise.all(
          idx.markets.map(async (m: MarketInfo) => (await fetch(`${BASE}data/${m.file}`)).json() as Promise<Offer[]>),
        );
        setAll(parts.flat().map((o) => ({ ...o, _n: norm(`${o.name} ${o.brand ?? ''}`) })));
      } catch (e) {
        setError(`Não consegui carregar os dados (${(e as Error).message}).`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => setShown(PAGE), [q, category, market, sort]);

  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const r = all.filter(
      (o) => (!category || o.category === category) && (!market || o.market === market) && terms.every((t) => o._n.includes(t)),
    );
    const disc = (o: Offer) => (o.listPrice && o.listPrice > o.price ? (o.listPrice - o.price) / o.listPrice : 0);
    r.sort(sort === 'nome' ? (a, b) => a._n.localeCompare(b._n) : sort === 'desconto' ? (a, b) => disc(b) - disc(a) : (a, b) => a.price - b.price);
    return r;
  }, [all, q, category, market, sort]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Monitoramento de Preços</h1>
        <p className="text-gray-600 text-sm">
          Mauá e Ribeirão Pires · alimentícios, higiene e limpeza
          {generatedAt && ` · atualizado em ${new Date(generatedAt).toLocaleDateString('pt-BR')}`}
        </p>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto (ex.: arroz 5kg)"
            className="flex-1 min-w-[240px] border rounded px-3 py-2"
          />
          <select value={market} onChange={(e) => setMarket(e.target.value)} className="border rounded px-3 py-2">
            <option value="">Todos os mercados</option>
            {markets.map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.products})</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded px-3 py-2">
            <option value="preco">Menor preço</option>
            <option value="desconto">Maior desconto</option>
            <option value="nome">Nome</option>
          </select>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1 rounded-full text-sm border ${category === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
        <p className="text-sm text-gray-500 mb-3">{loading ? 'Carregando…' : `${list.length.toLocaleString('pt-BR')} produtos`}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {list.slice(0, shown).map((o) => <ProductCard key={o.id} offer={o} />)}
        </div>

        {!loading && !error && list.length === 0 && <p className="text-gray-500 mt-8">Nenhum produto encontrado.</p>}

        {shown < list.length && (
          <div className="text-center mt-6">
            <button onClick={() => setShown((s) => s + PAGE)} className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700">
              Mostrar mais ({shown} de {list.length})
            </button>
          </div>
        )}

        <footer className="mt-10 text-xs text-gray-400">
          {markets.map((m) => `${m.name}: ${m.storeScope ?? 'loja não informada'}`).join(' · ')}
          <br />
          Preços coletados dos sites e folhetos dos próprios mercados; podem mudar. Confirme na loja.
        </footer>
      </main>
    </div>
  );
}
