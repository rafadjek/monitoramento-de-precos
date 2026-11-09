# Roldão — reconhecimento (2026-11-05)

**Resultado:** sem catálogo com preço em texto. Nenhum coletor foi escrito e não existe `roldao.json`. Os preços só existem dentro de **imagens de encarte**; nenhuma imagem foi baixada nem lida (conforme a regra).

## O que foi varrido
- `robots.txt` (tudo liberado), `sitemap_index.xml` e os sitemaps de páginas, categorias e regiões.
- Páginas abertas no Chrome headless: `/ofertas/`, `/regiao/maua/`, `/lojas/`, `/televendas/`, `/roldao-mais/`. Todas com 0 ocorrências de "R$" no texto e nenhuma chamada XHR/JSON com produto ou preço (só SVGs).
- O WordPress só tem posts, receitas, regiões, lojas e institucional (`post`, `page`, `category`, `regiao`, `categoria_duvida`). Não há tipo de conteúdo de produto.
- Possíveis lojas online em outros domínios (`loja.`, `compre.`, `delivery.`, `ecommerce.roldao.com.br`, `roldaoonline.com.br`): nenhuma resolve. `roldaoatacadista.harmo.me` é só localizador de lojas. Canais de compra citados: Televendas (telefone, alto volume), WhatsApp e app Roldão Mais (benefícios, só lojas físicas).

## Onde ficam as ofertas
`https://roldao.com.br/ofertas/` ("Ofertas da Semana"): cartões de campanha com botão "Ver ofertas", cada um com um JPG de encarte em `wp-content/uploads/2026/11/`:

| Campanha | Validade | Lojas | Imagem |
|---|---|---|---|
| Quinta da Carne | 05.11 | Osasco I e II, Salto, Itu, Indaiatuba | `ROLDAO-ACOUGUE-05-11-2026-scaled.jpg` |
| Fim de Semana Arrasador + Dia R (COMBATE) | 05.11 a 08.11 | inclui **Mauá** e Santo André II (não lista Ribeirão Pires) | `ROLDAO-DIA-R-COMBATE-05-A-08-11-2026-01-scaled.jpg` |
| Fim de Semana Arrasador + Dia R (REDE) | 05.11 a 08.11 | Pirituba, Butantã, Santana, etc. (sem Mauá) | `ROLDAO-DIA-R-REDE-05-A-08-11-2026-01-scaled.jpg` |
| Fim de Semana Arrasador + Dia R (ESPECIAL) | 05.11 a 08.11 | não identificado no texto | `ROLDAO-DIA-R-ESPECIAL-05-11-A-08-11-2026-01-scaled.jpg` |
| Seara | 05.11 a 11.11 | "válidas por loja e região" | `ROLDAO-SEARA-05-A11-11-2026-scaled.jpg` |

Prefixo das imagens: `https://roldao.com.br/wp-content/uploads/2026/11/`. A página avisa que os valores "podem variar sem aviso prévio". Loja de Mauá: Roldão Atacadista Mauá (`/lojas-contato/roldao-atacadista-maua/`, Av. Capitão João, 1.641 segundo pesquisa anterior).

## Para fazer depois (só se o Rafael liberar leitura de imagem)
A Mauá aparece na campanha **COMBATE** (e possivelmente ESPECIAL/Seara). Um coletor teria que: abrir `/ofertas/`, listar as imagens de campanha, escolher as que citam Mauá e ler os preços com IA de visão. Falta confirmar se o servidor de imagens do Roldão aceita IP do GitHub (o do Assaí recusou com 403). Ribeirão Pires não tem loja Roldão na lista.
