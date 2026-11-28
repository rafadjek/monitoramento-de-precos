# Bate Ofertas — Combate de preços em Mauá e Ribeirão Pires

(repositório `monitoramento-de-precos`)

> **Ficha rápida**
> - Testar: `npm test` em `server/` (65 testes) e em `app/` (70 testes); `node server/build-site.mjs` + `npm run dev --prefix app` para ver o site.
> - Onde roda: coleta e leitura no GitHub Actions (`atualizar.yml`, todo dia 01h30 por disparo do Worker `bate-ofertas-disparo`; farmácias em `farmacias.yml`, 22h47); site em https://bate-ofertas.pages.dev (Cloudflare Pages).
> - Variáveis de ambiente (segredos do repositório, só os nomes): `GEMINI_API_KEY`, `GEMINI_JUIZ_KEY`, `GEMINI_JUIZ_KEY_2`, `GEMINI_JUIZ_KEY_3`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`, `GROQ_API_KEY`, `APIFY_TOKEN`, `BRIGHTDATA_TOKEN`, `SCRAPECREATORS_KEY`, `SOCIALCRAWL_KEY`, `CRAWLBASE_TOKEN` (segredo `CRAWLBASE_API`), `CLOUDFLARE_API_TOKEN`.
> - Último teste validado: 2026-11-23 (65 testes do servidor e medição no gabarito com as palavras acessórias da Fase 18.1); build completo do site validado em 2026-11-22. Folheto do Atacadão conferido em 22/11: 9 de 9 itens verificáveis batem com o PDF.

> **Estado atual (2026-11-28)**
> - Coleta diária voltou a publicar em 28/11 (run 46094512416 com sucesso, site com data de 28/11). De 23 a 27/11 ela falhava todo dia no passo "Guardar dados coletados": `git pull --rebase` recusava rodar com arquivos alterados fora do commit. Corrigido com `--autostash` (commit ae6c205, em `atualizar.yml` e `farmacias.yml`); o que sobrava sem commit não foi identificado.
> - 28/11: coleta passou a ser disparada por Worker da Cloudflare (`worker-disparo/`, segredo `GITHUB_TOKEN` no Worker, token fino do GitHub que expira em 1 ano; renovar com `npx wrangler secret put GITHUB_TOKEN`). O `schedule` do GitHub foi removido. Disparo manual de teste feito em 28/11 (HTTP 204).
> - Falta conferir o juiz de IA (cadeia Gemini → OpenRouter → OpenCode → Groq) numa coleta agendada: `juiz-veredictos.json` ainda mostra a última execução em 23/11.
> - Black Friday na página de venda termina em 30/11 (decisão do Rafael: deixar encerrar; para outro evento, acrescentar em `EVENTS`).
> - Avisos sem gravidade em 27/11: Baronesa com timeout, Apify com 403, Instagram do Consulado do Churrasco sem posts.

Site que reúne os preços de **alimentícios, higiene e limpeza** dos mercados da região, com busca e filtros. Qualquer pessoa usa pelo navegador. No celular dá para instalar como app (botão "Instalar" no Chrome/Android; no iPhone, Compartilhar → Adicionar à Tela de Início), e ele abre sem internet com os preços da última visita.

Os preços são lidos dos sites e folhetos dos próprios mercados e **podem mudar**. Confirme na loja antes de ir.

## Como funciona

Tudo roda no GitHub, sem servidor e sem depender de nenhum computador pessoal:

1. **GitHub Actions** roda todo dia às 01h30, disparado por um Worker da Cloudflare (`worker-disparo/`, cron 04:30 UTC; o `schedule` do GitHub atrasava até 9 h na fila): coletores de catálogo em `server/collectors/` e leitura dos encartes. Era semanal até 10/11/2026, mas o Spani mudou 12% dos preços de um dia para o outro e os preços deixavam de bater com os sites.
2. `server/build-site.mjs` junta os dados, agrupa o mesmo produto de mercados diferentes (`server/group.mjs`) e gera arquivos estáticos. O agrupamento usa primeiro o código de barras (EAN): Spani no campo `codigo_barras` da API, Atacadão pela API pública de catálogo da VTEX (`collectors/atacadao-ean.mjs`, lotes de 50), Coop pela VTEX e Extra pela página de cada produto (`collectors/extra-ean.mjs`, cache em `extra-ean.json`, até 1.500 consultas por dia). Nagumo e Semar não publicam EAN em lugar nenhum. Quando o mercado não informa a marca, ela é deduzida do nome (`brandKeys`: palavra que é a marca em 60% ou mais dos nomes em que aparece). A regra por nome só junta quando nenhum EAN contradiz, com uma exceção: nomes da mesma marca, mesmo tamanho e preço parecido (até 30% de diferença) que diferem só por palavras que descrevem (lista `SOFT`: torrado, moído, vácuo, almofada, garrafa, pet, lager...) juntam mesmo com EAN diferente. Qualquer outra palavra a mais (sem, zero, light, integral, um sabor, lata) separa. Testes: `npm test` em `server/`.

**Mesmo produto? Rótulos e juiz.** O Rafael rotula pares na página "Mesmo produto?" (artifact do Claude); os rótulos ficam em `server/data/rotulos/rotulos.json` e **sempre** valem no agrupamento. Critério: sabor, fragrância ou versão diferente é produto diferente; oferta de encarte "vários sabores" vale para cada sabor incluído. Pares novos para rotular: `node tools/pares-candidatos.mjs [--sem-ean]`. O juiz por IA (`server/judge.mjs`, Gemini grátis com as fotos dos dois produtos e os rótulos como exemplos) só entra se a prova por validação cruzada contra os rótulos der 95% ou mais e for melhor que a regra; o resultado fica em `server/data/extraido/juiz-veredictos.json` (`ativo`, `prova`, `chave`, `erro` com o motivo de cada modelo que falhou). Usa a chave própria `GEMINI_JUIZ_KEY` (outro projeto no AI Studio, cota separada do leitor).

**Comparação justa.** `parsePack` (em `group.mjs`) lê do nome quantas unidades vêm ("36x56g", "350ml c/12", "sacola 50% na segunda", "1,2L + 1,2L"); contagem sem peso/volume ("fralda com 58 unidades") é o próprio produto e não vira caixa. O site compara pelo preço de cada unidade quando as embalagens diferem ("R$ 1,39 cada · R$ 49,90 com 36"). Preço mais de 2,2 vezes distante dos outros fica marcado "preço fora do padrão, confira" e não entra na economia; com só 2 mercados e preços muito distantes, o grupo avisa que um deles pode ser caixa. Nunca se chuta quantidade que o nome não diz.

**Menor preço sem cartão da loja** (`server/price.mjs`): preço de app ou clube com CPF (Meu Assaí, clube Semar, Clube Extra), pix, cooperado e preço por quantidade ("a partir de 3 un.", "leve 5 pague 4", calculado por unidade) viram o preço principal, com o normal riscado e a condição escrita. Preço que exige cartão próprio da loja fica só como observação.
3. O site (`app/`, React + Vite + Tailwind) fica em **https://bate-ofertas.pages.dev** (Cloudflare Pages, projeto `bate-ofertas`, publicado pelo workflow com o segredo `CLOUDFLARE_API_TOKEN`). O endereço antigo do GitHub Pages (branch `gh-pages`) só redireciona para lá; sem o segredo, o workflow volta a publicar o site completo no GitHub Pages. A busca roda no navegador do visitante.

Encartes em imagem: `collectors/baronesa.mjs` e `collectors/assai.mjs` gravam um manifesto (`<mercado>-encartes.json`) com as imagens vigentes, e `server/readers/folheto.mjs` lê cada imagem com IA gratuita com visão (Gemini; reserva OpenRouter): nome, preço, condição ("leve 12 pague 11", "a partir de 3 un.") e a validade impressa. Sem validade, o produto não entra. Cada imagem é lida uma vez só (cache em `server/data/cache`, guardado entre execuções). O relatório da última leitura fica em `server/data/extraido/encartes.leitura.json`. No site não há distinção: encarte e catálogo entram no mesmo comparador (produto de um mercado só aparece sozinho), cada mercado aparece pelo logotipo (`app/public/logos`; Spani como letreiro nas cores da marca, pois o site não publica o arquivo) e o preço leva à oferta original (página do site ou imagem do encarte).

**Tela ("Bate Ofertas", desde 10/11/2026).** Tema escuro em neon pelo modelo do Rafael (`app/public/fundo.webp`, `bate-ofertas.png`). Cada produto mostra uma etiqueta por mercado, da mais barata para a mais cara; no celular as etiquetas ficam lado a lado numa linha que arrasta, e o Carrinho Inteligente fica no topo, fechado num resumo de uma linha (toque abre). No computador o carrinho fica na coluna da direita. Toque no logotipo filtra por aquele mercado.

**Busca** (`app/src/search.ts`, sinônimos em `app/src/synonyms.ts`, testes em `search.test.ts`): ignora acento, caixa e hífen ("cocacola" acha Coca-Cola), entende sinônimos de mercado (refri, sabão em pó/lava roupas, bolacha/biscoito...) e tolera um erro de digitação em palavras de 5 letras ou mais; esses achados só aparecem quando a busca exata acha menos de 5 e vão para o fim.

**Histórico de preço** (`server/historico.mjs`, roda todo dia antes de guardar os dados): para cada oferta, o preço de cada dia, gravado só quando muda, em `server/data/historico/precos.json` (120 dias). O `build-site` divide em 64 pedaços (`app/public/data/hist/N.json`, 30 dias) e o site baixa só o do produto aberto no botão **Histórico**: gráfico do menor preço por dia, "menor preço dos últimos 30 dias" e "caiu/subiu X% em 7 dias". O passado foi preenchido pelos commits diários (`node historico.mjs --desde-git`), a partir de 05/11/2026. A faixa **Baixou esta semana**, na abertura, mostra as ofertas mais baratas que o maior preço delas nos 7 dias anteriores, no mesmo mercado (quedas acima de 60% ficam de fora). Categorias finas (`server/category.mjs`: hortifruti, carnes, laticínios, bebidas, mercearia, limpeza, higiene, outros) pelo departamento de cada site e pelo nome. Ordem: menor preço, maior preço, nome. Favoritos e a lista ficam no navegador (localStorage), sem login.

**Carrinho Inteligente** (`app/src/cart.ts`, testes em `app/src/cart.test.ts`, `npm test` em `app/`): lista com quantidade; o "+" de cada etiqueta põe aquela oferta na lista fixa naquele mercado (`m` no item), e "Pôr na lista (mais barato)" deixa o carrinho escolher; cada item mostra onde comprar; total em cada mercado (quem tem a lista inteira primeiro; "tem 3 de 4" para os outros); melhor compra e economia contra o mais caro; melhor divisão em 2 mercados; "Mandar no WhatsApp" abre o WhatsApp direto (api.whatsapp.com/send?text=) com a lista pronta, agrupada por mercado, com preços e total (`shareText`); link `?lista=id*qtd~...` ainda é aceito; aviso de preço por quantidade ou que vence logo. Preço fora do padrão não entra na conta.

**Disponibilidade.** Produto esgotado na loja não entra: Atacadão pelo `availability` da oferta, Nagumo pelo `available` do produto (na loja 038 Mauá só ~6,3 mil dos ~26 mil do catálogo estão à venda); os outros coletores já filtravam.

Se um coletor falhar ou voltar muito menos produtos que na semana anterior, o `run-all.mjs` mantém os dados antigos.

## Várias cidades e página de venda (Fase 10, 2026-11-14)

- **Seletor "Minha região":** painel com caixinhas (uma ou mais cidades; com "todas" valendo, as caixinhas aparecem todas marcadas e desmarcar uma deixa as outras). Fica no navegador (`bate-cidades`). A lista só mostra Mauá e Ribeirão Pires (filtro fixo em `App.tsx`; cidade nova entra quando houver mercado de verdade). Lógica em `app/src/cities.ts`, tela em `components/CityPicker.tsx`.
- **Último item da lista:** "Quero o Bate Ofertas na minha cidade" abre `bate-ofertas.pages.dev/#/sua-cidade` (página de venda, `app/src/pages/SuaCidade.tsx`, carregada sob demanda). O endereço `/sua-cidade/` é uma página estática só com a prévia de compartilhamento que redireciona para ela.
- **Planos (hipótese de preço; textos e eventos em `pages/sua-cidade/content.ts`):** normal Start R$ 1.490 + R$ 97/mês, Pro R$ 2.990 + R$ 197/mês, Rede a partir de R$ 5.900 + R$ 397/mês. **Promoção por evento:** lista `EVENTS` (hoje Black Friday, 14 a 30/11/2026: Start R$ 790 + 67, Pro R$ 1.490 + 127, Rede a partir de R$ 3.900 + 297); fora do prazo a página volta sozinha aos preços normais. Para outro evento (Natal etc.), acrescentar à lista. Prazo, pagamento e cancelamento ficam "a combinar".
- **Contato:** o formulário não envia nada a servidor; monta a mensagem e abre o WhatsApp (11 94301-6366) ou o e-mail. Número e e-mail em `pages/sua-cidade/contact.ts` (autorizados pelo Rafael a ficar públicos).
- **Anúncios no comparador:** cartão ao lado do carrinho (fechável) e faixa "Sua cidade não está aqui?" no fim da página (`components/CityAd.tsx`).
- **Regra do texto de venda:** só número real dos dados, nada de depoimento ou cliente inventado; mercado parceiro não compra posição no ranking.

