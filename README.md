# Bate Ofertas — Combate de preços em Mauá e Ribeirão Pires

(repositório `monitoramento-de-precos`)

Site que reúne os preços de **alimentícios, higiene e limpeza** dos mercados da região, com busca e filtros. Qualquer pessoa usa pelo navegador; não precisa instalar nada.

Os preços são lidos dos sites e folhetos dos próprios mercados e **podem mudar**. Confirme na loja antes de ir.

## Como funciona

Tudo roda no GitHub, sem servidor e sem depender de nenhum computador pessoal:

1. **GitHub Actions** roda todo dia às 06h: coletores de catálogo em `server/collectors/` e leitura dos encartes. Era semanal até 10/11/2026, mas o Spani mudou 12% dos preços de um dia para o outro e os preços deixavam de bater com os sites.
2. `server/build-site.mjs` junta os dados, agrupa o mesmo produto de mercados diferentes (`server/group.mjs`) e gera arquivos estáticos. O agrupamento usa primeiro o código de barras (EAN), que os dois mercados publicam: Spani no campo `codigo_barras` da API, Atacadão pela API pública de catálogo da VTEX (`collectors/atacadao-ean.mjs`, lotes de 50). A regra por nome só junta quando nenhum EAN contradiz, com uma exceção: nomes da mesma marca, mesmo tamanho e preço parecido (até 30% de diferença) que diferem só por palavras que descrevem (lista `SOFT`: torrado, moído, vácuo, almofada, garrafa, pet, lager...) juntam mesmo com EAN diferente. Qualquer outra palavra a mais (sem, zero, light, integral, um sabor, lata) separa. Testes: `npm test` em `server/`.

**Comparação justa.** `parsePack` (em `group.mjs`) lê do nome quantas unidades vêm ("36x56g", "350ml c/12", "sacola 50% na segunda", "1,2L + 1,2L"); contagem sem peso/volume ("fralda com 58 unidades") é o próprio produto e não vira caixa. O site compara pelo preço de cada unidade quando as embalagens diferem ("R$ 1,39 cada · R$ 49,90 com 36"). Preço mais de 2,2 vezes distante dos outros fica marcado "preço fora do padrão, confira" e não entra na economia; com só 2 mercados e preços muito distantes, o grupo avisa que um deles pode ser caixa. Nunca se chuta quantidade que o nome não diz.

**Menor preço sem cartão da loja** (`server/price.mjs`): preço de app ou clube com CPF (Meu Assaí, clube Semar, Clube Extra), pix, cooperado e preço por quantidade ("a partir de 3 un.", "leve 5 pague 4", calculado por unidade) viram o preço principal, com o normal riscado e a condição escrita. Preço que exige cartão próprio da loja fica só como observação.
3. O site (`app/`, React + Vite + Tailwind) fica em **https://bate-ofertas.pages.dev** (Cloudflare Pages, projeto `bate-ofertas`, publicado pelo workflow com o segredo `CLOUDFLARE_API_TOKEN`). O endereço antigo do GitHub Pages (branch `gh-pages`) só redireciona para lá; sem o segredo, o workflow volta a publicar o site completo no GitHub Pages. A busca roda no navegador do visitante.

Encartes em imagem: `collectors/baronesa.mjs` e `collectors/assai.mjs` gravam um manifesto (`<mercado>-encartes.json`) com as imagens vigentes, e `server/readers/folheto.mjs` lê cada imagem com IA gratuita com visão (Gemini; reserva OpenRouter): nome, preço, condição ("leve 12 pague 11", "a partir de 3 un.") e a validade impressa. Sem validade, o produto não entra. Cada imagem é lida uma vez só (cache em `server/data/cache`, guardado entre execuções). O relatório da última leitura fica em `server/data/extraido/encartes.leitura.json`. No site não há distinção: encarte e catálogo entram no mesmo comparador (produto de um mercado só aparece sozinho), cada mercado aparece pelo logotipo (`app/public/logos`; Spani como letreiro nas cores da marca, pois o site não publica o arquivo) e o preço leva à oferta original (página do site ou imagem do encarte).

**Tela ("Bate Ofertas", desde 10/11/2026).** Tema escuro em neon pelo modelo do Rafael (`app/public/fundo.webp`, `bate-ofertas.png`). Tabela com um mercado por coluna: produto fixo à esquerda, ação fixa à direita, 4 mercados visíveis e barra para arrastar até os outros (sempre todos os mercados da região); toque no logotipo filtra por aquele mercado. Categorias finas (`server/category.mjs`: hortifruti, carnes, laticínios, bebidas, mercearia, limpeza, higiene, outros) pelo departamento de cada site e pelo nome. Ordem: menor preço, maior preço, nome. Favoritos e a lista ficam no navegador (localStorage), sem login.

**Carrinho Inteligente** (`app/src/cart.ts`, testes em `app/src/cart.test.ts`, `npm test` em `app/`): lista com quantidade; o "+" de cada etiqueta põe aquela oferta na lista fixa naquele mercado (`m` no item), e "Pôr na lista (mais barato)" deixa o carrinho escolher; cada item mostra onde comprar; total em cada mercado (quem tem a lista inteira primeiro; "tem 3 de 4" para os outros); melhor compra e economia contra o mais caro; melhor divisão em 2 mercados; "Mandar no WhatsApp" abre o WhatsApp direto (api.whatsapp.com/send?text=) com a lista pronta, agrupada por mercado, com preços e total (`shareText`); link `?lista=id*qtd~...` ainda é aceito; aviso de preço por quantidade ou que vence logo. Preço fora do padrão não entra na conta.

