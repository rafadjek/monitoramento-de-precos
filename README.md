# Monitoramento de Preços — Mauá e Ribeirão Pires

Site que reúne os preços de **alimentícios, higiene e limpeza** dos mercados da região, com busca e filtros. Qualquer pessoa usa pelo navegador; não precisa instalar nada.

Os preços são lidos dos sites e folhetos dos próprios mercados e **podem mudar**. Confirme na loja antes de ir.

## Como funciona

Tudo roda no GitHub, sem servidor e sem depender de nenhum computador pessoal:

1. **GitHub Actions** roda todo dia às 06h. Às quartas (e quando chamado à mão) executa os coletores de catálogo em `server/collectors/`; todo dia lê os encartes em imagem.
2. `server/build-site.mjs` junta os dados, agrupa o mesmo produto de mercados diferentes (`server/group.mjs`) e gera arquivos estáticos. O agrupamento usa primeiro o código de barras (EAN), que os dois mercados publicam: Spani no campo `codigo_barras` da API, Atacadão pela API pública de catálogo da VTEX (`collectors/atacadao-ean.mjs`, lotes de 50). A regra por nome só junta quando nenhum EAN contradiz. Testes: `node --test group.test.mjs` em `server/`.
3. O site (`app/`, React + Vite + Tailwind) é publicado na branch `gh-pages`, servida pelo **GitHub Pages**. A busca roda no navegador do visitante.

Encartes em imagem: `collectors/baronesa.mjs` e `collectors/assai.mjs` gravam um manifesto (`<mercado>-encartes.json`) com as imagens vigentes, e `server/readers/folheto.mjs` lê cada imagem com IA gratuita com visão (Gemini; reserva OpenRouter): nome, preço, condição ("leve 12 pague 11", "a partir de 3 un.") e a validade impressa. Sem validade, o produto não entra. Cada imagem é lida uma vez só (cache em `server/data/cache`, guardado entre execuções). O relatório da última leitura fica em `server/data/extraido/encartes.leitura.json`. No site, produto de encarte tem o selo "encarte" e o link "ver no encarte".

Se um coletor falhar ou voltar muito menos produtos que na semana anterior, o `run-all.mjs` mantém os dados antigos.

## Mercados

| Mercado | Fonte | Situação |
|---|---|---|
| Atacadão | API do site (loja de Mauá, CEP 09310-000) | funcionando |
| Spani | API do site (loja Mauá 1) | funcionando |
| Coop | API VTEX do site, loja Barão de Mauá fixa pelo `regionId` (base64 de `SW#coopspbm`; Ribeirão Pires = `coopsprp`) | funcionando |
| Baronesa (Mauá) | Encarte em imagem (`/classes/encarte.php`), lido por IA | funcionando |
| Assaí | Encarte em imagem das lojas Ribeirão Pires e Mauá, lido por IA | ver situação abaixo |
| STUK (Ribeirão Pires) | Ofertas só no Instagram e WhatsApp | só link no rodapé do site |
| Nagumo | HTML das categorias | em desenvolvimento |
| Semar | API do site | bloqueada pela Cloudflare |
| Roldão, São Jorge | só folheto | a fazer |

Nem todo mercado informa validade de oferta; quando não informa, o site mostra "validade não informada".

## Configuração (uma vez)

**Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`.**

Leitor de encartes: crie uma chave gratuita no [Google AI Studio](https://aistudio.google.com/apikey) e guarde como segredo do repositório (`GEMINI_API_KEY`; reserva opcional `OPENROUTER_API_KEY`). A chave fica só no GitHub e nunca vai para o código nem para o site.

## Rodar no computador

```bash
npm install --prefix server && npm install --prefix app
node server/build-site.mjs          # monta app/public/data a partir de server/data/extraido
npm run dev --prefix app            # abre em http://localhost:5173
```

Para coletar de novo localmente: `node server/run-all.mjs` (precisa de Google Chrome; use `CHROME_PATH` se não estiver no caminho padrão).

## Acrescentar um mercado

Crie `server/collectors/<mercado>.mjs` que grave `server/data/extraido/<mercado>.json` com os campos de `server/build-site.mjs` (`market`, `externalId`, `name`, `price`, `category`, `imageUrl`, `productUrl`, `validUntil`, `collectedAt`...) e inclua o nome em `COLLECTORS` no `run-all.mjs`. Para folheto em imagem, basta um manifesto como `server/data/extraido/assai-encartes.json` e rodar o leitor.

## Boas práticas e limites

- Pausa de pelo menos 1 segundo entre requisições, sem login e sem contornar bloqueios (captcha, Cloudflare, Incapsula). Mercado que bloqueia fica de fora.
- Os dados vêm de páginas públicas dos mercados. Se você é de um desses mercados e quer o seu conteúdo fora do site, abra uma issue.