## App Android (Fase 11, 2026-11-14)

- **O que é:** o mesmo site empacotado com Capacitor (pasta `android-app/`, `package.json` próprio; o `app/package.json` não é tocado). Pacote `br.com.bateofertas`, versão em `android-app/versao.json`.
- **Funções:** abre em tela cheia, ícone e abertura com o logo novo, preços lidos de `https://bate-ofertas.pages.dev/data/` e guardados no aparelho (abre sem internet com aviso), botão voltar fecha painéis antes de sair, compartilhar a lista pelo menu do Android, links abrem no navegador/WhatsApp. O código nativo fica em `app/src/native.ts` e não faz nada na web.
- **Gerar um APK novo:** subir `versao.json` e rodar `android-app\construir-apk.ps1 -Release` (JDK 21 e SDK em D:erramentas; ver `D:\Projetos Claudepoio\config-claudendroid-no-d.md`). Saída em `android-app\saida\` (`bate-ofertas.apk` assinado, `bate-ofertas.aab` para a Play Store, `-debug.apk`); fora do Git.
- **Chave de assinatura:** `android-app\chavesateofertas.jks` + `keystore.properties`, fora do Git. **Guardar cópia fora desta máquina**: sem ela não dá para atualizar o app instalado nem publicar na Play Store.
- **Fora do escopo:** avisos de queda de preço (precisam de servidor de notificação) e publicação na Play Store (conta US$ 25).
- **Listagem:** etiquetas de cada produto lado a lado com barra de rolagem própria sempre visível (`components/ScrollRow.tsx`).

## Mercados

| Mercado | Fonte | Situação |
|---|---|---|
| Atacadão | API do site (loja de Mauá, CEP 09310-000) + folhetos em PDF das lojas de Mauá (`collectors/atacadao-folheto.mjs`, API pública `api-middleware-flyer-services`, a mesma da página "Nossas lojas"): preço de app e "a partir de 2 caixas" | funcionando (folheto: ~190 itens na 1ª coleta, 22/11) |
| Spani | API do site (loja Mauá 1) + jornal de ofertas em PDF da loja de Mauá, lido pelo texto do PDF (`spani-jornal.mjs`, sem IA) | funcionando |
| Coop | API VTEX do site, loja Barão de Mauá fixa pelo `regionId` (base64 de `SW#coopspbm`; Ribeirão Pires = `coopsprp`) | funcionando |
| Baronesa (Mauá) | Encarte em imagem (`/classes/encarte.php`), lido por IA | funcionando |
| Assaí | Encarte em imagem das lojas Ribeirão Pires e Mauá, lido por IA | funcionando (imagens pelo Worker, ver abaixo) |
| STUK (Ribeirão Pires) | Jornal de ofertas do dia no Instagram, lido por IA (`social.mjs`); o jornal é postado na véspera, então post a partir das 12h vale para o dia seguinte | funcionando |
| Nagumo | JSON do site (Salesforce, `Search-UpdateGrid`) com a loja 038 Mauá fixada, pelo navegador | funcionando (~26 mil produtos) |
| Semar | API OSuper `sense.osuper.com.br/336/1705/v2/search` (loja 06 Mauá), chamada de dentro da página (a Cloudflare só atende navegador); 20 por página, por departamento | funcionando (~9,5 mil) |
| Extra | API GPA `api.vendas.gpa.digital/ex/search/category-page` (100 por página, por departamento; EAN pela página do produto). Desde 19/11/2026 usa a loja online de Ribeirão Pires (loja 5675, `storeId` 1643, R. João Domingues de Oliveira, 194): só entrega (R$ 19,90), sem retirada; Mauá não tem entrega | funcionando (~6,4 mil) |
| Joanin | Tabloide em imagem em `/ofertas/` (`pagN-full-tabloide-*-DDMMAAAA.jpg`), lido por IA | funcionando |
| Dia (Mauá) | O site do Dia não publica ofertas. Entra pelos produtos em destaque do folheto da loja de Mauá na página pública do Tiendeo (`/maua/supermercado-dia`): nome, preço, De/Por e foto, em texto, sem IA. O folheto inteiro fica em `/Catalogos/`, que o robots.txt do Tiendeo proíbe, por isso não é usado | funcionando (~10 destaques) |
| Roldão (Mauá) | Encarte em PDF por campanha em `/ofertas/`; entram as que citam Mauá ou valem para a rede. O PDF vem de `admin-ajax.php?action=elem_get_pdf_oferta_iframe` e o leitor manda o PDF direto ao Gemini (sem foto recortada). Sem loja em Ribeirão Pires | funcionando |
| São Jorge | só folheto | adiado (decisão do Rafael em 13/11/2026) |
| **Farmácias (Fase 14)** | | |
| Drogaria São Paulo | API VTEX pública: catálogo por faixa de preço e simulação de pedido com o CEP 09400110; só entram itens com retirada numa das 4 lojas de Mauá ou 2 de Ribeirão Pires. Receita e genérico pelos campos da ficha | funcionando (~3,8 mil) |
| Farma Conde | API VTEX pública, simulação nas 2 lojas de Mauá (Barão de Mauá 732, Castelo Branco 2365) | funcionando (~6,3 mil) |
| Drogarias Joanin | Tabloide de drogarias do Joanin (`JOANIN_DROGARIAS=1`), lido por IA | funcionando |
| **Comércio de bairro (Fase 14)** | | |
| Tony BRJ Carnes (Vila Assis) | Catálogo OnBeef, API pública `api.onbeefapp.com.br`, sem IA | funcionando (~180) |
| Família Lima, Mercado Capital, Mercadinho Parceiro, Mercado Baratinho, Carnes Santana | Artes de oferta do Instagram (`social.mjs`), lidas por IA; sem data impressa, vale 3 dias após o post. Pré-checagem grátis do perfil antes de gastar crédito do serviço | funcionando |
| Sacolão São Jorge, Consulado do Churrasco | Instagram, em teste (`social-encartes-teste.json`, fora do site) | em teste |

