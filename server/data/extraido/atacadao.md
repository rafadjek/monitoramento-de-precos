# Atacadão — coleta de 2026-11-05

**Arquivo:** `server/data/extraido/atacadao.json` (6.750 produtos). Metadados e log em `atacadao.meta.json`; conferência em `atacadao.verificacao.json`. Coletor: `server/collectors/atacadao.mjs`; verificação: `verify-atacadao.mjs`.

## Totais

| Categoria | Produtos |
|---|---|
| alimenticios | 4.766 |
| higiene | 1.251 |
| limpeza | 665 |
| outros (vieram junto em Super Ofertas) | 68 |
| **Total** | **6.750** |

- Com imagem: 6.750 (todos). Com marca: 6.750. Com tamanho extraído do nome: 6.231.
- Com validade (`validUntil`): **0**. O site não informa data de validade de nenhuma oferta (nem em Super Ofertas); o preço é o vigente no momento da coleta (`collectedAt`) e isso está em `validityNote`.
- Com preço "de" (`listPrice`): 0. Nenhuma oferta trouxe preço cheio maior que o de venda.
- 1.431 itens estão listados na aba **Super Ofertas** (`/catalogo`), marcados em `validityNote`.
- 4.126 itens têm preço menor de atacado em volume (ex.: "R$ 2,49 a partir de 3 un"), registrado em `validityNote`. O campo `price` é sempre o preço de varejo (quantidade mínima 1).

## Loja e região

O Atacadão decide preço e estoque pela loja/CEP. O coletor usa o mecanismo público do próprio site: abre o seletor "Entrega em Casa", informa o CEP **09310-000 (Mauá)** e o número 1, e confirma. O site atribuiu a loja **Mauá Itapark (vendedor `atacadaobr631`)**. Isso está em `storeScope` de cada produto. Ribeirão Pires (09400-000) não foi coletado nesta rodada; o site pode atribuir outra loja a esse CEP.

## Como coleta

- Navegador Chrome headless (Playwright) abre cada página e o próprio site dispara a consulta `ProductsQuery` (API GraphQL do site, `/api/graphql`). O coletor repete essa consulta, mesma origem e cookies da sessão, 40 itens por vez, ordenado por nome para a paginação não repetir itens.
- Páginas lidas: `/catalogo` (Super Ofertas), `/mercearia`, `/padaria-e-matinais`, `/bebidas`, `/frios-e-congelados`, `/carnes-aves-e-peixes`, `/hortifruti`, `/cafeteria`, `/higiene-e-perfumaria`, `/limpeza`.
- Categoria (`category`) vem do departamento no caminho do produto; os fora disso (eletro, utilidades etc.) ficam "outros".
- 222 requisições, pausa de 1,1 s entre elas, 455 s no total. Sem bloqueio, sem captcha, sem login.

## O que ficou de fora

- Departamentos que não são alimento, higiene ou limpeza (utilidades, eletro, automotivo, pet, vestuário, papelaria etc.), exceto os 68 que vieram em Super Ofertas.
- `unitPrice` (preço por kg/litro): o site não entrega esse campo na consulta; ficou `null`.
- Mercearia tem 2.231 itens e a API recusa páginas após o item 2.000; o final da lista foi lido em ordem inversa e os dois trechos se cobrem (conferido: 2.360 lidos para 2.231).

## Conferência (2026-11-05)

- Estrutura: 6.750 registros, todos com os 17 campos esperados, `price` numérico > 0 em todos, sem `externalId` repetido, 0 problemas.
- Comparação com o site (página do produto aberta no navegador, mesma loja Mauá Itapark), 5 itens aleatórios: nome e preço conferem nos 5.
  - Queijo Coalho Ipanema Peça com 375g, R$ 28,90
  - Amaciante Roupas Concentrado Downy Brisa de Verão 1,5L, R$ 24,90
  - Salgadinho Lucky Torcida Pimenta Mexicana 100g, R$ 3,99
  - Bala Arcor Butter Toffees Leite 400g, R$ 16,90
  - Molho de Tomate Pomarola Bolonhesa 300g, R$ 4,79
- Uma primeira rodada deixou 233 itens da mercearia de fora (limite de 2.000 da API); corrigido e coletado do zero de novo, que é a que está no arquivo.
