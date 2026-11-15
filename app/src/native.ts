// Funcoes do app Android (Capacitor). Na web nada disso faz nada: sem Capacitor, tudo cai no comportamento normal do site.
// Os plugins sao chamados pela ponte nativa (window.Capacitor), que o app injeta na tela; assim o site nao importa
// nenhum pacote do Capacitor e o app/package.json continua o mesmo.
import { useEffect, useState } from 'react';

type Bridge = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<any>;
  addListener?: (plugin: string, event: string, cb: (e: any) => void) => unknown;
};
const bridge = (): Bridge | undefined => (window as unknown as { Capacitor?: Bridge }).Capacitor;

/** true so dentro do app Android */
export const isNative = (): boolean => { try { return !!bridge()?.isNativePlatform?.(); } catch { return false; } };

/** true so dentro do app Android (na web, tudo continua como esta) */
export const isApp = isNative;

const SITE = 'https://bate-ofertas.pages.dev/';
const BUILD_DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) || '';
/** de onde sai data/ e img/: no app, o endereco publico do site; na web, o proprio site (caminho relativo) */
export const DATA_BASE: string = BUILD_DATA_URL || (isNative() ? SITE : import.meta.env.BASE_URL);

/** Chama um plugin pela ponte. Sem resposta em 4 s, rejeita: uma chamada perdida nunca trava a tela. */
const call = (plugin: string, method: string, options?: unknown): Promise<any> => new Promise((resolve, reject) => {
  const p = bridge()?.nativePromise?.(plugin, method, options);
  if (!p) { reject(new Error('sem ponte')); return; }
  const t = setTimeout(() => reject(new Error('tempo esgotado')), 4000);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** Menu nativo de compartilhar. Devolve false se nao esta no app (ai o site usa o jeito dele). */
export async function nativeShare(o: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!isNative()) return false;
  try { await call('Share', 'share', { ...o, dialogTitle: 'Compartilhar lista' }); } catch (e) {
    // usuario fechou o menu: conta como tratado; qualquer outro erro: o botao usa o jeito alternativo
    return /cancel/i.test(String((e as { message?: string } | null)?.message ?? e));
  }
  return true;
}

/** Abre link de fora no navegador do aparelho (WhatsApp abre direto o aplicativo). */
export async function openExternal(url: string): Promise<void> {
  // WhatsApp: o Capacitor entrega a URL externa ao Android como Intent, que abre o aplicativo
  if (/^https?:\/\/(api\.whatsapp\.com|wa\.me)\//.test(url)) {
    try { window.location.href = url; return; } catch { /* cai no navegador */ }
  }
  try { await call('Browser', 'open', { url }); } catch { /* sem navegador: nada a fazer */ }
}

// ---- aviso "sem internet" ----
let fromCache = false;
const cacheHits = new Set<string>(); // arquivos de dados servidos da copia do aparelho nesta sessao
const EVT = 'bate-dados-salvos';
const setFromCache = (v: boolean) => { if (fromCache !== v) { fromCache = v; window.dispatchEvent(new Event(EVT)); } };
/** true quando os precos que aparecem vieram da copia guardada no aparelho (sem internet) */
export function useFromCache(): boolean {
  const [v, setV] = useState(fromCache);
  useEffect(() => { const on = () => setV(fromCache); window.addEventListener(EVT, on); on(); return () => window.removeEventListener(EVT, on); }, []);
  return v;
}

/** apaga da copia guardada os arquivos de mercados que sairam do indice */
async function pruneCache(name: string, prefix: string, idx: Response) {
  try {
    const keep = new Set<string>([prefix + 'index.json']);
    for (const m of ((await idx.json()) as { markets?: { file?: string }[] }).markets ?? []) if (m.file) keep.add(prefix + m.file);
    const c = await caches.open(name);
    for (const k of await c.keys()) {
      const u = k.url;
      if (u.startsWith(prefix) && !u.startsWith(prefix + 'hist/') && !keep.has(u)) await c.delete(k);
    }
  } catch { /* limpeza e so conforto */ }
}

// dados (data/*.json): rede primeiro, e a ultima copia boa fica guardada no aparelho (Cache API)
function installDataCache() {
  const CACHE = 'bate-dados-v1';
  const prefix = DATA_BASE + 'data/';
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(prefix) || !('caches' in window)) return orig(input, init);
    const isIndex = url.endsWith('/index.json');
    const mark = (hit: boolean) => { if (hit) cacheHits.add(url); else cacheHits.delete(url); setFromCache(cacheHits.size > 0); };
    let failed: Response | null = null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await orig(url, { cache: 'no-cache', signal: ctl.signal }).finally(() => clearTimeout(t));
      if (r.ok) {
        try { await (await caches.open(CACHE)).put(url, r.clone()); } catch { /* sem espaco: segue sem guardar */ }
        mark(false);
        if (isIndex) void pruneCache(CACHE, prefix, r.clone());
        return r;
      }
      failed = r;
    } catch { /* sem rede */ }
    try {
      const hit = await (await caches.open(CACHE)).match(url);
      if (hit) { mark(true); return hit; }
    } catch { /* sem cache */ }
    if (failed) return failed;
    throw new TypeError('Failed to fetch');
  };
}

function installBack() {
  bridge()?.addListener?.('App', 'backButton', () => {
    // 1) pagina de venda volta ao comparador
    if (location.hash === '#/sua-cidade') { location.hash = ''; return; }
    // 2) fecha o que estiver aberto: carrinho, lista de cidades, historico de preco
    const open = [...document.querySelectorAll<HTMLElement>('[aria-expanded="true"]')].find((el) => el.offsetParent !== null);
    if (open) { open.click(); return; }
    // 3) nada aberto: sai do app
    void call('App', 'exitApp').catch(() => {});
  });
}

function installLinks() {
  const external = (href: string) => { try { return /^https?:$/.test(new URL(href).protocol) && new URL(href).origin !== location.origin; } catch { return false; } };
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && external(a.href)) { e.preventDefault(); void openExternal(a.href); }
  }, true);
  window.open = ((u?: string | URL) => { const s = String(u ?? ''); if (external(s)) void openExternal(s); return null; }) as typeof window.open;
}

/** Chamado uma vez na abertura, so dentro do app. */
export function initNative() {
  if (!isNative()) return;
  installDataCache();
  installLinks();
  installBack();
  void call('SystemBars', 'setStyle', { style: 'DARK' }).catch(() => {});
  void call('StatusBar', 'setBackgroundColor', { color: '#060B1A' }).catch(() => {});
  void call('StatusBar', 'setStyle', { style: 'DARK' }).catch(() => {}); // DARK = icones claros
  setTimeout(() => { void call('SplashScreen', 'hide', { fadeOutDuration: 250 }).catch(() => {}); }, 300);
}
