import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../components/Parts';
import { loadStats, type SiteStats } from './stats';
import { activeEvent, AUDIENCES, endLabel, FAQ, PLANS_DATA, shownPrice, STEPS, type Plan, type PromoEvent } from './sua-cidade/content';
import { EMAIL, WHATSAPP_TEXT, waLink } from './sua-cidade/contact';
import { LeadForm } from './sua-cidade/Form';

const BASE = import.meta.env.BASE_URL;
const TITLE = 'Leve o Bate Ofertas para a sua cidade';
const DESC = 'Seu próprio comparador de preços de supermercado, com a sua marca e os mercados da sua cidade. Prazo estimado a partir de 2 semanas.';

const btnWa = 'inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-neon px-6 text-lg font-bold text-night shadow-neon hover:brightness-110';
const btnGhost = 'inline-flex min-h-[3.25rem] items-center justify-center rounded-xl border-2 border-ink/40 px-6 text-lg font-bold text-ink hover:border-gold hover:text-gold';
// Âncora interna: a rota é por hash, então "#planos" tiraria o visitante desta página
const goTo = (id: string) => (e: { preventDefault: () => void }) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

const h2 = 'font-display text-[1.9rem] font-extrabold italic uppercase leading-[0.95] tracking-tight sm:text-4xl';

function WaIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

function WaButton({ text, children, className = btnWa }: { text?: string; children: ReactNode; className?: string }) {
  return <a href={waLink(text)} target="_blank" rel="noopener noreferrer" className={className}><WaIcon className="h-6 w-6" />{children}</a>;
}

// Fita de promoção (listras douradas) que separa o topo do resto
const Tape = () => <div aria-hidden className="h-3" style={{ background: 'repeating-linear-gradient(-45deg, #ffc21a 0 14px, #060b1a 14px 28px)' }} />;

