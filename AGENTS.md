# Monitoramento de Preços

Site público de preços de mercados de Mauá e Ribeirão Pires (alimentícios, higiene, limpeza). Perfil: site-app.

## Arquitetura
- `server/collectors/<mercado>.mjs`: coleta cada mercado e grava `server/data/extraido/<mercado>.json` (formato em `server/build-site.mjs`).
- `server/readers/folheto.mjs`: leitor de encartes em imagem com IA de visão gratuita (Gemini; reserva OpenRouter). Lê os manifestos `<mercado>-encartes.json` gerados por `collectors/assai.mjs` e `collectors/baronesa.mjs`; validade vem do manifesto ou é lida na própria imagem; sem validade, o produto não entra. Cache por URL em `server/data/cache` (guardado entre execuções pelo actions/cache). Relatório da última leitura em `data/extraido/encartes.leitura.json`.
- Mercados: Atacadão (Mauá Itapark), Spani (Mauá), Coop (Barão de Mauá) por catálogo do site; Baronesa (Mauá) e Assaí (Ribeirão Pires e Mauá) por encarte; STUK só como link (ofertas apenas no Instagram/WhatsApp).
- `server/run-all.mjs`: roda os coletores e mantém os dados antigos se um falhar.
- `server/build-site.mjs`: gera `app/public/data` e as miniaturas.
- `server/group.mjs` + `server/ean.mjs`: agrupa o mesmo produto entre mercados. EAN primeiro (descarta código interno de loja, prefixo 2, e EAN com tamanho e preço muito diferentes); regra por nome só sem EAN em conflito. Embeddings grátis do Cloudflare Workers AI foram testados em 2026-11-08 e descartados: confundem marcas e o EAN já cobre ~96% dos produtos.
- `app/`: React + Vite + Tailwind, estático, busca no navegador.
- `.github/workflows/atualizar.yml`: todo dia às 06h lê os encartes; às quartas (e no disparo manual) também coleta os catálogos; publica no GitHub Pages.

## Regras
- Sem servidor nem banco em produção. Nada pode depender de um computador pessoal.
- Segredos só como GitHub Secrets (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`); nunca no código.
- Coleta educada: pausa de 1 s ou mais, sem login, sem burlar bloqueio. Mercado que bloqueia fica de fora.
- Nunca inventar dado: sem nome ou preço válido, o item não entra.
