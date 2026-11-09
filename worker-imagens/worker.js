// Busca as imagens dos encartes do Assaí para o leitor que roda no GitHub Actions
// (o servidor de imagens do Assaí recusa os IPs do GitHub). Só aceita imagens desse servidor; nada mais.
const ALLOWED_HOST = 'd2q57q7k4hzryv.cloudfront.net';

export default {
  async fetch(req) {
    if (req.method !== 'GET') return new Response('método não permitido', { status: 405 });
    let target;
    try { target = new URL(new URL(req.url).searchParams.get('url') ?? ''); } catch { return new Response('url inválida', { status: 400 }); }
    if (target.protocol !== 'https:' || target.hostname !== ALLOWED_HOST || !/\.(jpe?g|png)$/i.test(target.pathname)) {
      return new Response('origem não permitida', { status: 403 });
    }
    const r = await fetch(target.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'image/*' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!r.ok) return new Response(`origem respondeu ${r.status}`, { status: 502 });
    const type = r.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return new Response('resposta não é imagem', { status: 502 });
    return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } });
  },
};
