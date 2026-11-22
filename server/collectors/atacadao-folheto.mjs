// Folhetos do Atacadão (a mesma API pública que a página "Nossas lojas" do site usa):
//   Store/city?uf=SP&city=Mauá  -> lojas da cidade, cada uma com a lista de folhetos vigentes (id, validade, PDF).
// Os folhetos trazem 3 preços por produto: varejo/atacado, "oferta ativada no APP" (só pede CPF no app) e "no APP
// pagando com cartão Atacadão/Carrefour/Sam's". O leitor (readers/folheto.mjs) já separa: o do app vira o preço
// principal e o de cartão fica só como observação (price.mjs).
// Sem login, uma consulta de lojas e uma página por folheto, com pausa. Grava data/extraido/atacadao-encartes.json.
// A leitura sai em atacadao-folheto.json (campo "arquivo"), para não apagar o catálogo atacadao.json;
// o build-site junta os dois no mesmo mercado "Atacadão".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../data/extraido/atacadao-encartes.json', import.meta.url));
const API = 'https://apigw.cloud.carrefour.com.br/api-middleware-flyer-services/api/v2';
const SITE = 'https://www.atacadao.com.br/institucional/nossas-lojas';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CIDADE = process.env.ATACADAO_FOLHETO_CIDADE || 'Mauá'; // o catálogo usa a loja de Mauá (CEP 09310-000)

// "2026-11-22T00:00:00Z" -> fim desse dia em Brasília (23:59:59 BRT = 02:59:59Z do dia seguinte)
export const fimDoDia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1, 2, 59, 59)).toISOString() : null;
};
export const inicioDoDia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 3)).toISOString() : null;
};

// Junta os folhetos de todas as lojas da cidade: um por id, lembrando em quais lojas vale.
export function juntarFolhetos(lojas, agora = new Date()) {
  const porId = new Map();
  for (const loja of lojas) {
    for (const f of loja.flyers ?? []) {
      if (!f?.id || !f.urlFinalDocument) continue;
      const until = fimDoDia(f.validity?.final);
      if (!until || Date.parse(until) < agora) continue; // vencido ou sem validade: não entra
      const cur = porId.get(f.id) ?? { id: f.id, url: f.urlFinalDocument, from: inicioDoDia(f.validity?.initial), until, lojas: [] };
      cur.lojas.push(loja.loja);
      porId.set(f.id, cur);
    }
  }
  return [...porId.values()];
}

export function montarManifesto(folhetos, agora = new Date()) {
  return folhetos.map((f) => ({
    market: 'Atacadão',
    arquivo: 'atacadao-folheto',
    offerId: f.id,
    validFrom: f.from,
    validUntil: f.until,
    validityNote: 'folheto do Atacadão',
    stores: f.lojas,
    storeScope: `Folheto das lojas de ${CIDADE}: ${f.lojas.join(', ')}`,
    referer: SITE,
    images: [f.url],
    imageKeys: [`atacadao:${f.id}`], // o endereço pode mudar; o id do folheto é a chave do cache de leitura
    collectedAt: agora.toISOString(),
  }));
}

async function main() {
  const lojas = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`${API}/Store/city?uf=SP&city=${encodeURIComponent(CIDADE)}&PageSize=24&pageNumber=${page}&api-version=2`, {
      headers: { 'User-Agent': UA, Referer: SITE }, signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw new Error(`atacadao-folheto: HTTP ${r.status}`);
    const j = await r.json();
    lojas.push(...(j.stores ?? []).filter((s) => s.cidade === CIDADE));
    if (page >= (j.totalPages ?? 1)) break;
    await new Promise((res) => setTimeout(res, 1200));
  }
  const folhetos = juntarFolhetos(lojas);
  if (!folhetos.length) { console.error(`atacadao-folheto: nenhum folheto vigente em ${CIDADE} (${lojas.length} lojas)`); process.exit(1); }
  for (const f of folhetos) console.log(`folheto ${f.id.slice(0, 8)}… até ${f.until.slice(0, 10)} (${f.lojas.join(', ')})`);
  fs.writeFileSync(OUT, JSON.stringify(montarManifesto(folhetos), null, 2));
  console.log(`atacadao-folheto: ${folhetos.length} folhetos`);
}
// só roda quando chamado direto (o teste importa as funções acima)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