As farmácias são coletadas num workflow à parte (`.github/workflows/farmacias.yml`, 22h47), porque não cabem no tempo da coleta principal; a publicação diária leva os preços ao site. No site: filtro "Farmácia" (remédio e saúde; higiene de farmácia fica em "Higiene" para comparar com os mercados), remédio de receita com o aviso "Venda sob prescrição médica" e fora das ofertas, remédio só se junta com outro pelo EAN.

Fora, de propósito: Ultrafarma, Pague Menos e Pacheco (sem loja em Mauá/RP); Drogasil, Raia, Onofre, Panvel e Araujo (bloqueio Akamai); Joanin online (os termos de uso proíbem copiar preços).

Nem todo mercado informa validade de oferta; quando não informa, o site mostra "validade não informada".

### Imagens do Assaí

O servidor de imagens do Assaí só atende o Brasil e recusa os IPs do GitHub. As imagens passam por um Worker na Cloudflare (`worker-imagens/`, `monitoramento-precos-imagens.consultor-milhas-worker.workers.dev`), fixado perto de São Paulo (`[placement] region = "aws:sa-east-1"`). Ele só aceita imagens `.jpg/.png` do servidor de encartes do Assaí e é usado só quando o download direto dá 403. Publicar de novo: `npx wrangler deploy` dentro de `worker-imagens/`.

