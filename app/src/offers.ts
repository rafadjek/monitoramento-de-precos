// Ofertas do Dia: os maiores descontos de verdade (preço "de" riscado contra o atual), mas com variedade.
// Sem React nem dependências de runtime (só tipos), para rodar também nos testes com `node --test`.
import type { Indexed } from './lib';

// Farmácia informa como "de" o preço máximo de tabela, com margens de 50% a 70% que o supermercado nunca tem:
// sozinha ela ocuparia a lista toda (22/11/2026: 26 dos 40 maiores descontos). Por isso tem teto de vagas e de desconto.
export const MAX_FARMACIA = 4;
export const DESCONTO_MAX_FARMACIA = 0.4;
const MAX_POR_MERCADO = 8;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PALAVRAS_NEUTRAS = new Set(['de', 'da', 'do', 'com', 'e', 'em', 'para', 'the', 'o', 'a', 'un', 'unidade', 'pote', 'caixa', 'pacote', 'garrafa', 'lata', 'bandeja', 'frasco', 'sache']);
const palavras = (s: string) => new Set(semAcento(s).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_NEUTRAS.has(w)));
const chaveMarca = (b: string | null | undefined) => semAcento(b ?? '').replace(/[^a-z]/g, '').slice(0, 5);
const semelhanca = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i || 1); };

export const isFarmacia = (o: Pick<Indexed, 'segment' | 'category'>) => o.segment === 'farmacia' || o.category === 'farmacia';

// Tipos de produto, na ordem em que a rodada de escolha os visita (o último é o que sobra).
const TIPOS = ['mercearia', 'frescos', 'laticinios-bebidas', 'higiene', 'limpeza', 'farmacia', 'outros'] as const;
type Tipo = (typeof TIPOS)[number];
export function tipoDe(o: Pick<Indexed, 'segment' | 'category'>): Tipo {
  if (isFarmacia(o)) return 'farmacia';
  switch (o.category) {
    case 'mercearia': return 'mercearia';
    case 'carnes': case 'hortifruti': return 'frescos';
    case 'laticinios': case 'bebidas': return 'laticinios-bebidas';
    case 'higiene': return 'higiene';
    case 'limpeza': return 'limpeza';
    default: return 'outros';
  }
}

export function pickOffers(all: Indexed[], n = 20): Indexed[] {
  const real = all.filter((o) => !o.rx && o.listPrice && o.listPrice > o.price && !(o.condition && /levando|a partir|leve \d|cart[aã]o/i.test(o.condition)) && o.imageUrl);
  const off = (o: Indexed) => 1 - o.price / o.listPrice!;
  const faixa = (o: Indexed) => off(o) >= 0.1 && off(o) <= (isFarmacia(o) ? DESCONTO_MAX_FARMACIA : 0.7);
  // marcas conhecidas: as informadas em 3 ou mais ofertas; sem marca, a palavra do nome que é uma delas
  const cont = new Map<string, number>();
  for (const o of all) { const k = chaveMarca(o.brand); if (k.length >= 4) cont.set(k, (cont.get(k) ?? 0) + 1); }
  const conhecidas = new Set([...cont].filter(([, c]) => c >= 3).map(([k]) => k));
  const marcaDe = (o: Indexed) => {
    const k = chaveMarca(o.brand);
    if (k) return k;
    const w = semAcento(o.name).split(/[^a-z]+/).find((x) => x.length >= 4 && conhecidas.has(x.slice(0, 5)));
    return w ? w.slice(0, 5) : '';
  };

  // uma fila por tipo de produto, do maior desconto para o menor
  const filas = new Map<Tipo, Indexed[]>(TIPOS.map((t) => [t, []]));
  for (const o of real.filter(faixa).sort((a, b) => off(b) - off(a))) filas.get(tipoDe(o))!.push(o);

  const out: Indexed[] = [];
  const marcas = new Set<string>();
  const nomes: Set<string>[] = []; // palavras do nome de cada oferta já escolhida
  const porMercado = new Map<string, number>();
  let farmacia = 0;
  const pos = new Map<Tipo, number>(TIPOS.map((t) => [t, 0]));
  // rodadas: cada tipo entrega a sua melhor oferta que ainda cabe, até encher a lista ou acabarem as filas
  for (let progresso = true; progresso && out.length < n;) {
    progresso = false;
    for (const t of TIPOS) {
      if (out.length >= n) break;
      const fila = filas.get(t)!;
      while ((pos.get(t) ?? 0) < fila.length) {
        const o = fila[pos.get(t)!];
        pos.set(t, pos.get(t)! + 1);
        const mk = marcaDe(o), p = palavras(o.name);
        if (t === 'farmacia' && farmacia >= MAX_FARMACIA) { pos.set(t, fila.length); break; }
        if ((porMercado.get(o.market) ?? 0) >= MAX_POR_MERCADO) continue;
        if ((mk && marcas.has(mk)) || nomes.some((x) => semelhanca(x, p) >= 0.6)) continue;
        if (mk) marcas.add(mk);
        nomes.push(p);
        porMercado.set(o.market, (porMercado.get(o.market) ?? 0) + 1);
        if (t === 'farmacia') farmacia++;
        out.push(o);
        progresso = true;
        break;
      }
    }
  }
  return out.sort((a, b) => off(b) - off(a));
}
