const BASE = import.meta.env.BASE_URL;

/** Logo do Bate Ofertas (carrinhos + nome), igual na página principal e na de venda. */
/** compact: cabeçalho do app em tela estreita (deixa espaço para Ofertas e Minha lista) */
export function Logo({ href = BASE, label = 'Bate Ofertas, início', compact = false }: { href?: string; label?: string; compact?: boolean }) {
  return (
    <a href={href} aria-label={label} className={`flex min-w-0 items-center ${compact ? 'gap-1.5' : 'gap-2 sm:gap-3'}`}>
      <img src={`${BASE}logo-carrinhos.webp`} alt="" className={`w-auto ${compact ? 'h-11' : 'h-14'} sm:h-20`} />
      <span className={`font-display font-bold uppercase leading-[0.95] tracking-tight sm:text-4xl ${compact ? 'text-xl' : 'text-2xl'}`}>
        <span className="title-fire">Bate</span><br />Ofertas
      </span>
    </a>
  );
}