## Varredura rápida, coleta em paralelo e leitura por OCR (Fase 15, 2026-11-19)

**Descobrir as fontes de um site em minutos** (sem IA): `node server/recon/kit.mjs tudo <url>` devolve um JSON curto com:
- as APIs que a página chama;
- se o site é VTEX: catálogo, estoque e lojas com retirada perto de um CEP;
- o sitemap;
- os encartes em PDF ou imagem, e se o PDF tem texto;
- os últimos posts do Instagram.

Cada parte também roda sozinha, com os comandos `api`, `vtex`, `sitemap`, `instagram` e `folheto`. O kit segue as regras do projeto: sem login, com pausa entre requisições, e bloqueio só é relatado.

**Varrer vários sites com IAs grátis:** `node server/recon/varrer.mjs server/recon/alvos.json`.
- **O que faz:** roda o kit em 4 sites ao mesmo tempo e entrega cada resultado a um modelo grátis pelo OpenCode (`opencode-cli run`, agente só de leitura). O modelo devolve, em JSON, as fontes, as lacunas e os bloqueios.
- **Tempo e saída:** os 12 sites atuais levam cerca de 4 min. Os resultados ficam em `D:\Temp\varredura-<data>`.
- **Modelos, nesta ordem:**
  1. os modelos grátis do OpenCode: rápidos, mas com limite de uso compartilhado;
  2. o Gemma 4, pela chave do Google configurada no OpenCode: limite de 16 mil tokens por minuto, uma chamada por vez.