**Disponibilidade.** Produto esgotado na loja não entra: Atacadão pelo `availability` da oferta, Nagumo pelo `available` do produto (na loja 038 Mauá só ~6,3 mil dos ~26 mil do catálogo estão à venda); os outros coletores já filtravam.

Se um coletor falhar ou voltar muito menos produtos que na semana anterior, o `run-all.mjs` mantém os dados antigos.

## Mercados

| Mercado | Fonte | Situação |
|---|---|---|
| Atacadão | API do site (loja de Mauá, CEP 09310-000) | funcionando |
| Spani | API do site (loja Mauá 1) | funcionando |
| Coop | API VTEX do site, loja Barão de Mauá fixa pelo `regionId` (base64 de `SW#coopspbm`; Ribeirão Pires = `coopsprp`) | funcionando |
| Baronesa (Mauá) | Encarte em imagem (`/classes/encarte.php`), lido por IA | funcionando |
| Assaí | Encarte em imagem das lojas Ribeirão Pires e Mauá, lido por IA | funcionando (imagens pelo Worker, ver abaixo) |
| STUK (Ribeirão Pires) | Ofertas só no Instagram e WhatsApp | só link no rodapé do site |
| Nagumo | JSON do site (Salesforce, `Search-UpdateGrid`) com a loja 038 Mauá fixada, pelo navegador | funcionando (~26 mil produtos) |
| Semar | API OSuper `sense.osuper.com.br/336/1705/v2/search` (loja 06 Mauá), chamada de dentro da página (a Cloudflare só atende navegador); 20 por página, por departamento | funcionando (~9,5 mil) |
| Extra | API GPA `api.vendas.gpa.digital/ex/search/search`. As lojas de Mauá e Ribeirão Pires não vendem pelo site: usa a loja online mais próxima (1867 Demarchi, São Bernardo, `storeId` 1162). A busca não aceita termo vazio: 158 termos de itens comuns | funcionando (~4 mil; cidade "São Bernardo do Campo" no filtro) |
| Joanin | Tabloide em imagem em `/ofertas/` (`pagN-full-tabloide-*-DDMMAAAA.jpg`), lido por IA | funcionando |
| Dia (Mauá) | O site do Dia não publica ofertas. Entra pelos produtos em destaque do folheto da loja de Mauá na página pública do Tiendeo (`/maua/supermercado-dia`): nome, preço, De/Por e foto, em texto, sem IA. O folheto inteiro fica em `/Catalogos/`, que o robots.txt do Tiendeo proíbe, por isso não é usado | funcionando (~10 destaques) |
| Roldão (Mauá) | Encarte em PDF por campanha em `/ofertas/`; entram as que citam Mauá ou valem para a rede. O PDF vem de `admin-ajax.php?action=elem_get_pdf_oferta_iframe` e o leitor manda o PDF direto ao Gemini (sem foto recortada). Sem loja em Ribeirão Pires | funcionando |
| São Jorge | só folheto | a fazer |

Nem todo mercado informa validade de oferta; quando não informa, o site mostra "validade não informada".

### Imagens do Assaí

O servidor de imagens do Assaí só atende o Brasil e recusa os IPs do GitHub. As imagens passam por um Worker na Cloudflare (`worker-imagens/`, `monitoramento-precos-imagens.consultor-milhas-worker.workers.dev`), fixado perto de São Paulo (`[placement] region = "aws:sa-east-1"`). Ele só aceita imagens `.jpg/.png` do servidor de encartes do Assaí e é usado só quando o download direto dá 403. Publicar de novo: `npx wrangler deploy` dentro de `worker-imagens/`.

## Configuração (uma vez)

**Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`.**

Leitor de encartes: crie uma chave gratuita no [Google AI Studio](https://aistudio.google.com/apikey) e guarde como segredo do repositório (`GEMINI_API_KEY`; reserva opcional `OPENROUTER_API_KEY`). A chave fica só no GitHub e nunca vai para o código nem para o site.

## Rodar no computador

```bash
npm install --prefix server && npm install --prefix app
node server/build-site.mjs          # monta app/public/data a partir de server/data/extraido
npm run dev --prefix app            # abre em http://localhost:5173
```

Para coletar de novo localmente: `node server/run-all.mjs` (coletores: spani, atacadao, coop, nagumo, semar, extra) (precisa de Google Chrome; use `CHROME_PATH` se não estiver no caminho padrão).

## Acrescentar um mercado

Crie `server/collectors/<mercado>.mjs` que grave `server/data/extraido/<mercado>.json` com os campos de `server/build-site.mjs` (`market`, `externalId`, `name`, `price`, `category`, `imageUrl`, `productUrl`, `validUntil`, `collectedAt`...) e inclua o nome em `COLLECTORS` no `run-all.mjs`. Para folheto em imagem, basta um manifesto como `server/data/extraido/assai-encartes.json` e rodar o leitor.

## Boas práticas e limites

- Pausa de pelo menos 1 segundo entre requisições, sem login e sem contornar bloqueios (captcha, Cloudflare, Incapsula). Mercado que bloqueia fica de fora.
- Os dados vêm de páginas públicas dos mercados. Se você é de um desses mercados e quer o seu conteúdo fora do site, abra uma issue.