function Section({ id, tone = 'dark', children }: { id?: string; tone?: 'dark' | 'panel'; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-t` : undefined} className={`scroll-mt-16 ${tone === 'panel' ? 'border-y border-edge bg-panel/90' : ''}`}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">{children}</div>
    </section>
  );
}

// Etiqueta de preço pendurada: "SUA CIDADE" no lugar do preço
function HeroTag() {
  return (
    <svg viewBox="0 0 340 400" role="img" aria-label="Etiqueta de preço com o texto: sua cidade" className="tag-sway mx-auto w-[8.5rem] drop-shadow-[0_0_28px_rgba(255,138,30,.45)] sm:w-[15rem]">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd23a" /><stop offset="1" stopColor="#ff8a1e" /></linearGradient>
      </defs>
      <path d="M170 0c-40 40-70 70-70 100" fill="none" stroke="#8c9ac0" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 110 L130 90 L210 90 L280 110 Q300 116 300 140 L300 360 Q300 385 275 385 L65 385 Q40 385 40 360 L40 140 Q40 116 60 110Z" fill="url(#tg)" />
      <circle cx="170" cy="122" r="16" fill="#060b1a" />
      <text x="170" y="200" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" fontSize="34" fill="#060b1a">LEVE PARA</text>
      <text x="170" y="272" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="800" fontStyle="italic" fontSize="76" fill="#060b1a">SUA</text>
      <text x="170" y="344" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="800" fontStyle="italic" fontSize="76" fill="#060b1a">CIDADE</text>
    </svg>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="border-l-4 border-gold pl-3">
      <div className="num font-display text-4xl font-extrabold italic leading-none text-neon sm:text-5xl">{big}</div>
      <div className="mt-1 text-xs text-ink/85 sm:text-sm">{small}</div>
    </div>
  );
}

function PlanCard({ p, ev }: { p: Plan; ev: PromoEvent | null }) {
  const s = shownPrice(p, ev);
  const wa = s.promo && ev
    ? `Olá! Quero saber mais sobre o plano ${p.name} do Bate Ofertas para a minha cidade. Vi a oferta ${ev.nome} (até ${endLabel(ev)}): ${p.from ? 'a partir de ' : ''}R$ ${s.setup} + R$ ${s.monthly} por mês.`
    : `Olá! Quero saber mais sobre o plano ${p.name} do Bate Ofertas para a minha cidade.`;
  return (
    <article className={`relative flex flex-col rounded-3xl border-2 p-5 ${p.highlight ? 'border-gold bg-panel2 shadow-[0_0_0_1px_rgba(255,194,26,.5),0_0_34px_rgba(255,194,26,.22)]' : 'border-edge bg-panel'}`}>
      {p.highlight && <span className="absolute -top-4 left-5 rounded-full bg-gold px-4 py-1 text-sm font-bold text-night">Recomendado</span>}
      {s.promo && ev && <span className="absolute -top-4 right-5 rounded-full bg-fire px-3 py-1 text-sm font-bold text-night">🔥 {ev.nome}</span>}
      <h3 className="font-display text-3xl font-extrabold italic uppercase leading-none">{p.name}</h3>
      <p className="mt-1 text-sm text-muted">{p.para}</p>
      <div className="mt-4 border-t-2 border-dashed border-edge pt-3">
        <p className="text-sm text-muted">
          {p.from ? 'Implantação, a partir de' : 'Implantação'}
          {s.promo && <> <s className="num text-ink/70" aria-label={`preço normal R$ ${s.oldSetup}`}>R$ {s.oldSetup}</s></>}
        </p>
        <p className="num flex items-start font-display font-extrabold italic leading-none text-neon">
          <span className="mt-2 text-2xl">R$</span><span className="text-6xl">{s.setup}</span>
        </p>
        <p className="mt-2 text-lg">
          <b className="num text-ink">+ R$ {s.monthly}</b> <span className="text-muted">por mês{p.from ? ', a partir de' : ''}</span>
          {s.promo && <> <s className="num text-sm text-muted" aria-label={`mensalidade normal R$ ${s.oldMonthly}`}>R$ {s.oldMonthly}</s></>}
        </p>
      </div>
      <ul className="mt-4 flex-1 space-y-1.5 text-[0.95rem]">
        {p.items.map((i) => (
          <li key={i} className="flex gap-2.5"><span aria-hidden className="font-bold text-neon">✓</span><span>{i}</span></li>
        ))}
      </ul>
      <WaButton text={wa} className={`mt-5 ${p.highlight ? btnWa : 'inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl border-2 border-neon/70 px-5 font-bold text-neon hover:bg-neon/10'}`}>Quero o {p.name}</WaButton>
    </article>
  );
}

const AUD_ICON: Record<string, string> = {
  person: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0',
  store: 'M4 9l1.5-5h13L20 9M4 9h16M4 9v11h16V9M9 20v-6h6v6',
  city: 'M3 21V9l6-3v15M9 21V4l8 3v14M17 21V11l4 2v8M12 10h2M12 14h2M6 12h1M6 16h1',
};

export default function SuaCidade() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const ev = useMemo(() => activeEvent(new Date()), []);
  useEffect(() => {
    const old = { title: document.title, desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null };
    let meta = document.querySelector('meta[name="description"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta); }
    document.title = `${TITLE} | Bate Ofertas`;
    meta.setAttribute('content', DESC);
    return () => {
      document.title = old.title;
      if (created) meta!.remove(); else if (old.desc !== null) meta!.setAttribute('content', old.desc);
    };
  }, []);
  useEffect(() => { document.getElementById('venda-h1')?.focus({ preventScroll: true }); }, []);
  useEffect(() => { let on = true; loadStats(BASE).then((s) => on && setStats(s)); return () => { on = false; }; }, []);

  const heroWa = ev ? `Olá! Quero saber como levar o Bate Ofertas para a minha cidade. Vi a oferta ${ev.nome} (até ${endLabel(ev)}).` : undefined;

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ background: `linear-gradient(180deg, rgba(6,11,26,.35) 0, rgba(6,11,26,.85) 420px, #060b1a 620px), url(${BASE}fundo.webp) top center / max(1500px, 100%) auto no-repeat, #060b1a` }}>
      <header className="border-b border-edge/80 bg-night/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <a href="#" aria-label="Bate Ofertas, voltar ao comparador"><img src={`${BASE}bate-ofertas.webp`} alt="Bate Ofertas" className="h-11 w-auto sm:h-14" /></a>
          <a href="#" className="ml-auto inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-edge px-3 text-sm font-bold text-ink/90 hover:border-sky hover:text-ink">
            <Icon name="arrow" className="h-4 w-4 rotate-180" />Voltar ao comparador
          </a>
        </div>
      </header>

      <main>
        {/* hero curto */}
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 pb-8 pt-6 sm:gap-8 sm:pb-10 sm:pt-10">
          <div>
            {ev && <p className="mb-3 inline-block rounded-full bg-fire px-3 py-1 text-sm font-bold text-night">🔥 {ev.nome}: planos com preço especial até {endLabel(ev)}</p>}
            <h1 id="venda-h1" tabIndex={-1} className="outline-none font-display text-[2.3rem] font-extrabold italic uppercase leading-[0.9] tracking-tight sm:text-6xl lg:text-7xl">
              Leve o Bate Ofertas para a <span className="title-fire">sua cidade</span>
            </h1>
            <p className="mt-3 max-w-xl text-base text-ink/90 sm:text-xl">Seu comparador de preços de supermercado, com a sua marca. Prazo estimado a partir de 2 semanas.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <WaButton text={heroWa}>Falar no WhatsApp</WaButton>
              <a href="#/sua-cidade" onClick={goTo('planos')} className={btnGhost}>Ver os planos</a>
            </div>
          </div>
          <HeroTag />
        </div>
        <Tape />

        {/* números reais */}
        {stats && (
          <section aria-label="Números do comparador de Mauá e Ribeirão Pires" className="border-b border-edge bg-panel/90">
            <div className="mx-auto max-w-6xl px-4 py-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
                <Stat big={stats.markets.toLocaleString('pt-BR')} small="mercados com preços no site" />
                <Stat big={stats.products.toLocaleString('pt-BR')} small="preços coletados" />
                <Stat big={stats.groups.toLocaleString('pt-BR')} small="produtos comparados entre mercados" />
                <Stat big={stats.updated} small="última atualização" />
              </div>
              <p className="mt-3 text-xs text-muted">Já funciona em Mauá e Ribeirão Pires, lido agora dos dados publicados. <a href="#" className="text-sky underline">Abrir o comparador e testar</a></p>
            </div>
          </section>
        )}

        {/* para quem é */}
        <Section id="para-quem">
          <h2 id="para-quem-t" className={h2}>Para quem é</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <article key={a.t} className="flex items-start gap-3 rounded-2xl border border-edge bg-panel p-4">
                <svg viewBox="0 0 24 24" className="mt-1 h-8 w-8 shrink-0 text-fire" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={AUD_ICON[a.icon]} /></svg>
                <div>
                  <h3 className="font-display text-xl font-bold leading-tight">{a.t}</h3>
                  <p className="mt-1 text-sm text-ink/90">{a.d}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>

        {/* como funciona */}
        <Section id="como" tone="panel">
          <h2 id="como-t" className={h2}>Como funciona</h2>
          <ol className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="flex gap-3">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold font-display text-xl font-extrabold italic text-night">{i + 1}</span>
                <div>
                  <h3 className="font-display text-xl font-bold leading-none">{s.t}</h3>
                  <p className="mt-1 text-sm text-ink/90">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* planos */}
        <Section id="planos">
          <h2 id="planos-t" className={h2}>Planos</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink/90 sm:text-base">
            Implantação (pagamento único) e mensalidade. Hospedagem gratuita no Cloudflare; domínio próprio, se quiser, é registrado por conta do cliente.
            {ev && <> <b className="text-fire">Oferta {ev.nome} até {endLabel(ev)}</b>, para contratos fechados até essa data (condições no contrato).</>}
          </p>
          <div className="mt-8 grid gap-8 lg:grid-cols-3 lg:items-stretch">
            {PLANS_DATA.map((p) => <PlanCard key={p.id} p={p} ev={ev} />)}
          </div>
        </Section>

        {/* perguntas frequentes */}
        <Section id="duvidas" tone="panel">
          <h2 id="duvidas-t" className={h2}>Perguntas rápidas</h2>
          <div className="mt-5 max-w-3xl divide-y divide-edge rounded-2xl border border-edge bg-night/60">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-4 py-2 open:bg-panel2/60">
                <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Icon name="plus" className="h-5 w-5 shrink-0 text-gold transition-transform group-open:rotate-45" />
                </summary>
                <p className="mb-2 max-w-2xl text-sm text-ink/90 sm:text-base">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* formulário */}
        <Section id="contato">
          <h2 id="contato-t" className={h2}>Conte da sua cidade</h2>
          <div className="mt-5 rounded-3xl border-2 border-edge bg-panel/80 p-4 sm:p-6">
            <LeadForm ev={ev} />
          </div>
        </Section>

        {/* chamada final */}
        <div className="border-t-4 border-gold bg-gradient-to-b from-panel2 to-night">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:flex-row sm:gap-6">
            <p className="font-display text-2xl font-extrabold italic uppercase leading-none sm:text-3xl">A sua cidade <span className="title-fire">merece pagar menos</span></p>
            <WaButton text={heroWa}>WhatsApp {WHATSAPP_TEXT}</WaButton>
            <a href={`mailto:${EMAIL}`} className="text-sm text-sky underline">{EMAIL}</a>
          </div>
        </div>
      </main>

      <footer className="border-t border-edge bg-night/90">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted">
          <p>Preços, folhetos e marcas pertencem aos seus donos. O Bate Ofertas reúne informação pública e leva à oferta original. Parte das ofertas vem de folhetos lidos por inteligência artificial. <a href="#" className="text-sky underline">Voltar ao comparador</a></p>
        </div>
      </footer>

      {/* celular: botão fixo de WhatsApp */}
      <a href={waLink(heroWa)} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp" className="fixed inset-x-4 bottom-4 z-40 flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl bg-neon text-lg font-bold text-night shadow-[0_6px_28px_rgba(34,227,107,.5)] md:hidden">
        <WaIcon />Falar no WhatsApp
      </a>
    </div>
  );
}