- **Uso dos resumos:** servem de triagem. As decisões e o código continuam com o Claude e o Rafael.

**Coleta diária mais rápida:**
- `run-all.mjs` roda 3 coletores ao mesmo tempo, começando pelos mais demorados. Como cada um é de um site diferente, cada site continua recebendo uma requisição por vez.
- No workflow, catálogos e encartes rodam em paralelo, na mesma etapa.
- `PARALLEL=1` volta ao modo antigo, um coletor por vez.

**Encartes: OCR primeiro, Gemini de reserva:**
- **Como funciona:**
  1. `server/readers/ocr.py` (RapidOCR, na CPU) lê o texto e as posições na página.
  2. Um modelo de texto grátis monta os itens. A ordem é: Gemma 4 pela chave do Gemini (cota separada da do Gemini), depois Groq, depois OpenRouter.
  3. Todo preço precisa aparecer no texto do OCR. Se algum não aparecer, a página vai para o Gemini.
- **Resultado na comparação de 19/11:** em 13 páginas, o OCR com o modelo de texto acertou 98,6% dos preços em comum com o Gemini e achou 2 erros dele.
- **Ordem dos leitores:** a variável `READER_MODE` do repositório escolhe entre `ocr-primeiro` (padrão), `gemini-primeiro` e `so-gemini`.
- **Fim da cota:** quando a cota do dia do Gemini acaba em todos os modelos, ele é desligado na hora. Antes, o leitor ficava cerca de 35 min esperando.

**Ferramentas locais (só para varredura e testes, nunca na coleta diária):**
- **PaddleOCR 3.7 com GPU**, em `D:\Projetos Open Code\paddleocr\venv`, com modelos em `D:\Cache\paddlex` (variável `PADDLE_PDX_CACHE_HOME`). Lê cerca de 2 s por página.
- **Ollama** com `qwen3-vl:8b`, em `D:\Ollama\models`.
- **Atenção à placa de vídeo:** em 19/11 a RTX 3060 chegou a 92-94 °C com a ventoinha a 0%. Ela precisa ser conferida antes de uso pesado.

## Melhorias da Fase 16 (2026-11-22)

