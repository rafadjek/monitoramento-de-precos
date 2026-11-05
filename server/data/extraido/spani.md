# Spani Atacadista — coleta de 2026-11-05

Arquivo: `server/data/extraido/spani.json` (3.298 produtos). Coletor: `server/collectors/spani.mjs`. Conferência: `server/collectors/verify-spani.mjs` (resultado em `spani.verificacao.json`).

## Resultado

- **Total:** 3.298 produtos, 0 duplicados, 0 descartados por falta de nome/preço.
- **Por categoria:** alimentícios 2.316 · higiene 603 · limpeza 379 · outros 0.
- **Por departamento do site:** Biscoitos e chocolates 431, Bebidas 411, Mercearia 368, Cereais e farináceos 104, Padaria 88, Carnes 119, Hortifruti 77, Matinais e sobremesas 283, Frios e laticinios 334, Congelados 101, Perfumaria e higiene 603, Limpeza 379.
- **Com imagem:** 3.259 (os outros 39 não têm foto no cadastro do site). Imagens em 500x500.
- **Com validade (`validUntil`):** 0. A API do Spani não informa data de término de oferta. O campo `validityNote` diz isso em cada item; o preço vale no momento da coleta (2026-11-05).
- **Com tamanho (`size`):** 3.016, extraído do nome ("240ml", "1kg"). Os demais não têm medida no nome.
- **Com preço "de" (`listPrice`):** 214 (ofertas simples, sem quantidade mínima).

## Loja e região

- Loja usada: **Spani Mauá 1**, Av. Barão de Mauá, 2005, Jardim Nóbrega, Mauá/SP, CEP 09340-440 (retirada na loja; centro de distribuição id 17, filial 1).
- A lista pública de lojas do site (33) não tem unidade em Ribeirão Pires. Mauá é a loja mais próxima da região. O preço do Spani é por loja, e foi coletado só para essa.
- A seleção foi feita como o site faz: a lista de lojas vem de `/loja/centros_distribuicoes/retiradas` e o `id` da loja entra no caminho da API. Na conferência no navegador, a página mostrou "Retirar na loja: Av. Barão de Mauá, 2005".
- Atenção: o campo `vipcommerce_centro_distribuicao_id` (255) NÃO funciona nos endpoints; vale o `id` (17).

## Como o preço foi tratado

- `price` é sempre o preço de **1 unidade**, para comparar com outros mercados.
- Em 2.227 itens o Spani tem "Mais por menos" (preço menor só ao levar 3, 4, 6 ou 10 unidades). Nesses itens `price` é o preço de 1 unidade e o preço de quantidade vai em `validityNote` (ex.: "R$ 4,49 cada na compra de 3 ou mais unidades").
- Em 214 itens a oferta vale desde a 1ª unidade: `price` = preço da oferta e `listPrice` = preço anterior.
- `unitPrice` ficou `null`: a API de listagem não devolve preço por kg. A página de produto mostra "R$ 86,38/kg" (calculado pelo site); não reproduzi o cálculo.
- `brand` ficou `null`: o `marca_id` da API não bate com a marca real (Mostarda Heinz aparece como "MANTECAL", Macarrão Dona Benta como "NENE"). Gravar isso seria dado errado. A marca pode ser extraída do nome na normalização.

## Endpoints usados (sem login de usuário)

Base `https://services-beta.vipcommerce.com.br/api-admin/v1`, cabeçalhos `organizationid: 67` e `domainkey: spanionline.com.br`.

- `POST /org/67/auth/loja/login`: login anônimo "loja", com a chave pública que o JavaScript do próprio site envia a qualquer visitante.
- `GET /org/67/loja/sessao_cliente`: id de sessão.
- `GET /org/67/filial/1/loja/centros_distribuicoes/retiradas`: lista de lojas.
- `GET .../centro_distribuicao/17/loja/classificacoes_mercadologicas/departamentos/arvore`: departamentos e seções.
- `GET .../departamentos/{id}/produtos?page=N&limit=100`: produtos, paginados.

50 requisições no total, pausa de 1 s entre elas, User-Agent de navegador, sem bloqueio (nenhum 403/429).

## O que ficou de fora

- Departamentos **Bazar e utilidades** (214) e **Pet** (38): fora do escopo (alimentícios, higiene, limpeza).
- **592 produtos indisponíveis** (`disponivel: false`) foram excluídos, para não mostrar preço de item que não dá para comprar. Se o app preferir listá-los, é só trocar a condição em `spani.mjs`.
- Datas de validade (a fonte não tem), preço por kg e marca (ver acima).

## Conferência feita

- **Estrutura (script):** todos os 17 campos exatos em todos os itens, preços numéricos > 0, `listPrice` sempre maior que `price`, categorias válidas, URLs absolutas, sem `externalId` repetido. 0 problemas.
- **Contra o site (navegador, loja de Mauá selecionada), 5 produtos aleatórios, 5 de 5 conferem em nome, preço e loja:** Queijo Ralado Italac 40g (R$ 3,69), Limpador Desengordurante Veja 400ml (R$ 19,49), Hidratante Corporal Nivea 400ml Milk (R$ 28,90), Requeijão Copo Tirolez Light 200g (R$ 9,19), Iogurte Líquido Danoninho 100g Morango (R$ 3,59). Os preços de quantidade (R$ 3,39, R$ 17,49, R$ 25,90, R$ 8,49, R$ 3,29) também aparecem na página.
- O coletor foi rodado do zero (não havia arquivo anterior) antes da conferência.
