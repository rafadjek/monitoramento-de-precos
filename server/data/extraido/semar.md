# Semar — coleta (2026-11-05): BLOQUEADA, nada coletado

**Total coletado: 0.** Não existe `semar.json` e não há coletor `semar.mjs`. Escrever o coletor sem ver a resposta da API seria chutar o formato dos campos.

## O que foi verificado

- `semarsupermercados.com.br` redireciona para o storefront real, **`https://www.semarentrega.com.br`** (plataforma oSuper). O catálogo vem de `sense.osuper.com.br/336/1703/v2/` (`/search?promotion=true`, `/category/<id>`), achados na varredura da Etapa 1.
- **Seleção de loja existe**: a home mostra "Loja de São Miguel - 04 (Entrega e Retirada)" como padrão, o que indica catálogo por loja. Não cheguei a ver a lista de lojas nem se há uma de Mauá ou Ribeirão Pires.
- Menu real (departamentos): Mercearia, Carnes e aves, Hortifruti, Bebidas não alcoólicas, Higiene e beleza, Limpeza, Laticínios e frios, Bebidas alcoólicas, Congelados, etc., mais "Ofertas semanal (03 a 09/11)", "Ofertas açougue", "Ofertas bebidas", "Quinta maluca 05/11".

## Por que parou

- `curl` com User-Agent de navegador em `sense.osuper.com.br/.../search?promotion=true&size=1&from=0` → **HTTP 403**, página "Sorry, you have been blocked" (Cloudflare, Ray ID `a55dd9439a7c01a4`, domínio osuper.com.br).
- No Chrome headless, a home abriu (200), mas o front-end do Semar não carregou produtos: os bundles `cdn.osuper.com.br/*.js` falharam (`net::ERR_FAILED`) e CSS e imagens ficaram bloqueados (`ERR_BLOCKED_BY_ORB`). A tela mostrou "Não foi possível sua solicitação! Verifique sua conexão". Um `curl` isolado no CDN devolveu 200, então o bloqueio é na API e no navegador automatizado.
- Na varredura da Etapa 1, o mesmo navegador conseguira ler a API. Hipóteses (não confirmadas): bloqueio por volume depois da varredura e do primeiro `curl`, ou por detecção de automação.
- Pelas regras (sem burlar WAF, sem insistir), **não tentei contornar** (sem trocar de IP, cabeçalhos forjados, proxy ou quebra de captcha) e não repeti as requisições.

## Conferência pedida (não aplicável)

Sem dados coletados, não houve validação do JSON nem comparação de 5 produtos com o site.

## Caminhos possíveis (decisão do Rafael)

1. Tentar de novo mais tarde, com pausa maior, em rodada única e com sessão normal. Pode ter sido bloqueio temporário.
2. Pedir ao Semar/oSuper acesso ou autorização para uso dos dados (relevante também para o app público).
3. Usar só os folhetos do Semar (Tiendeo/Kimbino, vigentes até 12/11) lidos por imagem.
4. Anotar o Semar como "sem coleta automática" no app até resolver.