**Mercados de bairro vazios.** Só o Crawlbase ainda responde para o Instagram (Apify, ScrapeCreators e SocialCrawl estão sem crédito). Ele traz as imagens mas **não traz a data do post**, e sem data a arte sem validade impressa era descartada (Mercadinho Parceiro, STUK e outros ficavam com 0). Agora a data sai do próprio código do post (`collectors/instagram-data.mjs`: o código de `/p/<código>/` guarda a hora da publicação), sem custo, e vale o prazo de 3 dias; post antigo sai. O `social-status.json` passou a guardar, por perfil, quantos posts vieram, quantos eram vídeo e quantos sem imagem (`crawlbasePerfis`), para achar onde se perde um mercado. Achados de 22/11: o Crawlbase devolve 0 posts, de vez em quando, para Família Lima, Mercado Capital, Carnes Santana e Lourencini (agora o coletor tenta uma segunda vez quando vem vazio); a regra do Rafael é ler cada mercado em **todas** as redes sociais em que ele publica, não só no Instagram: o Facebook já está ligado para Nevada, Lourencini, Família Lima e STUK (`MARKETS` em `social.mjs`), mas os serviços pagos de Facebook estão sem crédito e o Crawlbase tem devolvido 0 posts de página; faltam as páginas de Facebook de Mercadinho Parceiro, Mercado Capital, Mercado Baratinho e Carnes Santana (a busca só achou páginas de outras cidades, então o Rafael precisa passar os links); no STUK, 9 de 13 posts recentes são vídeo, que o coletor não lê, e o jornal do dia some quando sai em vídeo.

**Folheto do Atacadão.** `collectors/atacadao-folheto.mjs` consulta as lojas de Mauá na API de folhetos e grava `atacadao-encartes.json` (um item por folheto vigente, cache pela id do folheto). O leitor grava em `atacadao-folheto.json` (campo `arquivo` do manifesto), para não apagar o catálogo `atacadao.json`, e o `build-site` junta os dois arquivos no mesmo mercado "Atacadão". A idade máxima de 48 h vale só para o catálogo. O preço "oferta ativada no APP" vira o principal (só pede CPF); o do app "pagando com cartão" fica como observação. O folheto é o último da fila de leitura, para não tirar a vez dos mercados de bairro. Os 7 PDFs de 22/11: 5 têm texto; um (7 páginas de imagem) só sai por IA; PDF com mais de 4 páginas vai direto ao Gemini, e um deles estourou o tempo uma vez (leitura repetida na rodada seguinte). Itens "a partir de N un." às vezes ficam sem a condição, e o preço "a cada 100g" aparece com essa condição escrita.

**Logos.** `app/public/logos/`: Família Lima, Mercado Capital, Mercado Baratinho, Carnes Santana, Tony BRJ (arquivos enviados pelo Rafael), Drogaria São Paulo (seeklogo), Farma Conde (site da loja) e STUK (imagem de compartilhamento do site). Todos os mercados têm logo em arquivo (o do Mercadinho Parceiro foi enviado pelo Rafael em 22/11). Cada logo tem um fator `k` em `Parts.tsx` (`LOGOS`) que amplia o chip na proporção do formato: logo quadrado ou com letra miúda fica mais alto (até 1,6x), logo largo um pouco mais (1,3x); altura e largura máxima crescem juntas.

## Produtos iguais e Ofertas do Dia (Fase 17, 2026-11-22)

