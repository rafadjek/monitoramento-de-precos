import { useState } from 'react';
import { Icon } from './Parts';
import { activeEvent, endLabel } from '../pages/sua-cidade/content';

const KEY = 'bo:cityad-fechado';
const HREF = '#/sua-cidade';
const TAPE = 'repeating-linear-gradient(-45deg, #ffc21a 0 14px, #060b1a 14px 28px)';

function wasClosed() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

// Cartão de anúncio ao lado da lista (compacto no celular, fechável e lembrado no navegador)
export function CityAdCard() {
  const [closed, setClosed] = useState(wasClosed);
  if (closed) return null;
  const ev = activeEvent();
  const close = () => { setClosed(true); try { localStorage.setItem(KEY, '1'); } catch { /* sem armazenamento: some só nesta visita */ } };
  return (
    <aside aria-label="Anúncio: Bate Ofertas para a sua cidade" className="relative overflow-hidden rounded-2xl border border-gold/60 bg-panel2/95 shadow-[0_0_0_1px_rgba(255,194,26,.18)]">
      <div aria-hidden className="h-1.5" style={{ background: TAPE }} />
      <div className="flex items-center gap-3 py-2 pl-3 pr-10 lg:block lg:py-4 lg:pl-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-gold">Anúncio<span className="hidden lg:inline"> · para empreendedores</span>{ev && <span className="text-fire"> · 🔥 {ev.nome} até {endLabel(ev)}</span>}</p>
          <p className="font-display text-lg font-extrabold italic uppercase leading-[1.05] text-ink lg:mt-1 lg:text-3xl lg:leading-[0.95]">
            Sua cidade não está aqui? <span className="hidden lg:inline"><br /><span className="title-fire">Leve o Bate Ofertas para ela.</span></span>
          </p>
          <p className="mt-2 hidden text-sm text-ink/85 lg:block">Tenha seu próprio comparador de preços, com a sua marca e os mercados da sua cidade.{ev && <b className="text-fire"> Planos com preço de {ev.nome} a partir de R$ {ev.precos.start.setup}, até {endLabel(ev)}.</b>}</p>
        </div>
        <a href={HREF} className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gold px-3 text-sm font-bold text-night hover:brightness-110 lg:mt-3 lg:w-full lg:text-base">
          <span className="lg:hidden">Saiba como</span><span className="hidden lg:inline">Quero na minha cidade</span>
          <Icon name="arrow" className="h-4 w-4" />
        </a>
      </div>
      <button type="button" onClick={close} aria-label="Fechar anúncio" className="absolute right-0.5 top-2 grid h-11 w-11 place-items-center rounded-lg text-lg text-muted hover:text-ink">
        <span aria-hidden>✕</span>
      </button>
    </aside>
  );
}

// Faixa grande antes do rodapé
export function CityAdBanner() {
  const ev = activeEvent();
  return (
    <section aria-labelledby="cityad-t" className="mt-2">
      <div aria-hidden className="h-3" style={{ background: TAPE }} />
      <div className="border-b border-edge bg-panel/95">
        <div className="mx-auto grid max-w-[1400px] items-center gap-6 px-4 py-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:py-14">
          <div>
            <p className="inline-block rounded-full border border-gold/60 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-gold">Anúncio · para empreendedores</p>
            <h2 id="cityad-t" className="mt-3 font-display text-[2.4rem] font-extrabold italic uppercase leading-[0.9] tracking-tight sm:text-6xl">
              Sua cidade <span className="title-fire">não está aqui?</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg text-ink/90">Leve o Bate Ofertas para ela: um comparador de preços com a sua marca, prazo estimado a partir de 2 semanas.</p>
            {ev && <p className="mt-3 inline-block rounded-full bg-fire px-3 py-1 text-sm font-bold text-night">🔥 {ev.nome}: planos a partir de R$ {ev.precos.start.setup}, oferta até {endLabel(ev)}</p>}
            <a href={HREF} className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-gold px-6 text-lg font-bold text-night hover:brightness-110">
              Ver como funciona <Icon name="arrow" className="h-5 w-5" />
            </a>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
            <li className="border-l-4 border-gold pl-4">
              <p className="font-display text-2xl font-extrabold italic uppercase leading-none text-neon">Negócio digital local</p>
              <p className="mt-1 text-sm text-ink/85">Um site seu, com a sua marca, que vira o lugar onde a cidade confere preço.</p>
            </li>
            <li className="border-l-4 border-gold pl-4">
              <p className="font-display text-2xl font-extrabold italic uppercase leading-none text-neon">Mercados parceiros</p>
              <p className="mt-1 text-sm text-ink/85">Os mercados da sua cidade entram na comparação e podem ganhar clientes novos.</p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
