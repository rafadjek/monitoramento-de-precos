import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Parts';
import { loadStats, type SiteStats } from './stats';
import { AUDIENCES, FAQ, MONEY, PLANS_DATA, STEPS, type Plan } from './sua-cidade/content';
import { EMAIL, WHATSAPP_TEXT, waLink } from './sua-cidade/contact';
import { LeadForm } from './sua-cidade/Form';

const BASE = import.meta.env.BASE_URL;
const TITLE = 'Leve o Bate Ofertas para a sua cidade';
const DESC = 'Seu próprio comparador de preços de supermercado, com a sua marca e os mercados da sua cidade. Prazo estimado a partir de 2 semanas. Planos a partir de R$ 1.490 e R$ 97 por mês.';

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

const h2 = 'font-display text-[2.1rem] font-extrabold italic uppercase leading-[0.95] tracking-tight sm:text-5xl';

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
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">{children}</div>
    </section>
  );
}

// Etiqueta de preço pendurada: "SUA CIDADE" no lugar do preço
function HeroTag() {
  return (
    <svg viewBox="0 0 340 400" role="img" aria-label="Etiqueta de preço com o texto: sua cidade" className="tag-sway mx-auto w-[15rem] drop-shadow-[0_0_28px_rgba(255,138,30,.45)] sm:w-[19rem]">
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
    <div className="border-l-4 border-gold pl-4">
      <div className="num font-display text-5xl font-extrabold italic leading-none text-neon sm:text-6xl">{big}</div>
      <div className="mt-1 text-sm text-ink/85">{small}</div>
    </div>
  );
}

