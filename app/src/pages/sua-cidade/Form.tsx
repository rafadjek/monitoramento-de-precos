import { useState, type FormEvent } from 'react';
import { buildMessage, EMAIL, mailLink, PLANS, PROFILES, validateLead, waLink, type Lead, type LeadErrors } from './contact';

const empty: Lead = { nome: '', cidade: '', perfil: '', plano: '', mensagem: '' };
const field = 'mt-1 w-full rounded-xl border-2 border-edge bg-night px-3 py-3 text-base text-ink placeholder:text-muted/80 focus:border-gold';
const ORDER = ['nome', 'cidade', 'perfil', 'plano', 'mensagem'] as const;

export function LeadForm() {
  const [lead, setLead] = useState<Lead>(empty);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [sent, setSent] = useState<'' | 'whatsapp' | 'email'>('');
  const set = (k: keyof Lead) => (e: { target: { value: string } }) => { setLead({ ...lead, [k]: e.target.value }); setSent(''); };

  const go = (how: 'whatsapp' | 'email') => {
    const e = validateLead(lead);
    setErrors(e);
    const first = ORDER.find((k) => e[k]);
    if (first) { document.getElementById(`f-${first}`)?.focus(); return; }
    const text = buildMessage(lead);
    if (how === 'whatsapp') window.open(waLink(text), '_blank', 'noopener,noreferrer');
    else window.location.href = mailLink(text);
    setSent(how);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go('whatsapp'); };

  const Err = ({ k }: { k: keyof Lead }) => (errors[k] ? <p id={`e-${k}`} className="mt-1 text-sm font-bold text-signal">{errors[k]}</p> : null);
  const a11y = (k: keyof Lead) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `e-${k}` : undefined });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Quero o Bate Ofertas na minha cidade">
      <div>
        <label htmlFor="f-nome" className="font-bold">Seu nome</label>
        <input id="f-nome" name="nome" autoComplete="name" maxLength={80} value={lead.nome} onChange={set('nome')} className={field} {...a11y('nome')} />
        <Err k="nome" />
      </div>
      <div>
        <label htmlFor="f-cidade" className="font-bold">Cidade que você quer</label>
        <input id="f-cidade" name="cidade" autoComplete="address-level2" maxLength={80} value={lead.cidade} onChange={set('cidade')} placeholder="Ex.: Santo André" className={field} {...a11y('cidade')} />
        <Err k="cidade" />
      </div>
      <div>
        <label htmlFor="f-perfil" className="font-bold">Quem é você</label>
        <select id="f-perfil" name="perfil" value={lead.perfil} onChange={set('perfil')} className={field} {...a11y('perfil')}>
          <option value="">Escolha...</option>
          {PROFILES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <Err k="perfil" />
      </div>
      <div>
        <label htmlFor="f-plano" className="font-bold">Plano de interesse</label>
        <select id="f-plano" name="plano" value={lead.plano} onChange={set('plano')} className={field} {...a11y('plano')}>
          <option value="">Escolha...</option>
          {PLANS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <Err k="plano" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="f-mensagem" className="font-bold">Conte o que você tem em mente <span className="font-normal text-muted">(opcional)</span></label>
        <textarea id="f-mensagem" name="mensagem" rows={3} maxLength={600} value={lead.mensagem} onChange={set('mensagem')} className={field} {...a11y('mensagem')} />
        <Err k="mensagem" />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <button type="submit" className="inline-flex min-h-[3.25rem] items-center justify-center rounded-xl bg-neon px-6 text-lg font-bold text-night shadow-neon hover:brightness-110">
          Enviar pelo WhatsApp
        </button>
        <button type="button" onClick={() => go('email')} className="inline-flex min-h-[3.25rem] items-center justify-center rounded-xl border-2 border-sky/70 px-5 font-bold text-sky hover:bg-sky/10">
          Prefiro e-mail
        </button>
      </div>
      <p className="text-sm text-muted sm:col-span-2" role="status">
        {sent === 'whatsapp' && <b className="text-neon">WhatsApp aberto com a mensagem pronta: é só apertar enviar. </b>}
        {sent === 'email' && <b className="text-neon">Seu programa de e-mail abriu com a mensagem pronta. </b>}
        Nada do que você escreve aqui é guardado nem vai para servidor: o formulário só monta a mensagem e abre o seu WhatsApp ou e-mail ({EMAIL}).
      </p>
    </form>
  );
}
