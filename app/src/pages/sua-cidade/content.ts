// Texto e preços da página de venda (um lugar só para ajustar). Preços definidos pelo Rafael em 14/11/2026.
export type Plan = { id: string; name: string; para: string; setup: string; monthly: string; from?: boolean; highlight?: boolean; items: string[] };

export const PLANS_DATA: Plan[] = [
  {
    id: 'start', name: 'Cidade Start', para: 'Pessoa física, empreendedor, influenciador local', setup: '1.490', monthly: '97',
    items: ['Até 6 mercados da cidade', 'Site no endereço sua-cidade.pages.dev', 'Catálogos lidos toda semana', 'Comparador e lista de compras (carrinho)'],
  },
  {
    id: 'pro', name: 'Cidade Pro', para: 'Quem quer ganhar dinheiro com a cidade', setup: '2.990', monthly: '197', highlight: true,
    items: ['Até 12 mercados da cidade', 'Folhetos lidos todo dia e catálogos toda semana', 'Sua marca e suas cores', 'Domínio próprio (registro por conta do cliente)', 'Espaço de anúncio para você vender aos mercados locais', 'Relatório mensal (sob medida, a combinar)'],
  },
  {
    id: 'rede', name: 'Rede / Entidade', para: 'Rede de mercados, associação comercial, prefeitura, jornal ou portal', setup: '5.900', monthly: '397', from: true,
    items: ['Várias cidades no mesmo site', 'Marca branca (o site leva o seu nome)', 'Painel de acompanhamento (sob medida, a combinar)', 'Suporte prioritário', 'Mercado parceiro com folheto digital (contratado no plano)'],
  },
];

export const STEPS = [
  { t: 'Conversa rápida', d: 'Você conta a cidade e o objetivo. Eu confiro quais mercados vendem preço na internet ou publicam folheto.' },
  { t: 'Montagem dos coletores', d: 'Um coletor por mercado lê catálogo ou folheto, com pausa entre os pedidos e sem login. É a parte que leva mais tempo.' },
  { t: 'Site no ar', d: 'Comparador, lista de compras e atualização automática funcionando, com a sua marca (nos planos que incluem).' },
  { t: 'Manutenção e crescimento', d: 'Os dados continuam sendo coletados e o site é ajustado quando um mercado muda. Você divulga e vende os espaços.' },
];

export const AUDIENCES = [
  { t: 'Pessoa física, empreendedor ou influenciador local', d: 'Quem tem audiência na cidade (grupo, perfil, blog) e quer um negócio digital com cara própria. O site vira o assunto que traz as pessoas de volta toda semana.', plan: 'Cidade Start ou Cidade Pro', icon: 'person' },
  { t: 'Mercados e redes', d: 'Quem vende barato e quer ser encontrado. O mercado parceiro é contratado com o operador da cidade ou no plano Rede / Entidade. O selo destaca seu folheto digital, mas não promete posição: o ranking de preço é o mesmo para todos, senão o comparador perde a confiança de quem compra.', plan: 'Rede / Entidade', icon: 'store' },
  { t: 'Associações, prefeituras, jornais e portais', d: 'Um serviço útil para a população e para o comércio local, com a sua marca. Ajuda o consumidor a economizar e dá audiência recorrente ao seu canal.', plan: 'Rede / Entidade', icon: 'city' },
];

export const MONEY = [
  { t: 'Espaço de anúncio', d: 'O site tem lugares para o mercado local anunciar uma promoção. Quem vende esse espaço é você, pelo preço que combinar.' },
  { t: 'Mercado parceiro', d: 'O mercado que quer folheto digital e selo próprio é contratado com o operador da cidade (ou no plano Rede / Entidade). O selo não promete posição na comparação de preços.' },
  { t: 'Links de afiliado (sob medida)', d: 'Ainda não é um recurso pronto do site. Se fizer sentido para a sua cidade, dá para combinar sob medida links para lojas online com programa de afiliados.' },
];

export const FAQ = [
  { q: 'Em quanto tempo o site fica pronto?', a: 'Prazo estimado, a partir de 2 semanas. Ele depende dos mercados da sua cidade: um mercado com catálogo na internet entra mais rápido do que um que só publica folheto em imagem. Esse prazo é só uma estimativa, combinada conforme os mercados da cidade, e eu confirmo antes de você pagar qualquer coisa.' },
  { q: 'E se um mercado bloquear a coleta?', a: 'Ele fica de fora. Os coletores são educados: pausa entre os pedidos, sem login e sem burlar bloqueio. Se o mercado não permite, a gente respeita e segue com os demais, ou usa o folheto que ele mesmo publica.' },
  { q: 'De quem são os dados e os folhetos?', a: 'Os preços e folhetos são dos mercados. O site só reúne o que é público e leva o cliente à oferta original. Parte das ofertas vem de folhetos lidos por inteligência artificial, e o site avisa isso.' },
  { q: 'O que eu recebo?', a: 'O site funcionando na sua cidade, com a atualização automática dos preços, o comparador e a lista de compras. Dependendo do plano: marca própria, domínio próprio (registro por conta do cliente) e espaço de anúncio. Relatório e painel são sob medida, a combinar.' },
  { q: 'Posso cancelar?', a: 'Cancelamento e devolução da implantação são condições combinadas no contrato, por escrito, antes de você pagar.' },
  { q: 'Como é o pagamento?', a: 'Forma de pagamento a combinar. Nada é cobrado antes de a gente fechar o combinado por escrito.' },
];
