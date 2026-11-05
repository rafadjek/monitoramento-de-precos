# Monitoramento de Preços

Site público de preços de mercados de Mauá e Ribeirão Pires (alimentícios, higiene, limpeza). Perfil: site-app.

## Arquitetura
- `server/collectors/<mercado>.mjs`: coleta cada mercado e grava `server/data/extraido/<mercado>.json` (formato em `server/build-site.mjs`).
- `server/readers/folheto.mjs`: lê folhetos em imagem com IA de visão gratuita (Gemini; reserva OpenRouter).
- `server/run-all.mjs`: roda os coletores e mantém os dados antigos se um falhar.
- `server/build-site.mjs`: gera `app/public/data` e as miniaturas.
- `app/`: React + Vite + Tailwind, estático, busca no navegador.
- `.github/workflows/atualizar.yml`: quartas, coleta, leitura, publica no GitHub Pages.

## Regras
- Sem servidor nem banco em produção. Nada pode depender de um computador pessoal.
- Segredos só como GitHub Secrets (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`); nunca no código.
- Coleta educada: pausa de 1 s ou mais, sem login, sem burlar bloqueio. Mercado que bloqueia fica de fora.
- Nunca inventar dado: sem nome ou preço válido, o item não entra.
