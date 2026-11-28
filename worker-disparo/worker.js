// Dispara os workflows do Bate Ofertas no GitHub Actions na hora certa.
// O agendamento (schedule) do próprio GitHub atrasava até 9 h na fila; o cron da Cloudflare não.
// Segredo necessário: GITHUB_TOKEN (token fino do GitHub, só este repositório, permissão Actions: leitura e escrita).

const REPO = 'rafadjek/monitoramento-de-precos';
// cron (UTC) -> workflow
const POR_CRON = {
  '30 4 * * *': 'atualizar.yml', // 01h30 de Brasília: coleta diária
  '10 8 * * *': 'fichas.yml', // 05h10 de Brasília: logo depois de a cota diária do Gemini renovar (08h UTC); no fim, o fichas.yml dispara a coleta
};

async function disparar(env, workflow) {
  let ultimo = '';
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bate-ofertas-disparo',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (r.status === 204) return { ok: true, workflow, tentativa };
    ultimo = `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
    await new Promise((res) => setTimeout(res, tentativa * 5000));
  }
  return { ok: false, workflow, erro: ultimo };
}

export default {
  async scheduled(event, env, ctx) {
    const workflow = POR_CRON[event.cron] ?? 'atualizar.yml';
    ctx.waitUntil(
      disparar(env, workflow).then((r) => {
        console.log(JSON.stringify(r));
        if (!r.ok) throw new Error(`Disparo falhou: ${r.erro}`);
      }),
    );
  },
  // Teste manual: GET com ?chave=<DISPARO_CHAVE>&workflow=<arquivo.yml> (só se o segredo DISPARO_CHAVE existir).
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.DISPARO_CHAVE || url.searchParams.get('chave') !== env.DISPARO_CHAVE) return new Response('não', { status: 404 });
    return Response.json(await disparar(env, url.searchParams.get('workflow') || 'atualizar.yml'));
  },
};