function PlanCard({ p }: { p: Plan }) {
  const wa = `Olá! Quero saber mais sobre o plano ${p.name} do Bate Ofertas para a minha cidade.`;
  return (
    <article className={`relative flex flex-col rounded-3xl border-2 p-6 ${p.highlight ? 'border-gold bg-panel2 shadow-[0_0_0_1px_rgba(255,194,26,.5),0_0_34px_rgba(255,194,26,.22)] lg:-my-4 lg:py-10' : 'border-edge bg-panel'}`}>
      {p.highlight && <span className="absolute -top-4 left-6 rounded-full bg-gold px-4 py-1 text-sm font-bold text-night">Recomendado para ganhar dinheiro</span>}
      <h3 className="font-display text-3xl font-extrabold italic uppercase leading-none">{p.name}</h3>
      <p className="mt-2 min-h-[2.75rem] text-sm text-muted">{p.para}</p>
      <div className="mt-5 border-t-2 border-dashed border-edge pt-4">
        <p className="text-sm text-muted">{p.from ? 'Implantação, a partir de' : 'Implantação, pagamento único'}</p>
        <p className="num flex items-start font-display font-extrabold italic leading-none text-neon">
          <span className="mt-2 text-2xl">R$</span><span className="text-6xl">{p.setup}</span>
        </p>
        <p className="mt-3 text-lg"><b className="num text-ink">+ R$ {p.monthly}</b> <span className="text-muted">por mês{p.from ? ', a partir de' : ''}</span></p>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5 text-[0.95rem]">
        {p.items.map((i) => (
          <li key={i} className="flex gap-2.5"><span aria-hidden className="mt-0.5 font-bold text-neon">✓</span><span>{i}</span></li>
        ))}
      </ul>
      <WaButton text={wa} className={`mt-6 ${p.highlight ? btnWa : 'inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl border-2 border-neon/70 px-5 font-bold text-neon hover:bg-neon/10'}`}>Quero o {p.name}</WaButton>
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

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ background: `linear-gradient(180deg, rgba(6,11,26,.35) 0, rgba(6,11,26,.85) 520px, #060b1a 760px), url(${BASE}fundo.webp) top center / max(1500px, 100%) auto no-repeat, #060b1a` }}>
      <header className="border-b border-edge/80 bg-night/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <a href="#" aria-label="Bate Ofertas, voltar ao comparador"><img src={`${BASE}bate-ofertas.webp`} alt="Bate Ofertas" className="h-11 w-auto sm:h-14" /></a>
          <a href="#" className="ml-auto inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-edge px-3 text-sm font-bold text-ink/90 hover:border-sky hover:text-ink">
            <Icon name="arrow" className="h-4 w-4 rotate-180" />Voltar ao comparador
          </a>
        </div>
      </header>

      <main>
        {/* a) chamada forte */}
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-14 pt-10 sm:pt-16 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <h1 id="venda-h1" tabIndex={-1} className="outline-none font-display text-[3rem] font-extrabold italic uppercase leading-[0.88] tracking-tight sm:text-7xl lg:text-[5.5rem]">
              Leve o Bate Ofertas para a <span className="title-fire">sua cidade</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink/90 sm:text-xl">
              Um site que compara os preços dos mercados da sua cidade, com a sua marca. O comprador economiza, o mercado ganha cliente e você abre um negócio local.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <WaButton>Falar no WhatsApp</WaButton>
              <a href="#/sua-cidade" onClick={goTo('planos')} className={btnGhost}>Ver os planos</a>
            </div>
            <p className="mt-4 text-sm text-muted">Prazo estimado a partir de 2 semanas, combinado conforme os mercados da cidade. Você só paga depois de combinar tudo por escrito.</p>
          </div>
          <HeroTag />
        </div>
        <Tape />

        {/* b) o problema */}
        <Section id="problema">
          <h2 id="problema-t" className={h2}>Hoje, todo mundo perde</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-signal/50 bg-panel p-6">
              <h3 className="font-display text-3xl font-bold leading-none">Quem compra paga mais do que precisa</h3>
              <p className="mt-3 text-ink/90">O mesmo produto custa preços diferentes de um mercado para o outro. Para descobrir, é preciso abrir site por site, folheto por folheto. Quase ninguém faz isso, e o dinheiro fica na prateleira errada.</p>
            </div>
            <div className="rounded-2xl border border-gold/50 bg-panel p-6">
              <h3 className="font-display text-3xl font-bold leading-none">Quem vende não aparece para quem procura preço</h3>
              <p className="mt-3 text-ink/90">O mercado do bairro faz oferta boa, mas o folheto some no grupo de WhatsApp. Quem busca o menor preço da cidade não encontra o mercado, e ele perde o cliente para quem tem mais divulgação.</p>
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-xl font-bold sm:text-2xl">O Bate Ofertas junta tudo num lugar só, ordena do menor para o maior preço e leva a pessoa direto à oferta.</p>
        </Section>

        {/* c) prova com números reais */}
        <Section id="prova" tone="panel">
          <h2 id="prova-t" className={h2}>Já funciona em Mauá e Ribeirão Pires</h2>
          {stats ? (
            <>
              <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
                <Stat big={stats.markets.toLocaleString('pt-BR')} small="mercados com preços no site" />
                <Stat big={stats.products.toLocaleString('pt-BR')} small="preços coletados nos mercados" />
                <Stat big={stats.groups.toLocaleString('pt-BR')} small="produtos comparados entre mercados" />
                <Stat big={stats.updated} small="última atualização dos preços" />
              </div>
              <p className="mt-6 text-sm text-muted">Números lidos agora dos dados publicados no comparador.</p>
            </>
          ) : (
            <p className="mt-6 max-w-2xl text-ink/90">O comparador de Mauá e Ribeirão Pires está no ar, com mercados, preços e ofertas. Os folhetos são lidos todo dia e os catálogos toda semana.</p>
          )}
          <p className="mt-6 max-w-2xl text-ink/90">Os preços vêm do catálogo e do folheto de cada mercado. Quando o preço está fora do padrão, o site marca. Você pode testar tudo antes de decidir.</p>
          <a href="#" className={`${btnGhost} mt-6`}>Abrir o comparador e testar</a>
        </Section>

        {/* d) como funciona */}
        <Section id="como">
          <h2 id="como-t" className={h2}>Como funciona</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative rounded-2xl border border-edge bg-panel p-5 pt-7">
                <span aria-hidden className="absolute -top-5 left-5 grid h-11 w-11 place-items-center rounded-full bg-gold font-display text-2xl font-extrabold italic text-night">{i + 1}</span>
                <h3 className="font-display text-2xl font-bold leading-tight">{s.t}</h3>
                <p className="mt-2 text-sm text-ink/90">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 rounded-2xl border-2 border-dashed border-gold/70 p-5 text-lg"><b className="text-gold">Prazo:</b> prazo estimado, combinado conforme os mercados da cidade (a partir de 2 semanas, só como estimativa). A data é confirmada antes de qualquer pagamento.</p>
        </Section>

        {/* e) para quem é */}
        <Section id="para-quem" tone="panel">
          <h2 id="para-quem-t" className={h2}>Para quem é</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {AUDIENCES.map((a) => (
              <article key={a.t} className="flex flex-col rounded-2xl border border-edge bg-night/70 p-6">
                <svg viewBox="0 0 24 24" className="h-10 w-10 text-fire" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={AUD_ICON[a.icon]} /></svg>
                <h3 className="mt-3 font-display text-2xl font-bold leading-tight">{a.t}</h3>
                <p className="mt-2 flex-1 text-ink/90">{a.d}</p>
                <p className="mt-4 text-sm text-muted">Plano indicado: <b className="text-ink">{a.plan}</b></p>
              </article>
            ))}
          </div>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-neon/60 px-4 py-2 text-sm"><Icon name="trophy" className="h-5 w-5 shrink-0 text-neon" />O mercado parceiro é contratado com o operador da cidade ou no plano Rede / Entidade. O selo destaca o folheto e não garante posição no ranking de preço.</p>
        </Section>

        {/* f) como ganha dinheiro */}
        <Section id="dinheiro">
          <h2 id="dinheiro-t" className={h2}>Como o site dá dinheiro</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {MONEY.map((m) => (
              <div key={m.t} className="border-t-4 border-neon pt-4">
                <h3 className="font-display text-3xl font-bold leading-none">{m.t}</h3>
                <p className="mt-2 text-ink/90">{m.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-muted">Não prometo valor de ganho: ele depende do tamanho da audiência da sua cidade e do que você consegue vender aos mercados. O que garanto é o site funcionando e os dados coletados nas rotinas acima.</p>
        </Section>

        {/* g) planos */}
        <Section id="planos" tone="panel">
          <h2 id="planos-t" className={h2}>Planos</h2>
          <p className="mt-3 max-w-2xl text-ink/90">Uma implantação (pagamento único) e uma mensalidade. A hospedagem do site é gratuita no Cloudflare. Domínio próprio, se quiser, é pago à parte (registro por conta do cliente).</p>
          <div className="mt-10 grid gap-8 lg:grid-cols-3 lg:items-stretch">
            {PLANS_DATA.map((p) => <PlanCard key={p.id} p={p} />)}
          </div>
        </Section>

        {/* h) perguntas frequentes */}
        <Section id="duvidas">
          <h2 id="duvidas-t" className={h2}>Perguntas frequentes</h2>
          <div className="mt-8 max-w-3xl divide-y divide-edge rounded-2xl border border-edge bg-panel">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5 open:bg-panel2/60">
                <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Icon name="plus" className="h-6 w-6 shrink-0 text-gold transition-transform group-open:rotate-45" />
                </summary>
                <p className="mt-2 max-w-2xl text-ink/90">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* i) formulário */}
        <Section id="contato" tone="panel">
          <h2 id="contato-t" className={h2}>Conte da sua cidade</h2>
          <p className="mt-3 max-w-2xl text-ink/90">Preencha e a mensagem sai pronta no seu WhatsApp. Eu respondo pessoalmente.</p>
          <div className="mt-8 rounded-3xl border-2 border-edge bg-night/70 p-5 sm:p-8">
            <LeadForm />
          </div>
        </Section>

        {/* j) chamada final */}
        <div className="border-t-4 border-gold bg-gradient-to-b from-panel2 to-night">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:py-20">
            <h2 className="font-display text-4xl font-extrabold italic uppercase leading-[0.92] sm:text-6xl">A sua cidade <span className="title-fire">merece pagar menos</span></h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-ink/90">Chame agora e descubra quais mercados da sua cidade dá para colocar no ar.</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <WaButton>WhatsApp {WHATSAPP_TEXT}</WaButton>
              <a href={`mailto:${EMAIL}`} className={btnGhost}>{EMAIL}</a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-edge bg-night/90">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
          <p>Preços, folhetos e marcas pertencem aos seus donos. O Bate Ofertas reúne informação pública e leva à oferta original. Parte das ofertas vem de folhetos lidos por inteligência artificial. <a href="#" className="text-sky underline">Voltar ao comparador</a></p>
        </div>
      </footer>

      {/* celular: botão fixo de WhatsApp */}
      <a href={waLink()} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp" className="fixed inset-x-4 bottom-4 z-40 flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl bg-neon text-lg font-bold text-night shadow-[0_6px_28px_rgba(34,227,107,.5)] md:hidden">
        <WaIcon />Falar no WhatsApp
      </a>
    </div>
  );
}
