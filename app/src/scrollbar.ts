// Conta da barra de rolagem própria (ScrollRow): tamanho e posição do marcador. Sem DOM, testável.
export type Metrics = { visible: boolean; thumbWidth: number; thumbLeft: number; maxScroll: number };

export function thumbMetrics(scrollLeft: number, clientWidth: number, scrollWidth: number, trackWidth: number, minThumb = 48): Metrics {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (maxScroll <= 1 || clientWidth <= 0 || trackWidth <= 0) return { visible: false, thumbWidth: trackWidth, thumbLeft: 0, maxScroll: 0 };
  const thumbWidth = Math.min(trackWidth, Math.max(minThumb, Math.round((clientWidth / scrollWidth) * trackWidth)));
  const free = trackWidth - thumbWidth;
  const ratio = Math.min(1, Math.max(0, scrollLeft / maxScroll));
  return { visible: true, thumbWidth, thumbLeft: Math.round(ratio * free), maxScroll };
}

/** scrollLeft correspondente a uma posição do marcador (arrastar). */
export function scrollForThumbLeft(thumbLeft: number, thumbWidth: number, trackWidth: number, maxScroll: number): number {
  const free = trackWidth - thumbWidth;
  if (free <= 0) return 0;
  return Math.min(1, Math.max(0, thumbLeft / free)) * maxScroll;
}

/** Clique no trilho: centraliza o marcador no ponto clicado. */
export function scrollForTrackClick(x: number, thumbWidth: number, trackWidth: number, maxScroll: number): number {
  return scrollForThumbLeft(x - thumbWidth / 2, thumbWidth, trackWidth, maxScroll);
}

/** Valor 0..100 para aria-valuenow. */
export function percent(scrollLeft: number, maxScroll: number): number {
  return maxScroll <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, scrollLeft / maxScroll)) * 100);
}
