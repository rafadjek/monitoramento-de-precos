const BASE = import.meta.env.BASE_URL;

/** Logo do Bate Ofertas (carrinhos + nome), igual na página principal e na de venda. */
export function Logo({ href = BASE, label = 'Bate Ofertas, início' }: { href?: string; label?: string }) {
  return (
    <a href={href} aria-label={label} className="flex items-center gap-2 sm:gap-3">
      <img src={`${BASE}logo-carrinhos.webp`} alt="" className="h-14 w-auto sm:h-20" />
      <span className="font-display text-2xl font-bold uppercase leading-[0.95] tracking-tight sm:text-4xl">
        <span className="title-fire">Bate</span><br />Ofertas
      </span>
    </a>
  );
}
