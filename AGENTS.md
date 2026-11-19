# Monitoramento de Preços

Site público de preços de mercados, farmácias e comércio de bairro de Mauá e Ribeirão Pires (alimentícios, higiene, limpeza, farmácia). Perfil: site-app.

## Arquitetura
- `server/collectors/<mercado>.mjs`: coleta cada mercado e grava `server/data/extraido/<mercado>.json` (formato em `server/build-site.mjs`).
- `server/readers/folheto.mjs`: leitor de encartes: OCR local primeiro (`readers/ocr.py`, RapidOCR na CPU; modelo de texto grátis monta os itens: Gemma 4, Groq, OpenRouter; `readers/ocr-leitor.mjs` confere cada preço contra o OCR) e, se a conferência falhar, IA de visão gratuita (Gemini; reserva OpenRouter). `READER_MODE`: `ocr-primeiro` (padrão), `gemini-primeiro`, `so-gemini`; `OCR_PYTHON` aponta o Python. O leitor usado e o motivo de ir ao Gemini ficam no cache e em `encartes.leitura.json`. Lê os manifestos `<mercado>-encartes.json` gerados por `collectors/assai.mjs` e `collectors/baronesa.mjs`; validade vem do manifesto ou é lida na própria imagem; sem validade, o produto não entra. Cache por URL em `server/data/cache` (guardado entre execuções pelo actions/cache). Relatório da última leitura em `data/extraido/encartes.leitura.json`.
- Mercados: Atacadão (Mauá Itapark), Spani (Mauá), Coop (Barão de Mauá), Nagumo (038 Mauá), Semar (06 Mauá) e Extra (loja online de Ribeirão Pires, só entrega) por catálogo do site; Baronesa (Mauá), Assaí (Ribeirão Pires e Mauá) e Joanin por encarte/tabloide; STUK e Dia só como cartão (ofertas só no Instagram/WhatsApp e no app ClubDIA).
- Comparação: preço por unidade em caixa/fardo (`parsePack`), preço fora do padrão (>2,2x) marcado e fora da economia, menor preço sem cartão da loja (`price.mjs`). Nunca chutar quantidade que o nome não diz.
- Farmácias (Fase 14): Drogaria São Paulo e Farma Conde (VTEX, só itens com retirada em loja de Mauá/RP; campos `segment: 'farmacia'`, `rx`, `generic`), coletadas em `.github/workflows/farmacias.yml`. Comércio de bairro (`segment: 'bairro'`): Tony BRJ Carnes (`tonybrj.mjs`) e lojas do Instagram em `social.mjs`. Remédio agrupa só por EAN; farmácia fica fora do juiz.
- `server/run-all.mjs`: roda os coletores (3 por vez, sites diferentes; `PARALLEL=1` = um por vez) e mantém os dados antigos se um falhar.
- `server/recon/kit.mjs` (descobrir fontes de um site sem IA: `api`, `vtex`, `sitemap`, `instagram`, `folheto`, `tudo`) e `server/recon/varrer.mjs` (kit em vários sites + resumo por modelo grátis via OpenCode). Use antes de abrir páginas à mão ao procurar fonte nova.
- `server/build-site.mjs`: gera `app/public/data` e as miniaturas.
- `server/group.mjs` + `server/ean.mjs`: agrupa o mesmo produto entre mercados. EAN primeiro (descarta código interno de loja, prefixo 2, e EAN com tamanho e preço muito diferentes); regra por nome só sem EAN em conflito. Embeddings grátis do Cloudflare Workers AI foram testados em 2026-11-08 e descartados: confundem marcas e o EAN já cobre ~96% dos produtos.
- `app/`: React + Vite + Tailwind, estático, busca no navegador.
- `.github/workflows/atualizar.yml`: todo dia às 01h17 (Brasília) coleta os catálogos e lê os encartes, confere uma amostra de preços com as lojas (`tools/conferir-precos.mjs`) e publica no Cloudflare Pages.

## Regras
- Sem servidor nem banco em produção. Nada pode depender de um computador pessoal.
- Segredos só como GitHub Secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`); nunca no código.
- Coleta educada: pausa de 1 s ou mais, sem login, sem burlar bloqueio. Mercado que bloqueia fica de fora.
- Nunca inventar dado: sem nome ou preço válido, o item não entra.