**Agrupamento por nome, v2** (`server/nomes-v2.mjs`, `server/variacao.mjs`, `brandKeys` em `server/group.mjs`; `GROUP_V2=0` volta à regra antiga):
- **Marca:** `brandKeys` agora entende marca no plural ("Trakinas"), com artigo ("Do Valle" = "DoValle") e de várias palavras ("Casa de Mãe"), e resolve marca + submarca ("Nissin Cup Noodles"). Ofertas fora da comparação por falta de marca ou tamanho: Semar 45,7% → 41,2%, Spani 36,3% → 26,4%.
- **Nomes:** para a mesma marca e o mesmo tamanho, as palavras que sobram de cada lado (tolerando abreviação, erro de uma letra, palavra colada e "Lt" = lata) precisam ser todas neutras (lista curada em `NEUTRAS_V2` e `SOFT`); preço até 1,5 vez. Nunca junta se a diferença tem sabor, cor, light/zero, versão ou número (mesmo de um lado só), nem embalagem diferente (lata × garrafa × sachê; decisão do Rafael: lata e sachê de um lado só não são neutros) nem forma diferente (líquido × pó × barra). "Congelado" de um lado só pede preço até 1,2 vez.
- **Ids estáveis:** o carrinho e os favoritos guardam o id do grupo. Quando grupos se juntam, o novo fica com o menor id antigo e `index.json` traz `aliases` (id antigo → novo); o site (`app/src/aliases.ts`) troca os ids guardados no navegador.
- **Medição** (`node server/tools/gabarito.mjs [--salvar=nome]`): gabarito A, pares com código de barras nos dois lados (mesmo EAN = mesmo produto), dividido por marca em treino e teste; gabarito B, os rótulos do Rafael. Teste de EAN, regra antiga → v2: precisão 94,1% → 94,3%, cobertura 33,8% → 46,2% (parte dos "erros" é o mesmo produto com dois EANs, como café vácuo × almofada). Rótulos do Rafael: cobertura 14% → 25% (18 certos, 2 errados em 20 juntadas; amostra pequena). Números de antes em `server/data/rotulos/gabarito-baseline.json`, os de agora em `gabarito-v2.json`.
- **Resultado no site:** ofertas em grupo de 2+ mercados (fora farmácia): Nagumo 22% → 26%, Semar 17% → 20%, Assaí 14% → 17%, Atacadão 48% → 50%, Extra 40% → 42%. O resto depende de o produto existir nos dois mercados.
- **Conferência:** `node server/tools/conferir-v2.mjs` monta 30 pares que a v2 junta e 20 que recusa (a maioria com Nagumo, Semar ou encartes); a página gerada vai para o artefato https://claude.ai/artifact/1xS2ttcohaF8Yyfd7g7PRU. As respostas do Rafael viram rótulos novos em `rotulos.json` (valem sempre).
- **Cota do juiz e como não ficar limitado** (23/11/2026, consenso com o revisor Gemini): o plano grátis do Gemini dá **20 pedidos por dia por modelo e por projeto do AI Studio**; um pedido leva 20 pares (até 40 fotos). O juiz usa 2 modelos, ou seja, até 800 pares por dia por projeto. Ele estava parado porque rodava em toda coleta, inclusive nas disparadas por push (mais de 8 por dia), e a cota acabava antes da rodada agendada. Agora o passo do juiz só roda na coleta agendada (01h17) ou manual. Cada chave extra (`GEMINI_JUIZ_KEY_2`, `GEMINI_JUIZ_KEY_3`, projetos novos do AI Studio) soma a cota de mais um projeto; a chave do leitor fica por último. Erro 503 repetido troca de chave; prova abandonada (20% ou mais sem resposta por cota ou instabilidade) deixa o estado anterior. Par em que nenhum lado tem foto utilizável (Semar bloqueia foto fora do navegador) não gasta cota de visão. **Descartado:** OCR de foto de embalagem (lento e ruidoso), colagem de fotos, Cloudflare Workers AI e NVIDIA NIM (cota pequena e termos), deduzir "diferente" por transitividade. **Só depois, se faltar:** Mistral Pixtral como segundo fornecedor, com prova própria. O Antigravity (`agy`) lê imagem bem, mas só roda no PC do Rafael: fica só como revisor de decisões, nunca no pipeline.
- **Cadeia de provedores de visão do juiz** (23/11/2026): Gemini (cota por projeto, ver acima) → **OpenRouter** (`OPENROUTER_API_KEY`, que já existia; modelos `:free` com visão, padrão `google/gemma-4-31b-it:free` e `nvidia/nemotron-3.5-super-vl:free`, lista em `JUIZ_OR_MODELS`) → **OpenCode Zen** (`OPENCODE_API_KEY`, conta grátis em opencode.ai; padrão `mimo-v2.6-flash-free`, `deepseek-v4.1-flash-free`, `nemotron-3.5-super-vl-free`, lista em `JUIZ_ZEN_MODELS`) → Groq (só texto). Os dois do meio usam a mesma função (`askCompat`, formato OpenAI, 8 pares por pedido). **Nenhum entra sem prova:** 60 pares rotulados pelo Rafael que têm foto, acertar 95% ou mais e mais que a regra; resultado em `state.provas` de `juiz-veredictos.json`. A prova roda uma vez no começo (cerca de 8 pedidos) e de novo só quando mudam rótulos, regras ou modelos; 20% ou mais sem resposta abandona a prova sem desligar nada. Testado com servidor de mentira (Gemini sem cota → OpenRouter aprovado → julga; modelo que erra é reprovado; cota diária encerra limpo). **Fila real em 23/11: 21.851 pares sem veredito** (11.869 sem palavra de variante).
- **OpenCode, fatos de 23/11/2026:** o catálogo `models.dev` lista dezenas de modelos `*-free` na API `https://opencode.ai/inference/openai/v1`, vários com imagem (mimo-v2.6-flash-free e mimo-v2.5-free: texto, imagem, áudio e vídeo; deepseek-v4.1-flash-free, nemotron-3.5-super-vl-free, hy4-flash-free, longcat-2.5-free, minimax-m3.1-flash-free, kimi-k2.5-free, qwen3.6-plus-free e outros). **Sem chave de conta (usando "public") o limite grátis estava esgotado** (429 `FreeUsageLimitError`, volta em ~22 h) e alguns modelos davam "indisponível". Antes de depender dele: criar a conta, pôr `OPENCODE_API_KEY` no repositório e ver o resultado da prova.
- **Juiz de IA** (`judge.mjs`): a fila agora vai dos pares mais prováveis (sem palavra de variante na diferença, nomes parecidos, preço próximo) aos menos. Atenção: dos 3.865 pares em `juiz-veredictos.json`, só 20 foram julgados por IA (16 "mesmo"); os outros 3.845 foram barrados pela trava de variação, sem IA. A cota grátis do dia acaba cedo.

