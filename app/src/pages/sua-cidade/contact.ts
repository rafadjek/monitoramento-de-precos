// Contato público da página de venda (autorizado pelo Rafael). Sem servidor: o formulário só monta a mensagem.
export const WHATSAPP = '5511943016366';
export const WHATSAPP_TEXT = '(11) 94301-6366';
export const EMAIL = 'rcarto@gmail.com';

export const PROFILES = ['Pessoa física / empreendedor / influenciador local', 'Dono ou rede de mercado', 'Associação, prefeitura, jornal ou portal'] as const;
export const PLANS = ['Cidade Start', 'Cidade Pro', 'Rede / Entidade', 'Ainda não sei'] as const;

export type Lead = { nome: string; cidade: string; perfil: string; plano: string; mensagem: string };
export type LeadErrors = Partial<Record<keyof Lead, string>>;

export function validateLead(l: Lead): LeadErrors {
  const e: LeadErrors = {};
  if (l.nome.trim().length < 2) e.nome = 'Escreva seu nome.';
  if (l.cidade.trim().length < 2) e.cidade = 'Diga em qual cidade você quer o site.';
  if (!(PROFILES as readonly string[]).includes(l.perfil)) e.perfil = 'Escolha quem você é.';
  if (!(PLANS as readonly string[]).includes(l.plano)) e.plano = 'Escolha um plano (ou "Ainda não sei").';
  if (l.mensagem.length > 600) e.mensagem = 'Mensagem muito longa (máximo 600 letras).';
  return e;
}

export function buildMessage(l: Lead): string {
  const linhas = [
    'Olá! Quero levar o Bate Ofertas para a minha cidade.',
    '',
    `Nome: ${l.nome.trim()}`,
    `Cidade: ${l.cidade.trim()}`,
    `Perfil: ${l.perfil}`,
    `Plano de interesse: ${l.plano}`,
  ];
  if (l.mensagem.trim()) linhas.push('', `Mensagem: ${l.mensagem.trim()}`);
  return linhas.join('\n');
}

export const GENERIC_MESSAGE = 'Olá! Quero saber como levar o Bate Ofertas para a minha cidade.';
export const waLink = (text: string = GENERIC_MESSAGE) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
export const mailLink = (text: string, subject = 'Bate Ofertas na minha cidade') => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
