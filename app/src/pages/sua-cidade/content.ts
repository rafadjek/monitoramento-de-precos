// Texto e preços da página de venda (um lugar só para ajustar). Preços definidos pelo Rafael em 14/11/2026.
export type PlanId = 'start' | 'pro' | 'rede';
export type Plan = { id: PlanId; name: string; para: string; setup: string; monthly: string; from?: boolean; highlight?: boolean; items: string[] };

export const PLANS_DATA: Plan[] = [
  {
    id: 'start', name: 'Cidade Start', para: 'Pessoa física, empreendedor, influenciador local', setup: '1.490', monthly: '97',
    items: ['Até 6 mercados da cidade', 'Catálogos lidos toda semana', 'Comparador e lista de compras', 'Site em sua-cidade.pages.dev'],
  },
  {
    id: 'pro', name: 'Cidade Pro', para: 'Quem quer ganhar dinheiro com a cidade', setup: '2.990', monthly: '197', highlight: true,
    items: ['Até 12 mercados da cidade', 'Folhetos lidos todo dia, catálogos toda semana', 'Sua marca e suas cores', 'Domínio próprio (registro por conta do cliente)', 'Espaço de anúncio para vender aos mercados'],
  },
  {
    id: 'rede', name: 'Rede / Entidade', para: 'Rede de mercados, associação, prefeitura, jornal ou portal', setup: '5.900', monthly: '397', from: true,
    items: ['Várias cidades no mesmo site', 'Marca branca (o site leva o seu nome)', 'Suporte prioritário', 'Mercado parceiro com folheto digital'],
  },
];

// ---- Promoções por evento: para criar outra, acrescente um item aqui. ----
export type PromoEvent = {
  id: string;
  nome: string;
  de: string; // início, ISO com fuso
  ate: string; // fim, ISO com fuso (23:59 de Brasília)
  precos: Record<PlanId, { setup: string; monthly: string }>;
};

export const EVENTS: PromoEvent[] = [
  {
    id: 'black-friday', nome: 'Black Friday',
    de: '2026-11-14T00:00:00-03:00', ate: '2026-11-30T23:59:59-03:00',
    precos: {
      start: { setup: '790', monthly: '67' },
      pro: { setup: '1.490', monthly: '127' },
      rede: { setup: '3.900', monthly: '297' },
    },
  },
];

/** Evento ativo na data dada (início e fim inclusos), ou null. */
export function activeEvent(now: Date = new Date(), events: PromoEvent[] = EVENTS): PromoEvent | null {
  const t = now.getTime();
  if (!Number.isFinite(t)) return null;
  return events.find((e) => t >= Date.parse(e.de) && t <= Date.parse(e.ate)) ?? null;
}

/** Fim da oferta como dd/mm, lido direto do texto ISO (sem depender do fuso do navegador). */
export const endLabel = (e: PromoEvent) => `${e.ate.slice(8, 10)}/${e.ate.slice(5, 7)}`;

export type Shown = { setup: string; monthly: string; promo: boolean; oldSetup: string; oldMonthly: string };
/** Preço a mostrar do plano: o promocional se houver evento, senão o normal. */
export function shownPrice(p: Plan, ev: PromoEvent | null): Shown {
  const pr = ev?.precos[p.id];
  return { setup: pr?.setup ?? p.setup, monthly: pr?.monthly ?? p.monthly, promo: !!pr, oldSetup: p.setup, oldMonthly: p.monthly };
}

const brl = (v: string) => `R$ ${v}`;
/** Frase do WhatsApp sobre a promoção (vazia sem evento). Plano vazio ou desconhecido: só cita o evento. */
export function promoText(planName: string, ev: PromoEvent | null): string {
  if (!ev) return '';
  const p = PLANS_DATA.find((x) => x.name === planName);
  const base = `Vi a oferta ${ev.nome} (até ${endLabel(ev)}).`;
  if (!p) return base;
  const s = shownPrice(p, ev);
  return `${base} Preço promocional do ${p.name}: ${p.from ? 'a partir de ' : ''}${brl(s.setup)} + ${brl(s.monthly)} por mês.`;
}

export const STEPS = [
  { t: 'Conversa', d: 'Você conta a cidade e eu vejo os mercados.' },
  { t: 'Coletores', d: 'Um por mercado, com pausa e sem login.' },
  { t: 'Site no ar', d: 'Comparador e atualização automática.' },
  { t: 'Manutenção', d: 'Ajusto quando um mercado muda.' },
];

export const AUDIENCES = [
  { t: 'Pessoa física ou empreendedor', d: 'Seu site, com a sua marca. Você ganha vendendo espaço de anúncio aos mercados da cidade.', icon: 'person' },
  { t: 'Mercados e redes', d: 'Folheto digital com selo próprio, como mercado parceiro. O selo não compra posição no ranking de preço.', icon: 'store' },
  { t: 'Associações, prefeituras e jornais', d: 'Serviço útil à população, com a sua marca e audiência recorrente. Várias cidades no plano Rede.', icon: 'city' },
];

export const FAQ = [
  { q: 'Em quanto tempo fica pronto?', a: 'Prazo estimado a partir de 2 semanas, conforme os mercados da cidade. A data é confirmada antes de qualquer pagamento.' },
  { q: 'E se um mercado bloquear a coleta?', a: 'Ele fica de fora. A coleta tem pausa, não usa login e não burla bloqueio. Seguimos com os demais ou com o folheto que o mercado publica.' },
  { q: 'O que eu recebo?', a: 'O site na sua cidade, com preços atualizados sozinhos, comparador e lista de compras. Marca e domínio próprio dependem do plano. Relatório, painel e links de afiliado são sob medida, a combinar.' },
  { q: 'Como é o pagamento e o contrato?', a: 'Forma de pagamento, cancelamento e devolução são combinados por escrito antes de você pagar. A promoção vale para contratos fechados até a data da oferta.' },
];
