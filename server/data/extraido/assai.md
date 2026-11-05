# Assaí — relatório do coletor (2026-11-05)

**Resultado: 0 produtos estruturados.** O site do Assaí não publica preço em texto nem catálogo de produtos. `assai.json` foi gravado como `[]` de propósito (regra: nada inventado).

## O que o site realmente tem

- `/ofertas`, `/bebidas`, `/higiene-e-perfumaria` e demais categorias são páginas institucionais: galeria de fotos das lojas, links de categoria e botão "Ver Ofertas". Zero "R$", zero card de produto, zero JSON-LD. As "126 a 162 imagens" vistas no reconhecimento eram fotos e ícones, não produtos.
- `sites/default/files/static/ofertas_assai.json` (baixado com requisição simples, HTTP 200) lista **encartes**: 71 campanhas, cada uma com datas, lojas (`loja_id`) e URLs de imagens JPEG (cloudfront). Os preços só existem dentro dessas imagens.
- A página da loja (`/ofertas/sao-paulo/assai-ribeirao-pires`) também não tem preço em texto.

## Loja/região

O JSON mapeia encartes por loja. Usei duas lojas da região: **Assaí Ribeirão Pires (loja_id 58)** e **Assaí Shop. Mauá (loja_id 161)**. Os mesmos encartes valem para as duas.

## Encartes das lojas (`assai-encartes.json`)

| Campanha | Validade (Brasília) | Situação em 05/11/2026 | Imagens |
|---|---|---|---|
| 175330-948 | 03/11 a 05/11/2026 (até 23:59) | **vigente, vence hoje** | 4, baixadas |
| 175326-739 | 03/11 a 04/11/2026 | vencida | 2, não baixadas |

- Imagens vigentes em `server/data/folhetos/assai/175330-948/pagina-1..4.jpg` (conferido: arquivos JPEG válidos, ~0,9 a 1,1 MB cada).
- Campos de cada encarte: offerId, validFrom, validUntil, vigente, validityNote, stores, images, localImages, collectedAt.

## Endpoints e requisições

- `GET /sites/default/files/static/ofertas_assai.json` + 4 imagens = 5 requisições, pausa de 1 s entre imagens, User-Agent de navegador, sem login.
- **Bloqueio:** ao abrir `/bebidas` com navegador headless, o Assaí respondeu 403 com desafio Incapsula (Imperva). Parei de usar navegador no site e não tentei contornar. Requisições simples (fetch/curl) ao JSON e às páginas retornam 200.

## O que ficou de fora e por quê

- **Produtos com preço:** só leitura das imagens dos encartes (visão ou OCR) pode extraí-los. Isso depende da decisão pendente A/B/C do plano e não faz parte deste coletor.
- Encarte vencido (175326-739): não baixado.
- Outras 69 campanhas de outras lojas: fora da região.
- Validade real vem do próprio JSON; é de campanha, não de produto individual.

## Verificação

- Rodei `collectors/assai.mjs` do zero: 2 encartes das lojas, 1 vigente, 5 requisições.
- `assai.json` é JSON válido (array vazio). A conferência de 5 produtos contra a página do site não se aplica: não há produto no site para comparar.
- A conferência feita foi: datas do JSON vs. regra "fim vale até 23:59 do último dia" (campanha 175330-948 aparece vigente hoje), e imagens baixadas abrem como JPEG.

## Para rodar de novo

`D:\ferramentas\node\node.exe server\collectors\assai.mjs`