**Ofertas do Dia** (`app/src/offers.ts`, testado em `offers.test.ts`): escolhe por tipo de produto (mercearia, frescos, laticínios e bebidas, higiene, limpeza, farmácia, outros), uma de cada tipo por rodada, até 8 por mercado; farmácia no máximo 4 de 20 e com desconto de até 40% (o "de" de farmácia é preço de tabela). Preço de app (sem cartão) conta como oferta.

## Ficha por produto (Fase 18, 2026-11-23)

O Rafael respondeu 60 pares da fila do juiz e 59 eram o mesmo produto: a regra de nomes era cautelosa demais e o juiz par a par (com fotos) levaria de 8 a 15 dias para zerar a fila. A troca, vinda de uma pesquisa do Rafael sobre resolução de entidades, foi **ler cada produto uma vez em vez de cada par**: a fila tem ~25 mil pares, mas só ~14,5 mil nomes.

- **Palavras acessórias (18.1, `nomes-v2.mjs`):** aerosol, neutro, doce, clareador, refil, vácuo, almofada, torrado, moído e outras das respostas de 23/11 não separam mais; "ao/na/no" saíram da comparação (`STOP` em `group.mjs`). **"Lata" de um lado só junta só em bebida** e quando o outro lado não cita embalagem (Monster, Stella, Pitú); fora de bebida continua separando (Nescau 370g x Nescau lata 370g, porque existe sachê do mesmo peso). Medição: rótulos do Rafael 95,6% / 28% → 97,3% / 46% (precisão / cobertura).
- **Leitor de fichas (18.2, `fichas.mjs`):** para cada nome, uma IA só de texto devolve marca, produto, linha, versão e sabor/aroma, em lotes de 25 a 40 nomes com id. **Tamanho e unidades não vêm da IA** (continuam com `parseSize`/`parsePack`). Cache em `server/data/extraido/fichas.json` (chave: nome sem acento e minúsculo), gravado a cada lote. Provedores: Gemini **Flash-Lite** (`gemini-flash-lite-latest`, `gemini-3.5-flash-lite`; cota própria por modelo, não disputa com o juiz, que usa o Flash), depois Groq e OpenRouter. Sobrecarga (503) alterna de provedor e volta depois; só cota do dia esgotada descarta. Nos modelos 3.x o "não pensar" é `thinkingLevel: 'minimal'` (`thinkingBudget: 0` dá erro 400). Passo "Fichas dos produtos" no workflow, só na coleta agendada ou manual; primeiro os nomes da fila (`tools/fila-provavel.mjs 0 --nomes`).
- **Regra campo a campo (18.3, `fichas-regra.mjs`, testes em `fichas.test.mjs`):** mesmo produto quando nada conflita. Separa: sabor/versão que os dois nomes dizem e são outros (`conflitoDeRegra`), palavra de variante conhecida de um lado só, linha diferente dita pelos dois lados (Clear Men x Sports Men), versão de verdade de um lado só (light, zero, integral...), sabor diferente dos dois lados, e "Original" de um lado com sabor do outro (Pinho Sol Original x Lavanda). Não separa: versão descritiva de um lado só ("longa vida" x "UHT") nem sabor de um lado só fora da lista de variantes (Hot Pocket X-Burguer x X-Burguer Barbecue). Palavras próprias **dos dois lados** (Espaguete Furado x Conchinha) vão para o juiz com fotos.
- **No site (18.4):** os "mesmo" da ficha entram como vereditos em `build-site.mjs`, abaixo do juiz e dos rótulos do Rafael. Ligado em 23/11 depois da medição (`GROUP_FICHA: '1'` no env do job; `'0'` desliga). O juiz já pula os pares que a ficha marca como conflito claro.
- **Descartado da pesquisa:** embeddings (testados em 8/11, confundiam marcas; com a ficha a comparação é campo a campo), reranker (o juiz com fotos faz esse papel) e a API Cosmos (paga).
- **Medição em 23/11 (1.348 fichas):** rótulos do Rafael (279 pares) 97,8% de precisão e 74% de cobertura, contra 94,6% e 20% da regra de nomes; amostra de EAN (597 pares) 98,8% e 53%, contra 98,1% e 36%. Sabor ou linha de um lado só, sabor contido no outro e palavras como "com ovos" vão para o juiz com fotos.

## Configuração (uma vez)

**Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`.**

Leitor de encartes: crie uma chave gratuita no [Google AI Studio](https://aistudio.google.com/apikey) e guarde como segredo do repositório (`GEMINI_API_KEY`; reserva opcional `OPENROUTER_API_KEY`). O juiz de produtos iguais usa outra chave, criada num **projeto diferente** do AI Studio (a cota grátis é por projeto): `GEMINI_JUIZ_KEY`. A chave fica só no GitHub e nunca vai para o código nem para o site.

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
