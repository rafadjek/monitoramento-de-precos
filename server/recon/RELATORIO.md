# Relatório de reconhecimento — 2026-11-05

Varredura automática (Chrome headless, pausa de 1,2 s entre páginas, no máximo 14 páginas por site) dos 8 mercados. Dados brutos em `out/<mercado>.json`, capturas da home em `out/<mercado>-home.png`.

| Mercado | O site é o certo? | Onde estão os produtos | Fonte principal | Observação |
|---|---|---|---|---|
| Atacadão | Sim (`atacadao.com.br`) | `/limpeza`, `/bebidas/...`, `/mercearia/...`, `/catalogo` (28 a 39 preços por página) | API VTEX (`/api/graphql`, operação `ProductGalleryQuery`, paginação de 20 em 20) | Sitemap com 68 URLs. Falta descobrir como fixar a loja de Mauá/Ribeirão Pires. |
| Assaí | Sim (`assai.com.br`) | `/ofertas`, `/bebidas`, `/higiene-e-perfumaria` (120 a 160 imagens por página) | Arquivo estático `sites/default/files/static/ofertas_assai.json` | Sitemap com 3.374 URLs. A página não mostra "R$" no texto; os preços podem estar na imagem ou na API de loja. A conferir. |
| Spani | Sim (`spanionline.com.br`) | `/departamentos/mercearia`, `/limpeza`, etc. | API VipCommerce (`services-beta.vipcommerce.com.br/api-admin/v1/org/67/...`) | Precisa do identificador de loja/filial. |
| Nagumo | Sim (`nagumo.com.br`) | `/categoria/departamentos/...` (40 a 44 preços por página, HTML) | HTML das categorias (Salesforce Commerce) | Sitemap com 500 URLs. Sem API de produto pública vista; ler o HTML. |
| Semar | Domínio do site não carregou links; o catálogo vem de API aberta | `sense.osuper.com.br/336/1703/v2/search?promotion=true...` e `.../category/<id>` | API oSuper (JSON) | Sem sitemap. É a fonte mais simples: JSON direto, com filtro de promoção. |
| Coop | **Não.** `coop.com.br` é uma empresa de trading (carga e comércio exterior), não o supermercado | Não encontrado | Folhetos (Tiendeo) | Preciso do endereço do site da Coop supermercados. A busca só achou agregadores. |
| Roldão | Site existe (`roldao.com.br`) mas é institucional (WordPress: posts, dúvidas, regiões); sem catálogo | Só nos folhetos | Folhetos (Tiendeo, Kimbino, Portafolhetos) | O site diz publicar "ofertas e receitas", mas o sitemap não tem produtos. |
| Atacadista São Jorge | **Não.** `saojorge.com.br` é loja de meias e roupas (Depósito de Meias São Jorge) | Não encontrado | Folheto do Sacolão São Jorge (Tiendeo), se for esse | A busca não achou site de "Atacadista São Jorge". Há "Comercial Atacadista de Alimentos São Jorge Ltda" (nome fantasia Varejão Universal) e o Sacolão São Jorge, que não vende por atacado. Preciso que o Rafael diga qual é. |

## Conclusão

- **Viáveis por API ou HTML (5):** Atacadão, Assaí, Spani, Nagumo, Semar. Dão preço e imagem sem ler folheto.
- **Só por folheto (1 a 2):** Roldão, e Coop se o site do supermercado não tiver catálogo.
- **Indefinidos (2):** Coop e São Jorge, por endereço errado meu. Dependem de resposta do Rafael.

## Limites desta varredura

- Foram abertas no máximo 14 páginas por site e só a home foi usada para achar links; os sites de Semar, Coop e Roldão não devolveram links na home (conteúdo carregado depois), então o mapa deles é incompleto.
- As APIs foram só localizadas, ainda não consultadas com paginação. Quantidade real de produtos e a seleção de loja de Mauá/Ribeirão Pires ainda não foram verificadas.
- Não foram conferidos termos de uso nem restrições de cada site para uso público dos dados.
