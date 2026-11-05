export type Offer = {
  id: string;
  market: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number;
  listPrice: number | null;
  unitPrice: string | null;
  category: string;
  imageUrl: string | null;
  productUrl: string | null;
  validUntil: string | null;
  validityNote: string | null;
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function validity(o: Offer) {
  if (!o.validUntil) return { text: 'validade não informada', cls: 'text-gray-400' };
  const d = new Date(o.validUntil);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const when = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return days <= 1
    ? { text: `vence ${days <= 0 ? 'hoje' : 'amanhã'} (${when})`, cls: 'text-red-600' }
    : { text: `vale até ${when}`, cls: 'text-green-700' };
}

export function ProductCard({ offer: o }: { offer: Offer }) {
  const v = validity(o);
  const off = o.listPrice && o.listPrice > o.price ? Math.round((1 - o.price / o.listPrice) * 100) : 0;
  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="relative h-40 bg-white flex items-center justify-center">
        {o.imageUrl ? (
          <img src={o.imageUrl.startsWith('http') ? o.imageUrl : import.meta.env.BASE_URL + o.imageUrl} alt={o.name} loading="lazy" className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <span className="text-xs text-gray-400">sem imagem</span>
        )}
        {off > 0 && <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">-{off}%</span>}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <span className="text-xs text-blue-700 font-medium">{o.market}</span>
        <h3 className="text-sm font-medium line-clamp-2">{o.name}</h3>
        {o.size && <span className="text-xs text-gray-500">{o.size}</span>}
        <div className="mt-auto pt-2">
          {o.listPrice && o.listPrice > o.price && <span className="text-xs text-gray-400 line-through mr-2">{brl(o.listPrice)}</span>}
          <span className="text-lg font-bold text-green-700">{brl(o.price)}</span>
          {o.unitPrice && <div className="text-xs text-gray-500">{o.unitPrice}</div>}
          <div className={`text-xs ${v.cls}`}>{v.text}</div>
          {o.productUrl && (
            <a href={o.productUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
              ver no site
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
