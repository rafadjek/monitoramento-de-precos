// Fase 18.3: "mesmo produto?" campo a campo, com a ficha de cada nome (fichas.mjs) e as travas de nome que já existiam.
// Só olha pares de mercados diferentes com a mesma marca e o mesmo tamanho (os candidatos do juiz). Resposta:
//   true      = mesmo produto (vira veredito no site, abaixo dos rótulos do Rafael e do juiz);
//   false     = diferente por conflito claro (linha, versão ou sabor que os dois lados dizem e são outros);
//   undefined = zona cinzenta: fica para o juiz com fotos.
// Na dúvida, não junta. Tamanho e unidades vêm de signature()/parseSize, nunca da IA.
import { signature, brandKeys, pairKey, SOFT } from './group.mjs';
import { conflitoDeRegra } from './variacao.mjs';
import { diferenca, parecida, VARIANTES, NEUTRAS_V2 } from './nomes-v2.mjs';
import { normalizeEan } from './ean.mjs';
import { chaveNome } from './fichas.mjs';

const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'para', 'a', 'o', 'ao', 'na', 'no']);
// versões que só repetem o padrão do produto: não contam como diferença
const VERSAO_NEUTRA = new Set(['original', 'tradicional', 'classico', 'classica', 'regular', 'em po', 'po', 'normal', 'comum', 'nacional', 'premium', 'com gas', 'liquido', 'liquida']);
const palavras = (s) => String(s || '').split(/[^a-z0-9]+/).filter((w) => w && !VAZIAS.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
const junto = (s) => String(s || '').replace(/[^a-z0-9]/g, '');
// dois textos dizem a mesma coisa? (igual sem espaços, ou as mesmas palavras tolerando abreviação e erro de uma letra)
function mesmoTexto(x, y) {
  const a = palavras(x), b = palavras(y);
  if (a.join('') === b.join('')) return true; // "para micro-ondas" x "de microondas"
  if (!a.length || !b.length || a.length !== b.length) return false;
  const resto = [...b];
  for (const w of a) { const k = resto.findIndex((u) => parecida(w, u)); if (k < 0) return false; resto.splice(k, 1); }
  return true;
}
const itensVersao = (v) => String(v || '').split(/\s*[,;/]\s*|\s+e\s+/).map((x) => x.trim()).filter((x) => x && !VERSAO_NEUTRA.has(x));
// as palavras de um estão todas no outro ("zero" e "zero acucar", "lavanda" e "lavanda oriental")
const contem = (x, y) => { const a = palavras(x), b = palavras(y); const [p, g] = a.length <= b.length ? [a, b] : [b, a]; return p.length > 0 && p.every((w) => g.some((u) => parecida(w, u))); };
const marcaCompativel =(a, b) => !a || !b || junto(a) === junto(b) || junto(a).includes(junto(b)) || junto(b).includes(junto(a));
const produtoCompativel = (a, b) => {
  if (!a || !b) return true;
  const pa = palavras(a), pb = palavras(b);
  return pa.some((w) => w.length >= 4 && pb.some((u) => parecida(w, u)));
};

/**
 * @param {{name:string, price:number}} oa oferta A   @param {{name:string, price:number}} ob oferta B
 * @param {object} fa ficha de A   @param {object} fb ficha de B
 */
export function decidirPorFicha(oa, ob, fa, fb) {
  if (!fa || !fb) return undefined;
  if (conflitoDeRegra(oa.name, ob.name)) return false; // sabor/versão que os dois nomes dizem e são outros
  const pa = oa.price, pb = ob.price;
  if (pa > 0 && pb > 0 && Math.max(pa, pb) / Math.min(pa, pb) > 1.5) return undefined;
  if (!marcaCompativel(fa.marca, fb.marca)) return false;
  // trava de nome: palavra de variante conhecida (sabor da lista, cor, light/zero, número de versão) de um lado só
  const sa = signature(oa), sb = signature(ob);
  const { a, b } = diferenca(sa.core, sb.core);
  if (a.concat(b).some((t) => VARIANTES.has(t) || (/^\d+$/.test(t) && t !== '1'))) return false;
  // linha: se os dois dizem, tem de ser a mesma (Clear Men x Clear Sports Men); um lado calado não separa
  if (fa.linha && fb.linha && !mesmoTexto(fa.linha, fb.linha)) return false;
  // versão: só separa a que é variante de verdade (light, zero, integral, sem lactose...) dita de um lado e não do outro;
  // versão descritiva de um lado só ("longa vida" x "uht", "para micro-ondas", "concentrado") não separa (respostas de 23/11)
  const va = itensVersao(fa.versao), vb = itensVersao(fb.versao);
  const soA = va.filter((x) => !vb.some((y) => mesmoTexto(x, y) || contem(x, y))), soB = vb.filter((y) => !va.some((x) => mesmoTexto(x, y) || contem(x, y)));
  if (soA.concat(soB).some((x) => palavras(x).some((w) => VARIANTES.has(w)))) return false;
  // sabor/aroma: se os dois dizem, tem de ser o mesmo; um lado calado não separa (Hot Pocket X-Burguer x X-Burguer Barbecue)
  if (fa.sabor && fb.sabor && !mesmoTexto(fa.sabor, fb.sabor) && !contem(fa.sabor, fb.sabor)) return false;
  if (!produtoCompativel(fa.produto, fb.produto)) return undefined;
  // palavras próprias dos DOIS lados (Espaguete Furado x Conchinha, Caseiro x Italiano): o juiz com fotos decide.
  // Palavra a mais de um lado só é embalagem ou descrição (quase todos os "mesmo" do Rafael em 23/11).
  const marcas = new Set(palavras(`${fa.marca} ${fb.marca}`));
  const propria = (t) => t.length >= 3 && !SOFT.has(t) && !NEUTRAS_V2.has(t) && !marcas.has(t) && !/^\d/.test(t);
  if (a.some(propria) && b.some(propria)) return undefined;
  if (a.concat(b).includes('po')) return undefined; // "solúvel" x "solúvel em pó" (rótulo do Rafael: diferente)
  return true;
}

/**
 * Pares candidatos: mercados diferentes, mesma marca e mesmo tamanho, preço até 1,5x, pelo menos um lado sem EAN
 * (com EAN dos dois lados o código já decide). É o mesmo critério da fila do juiz (judge.mjs).
 */
export function paresCandidatos(offers, sigs = offers.map(signature), brands = brandKeys(offers)) {
  const eans = offers.map((o) => normalizeEan(o.ean));
  const baldes = new Map();
  sigs.forEach((s, i) => { const b = brands[i]; if (!s.size || !b || offers[i].segment === 'farmacia') return; const k = s.size + '|' + b; (baldes.get(k) ?? baldes.set(k, []).get(k)).push(i); });
  const out = [];
  for (const idx of baldes.values()) {
    if (idx.length > 80) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = idx[x], b = idx[y];
      if (offers[a].market === offers[b].market || (eans[a] && eans[b])) continue;
      const pa = offers[a].price, pb = offers[b].price;
      if (pa > 0 && pb > 0 && Math.max(pa, pb) / Math.min(pa, pb) > 1.5) continue;
      out.push([a, b]);
    }
  }
  return out;
}

/** Vereditos da ficha para todos os candidatos: Map(pairKey -> true|false). Zona cinzenta fica de fora. */
export function vereditosPorFicha(offers, fichas) {
  const sigs = offers.map(signature), brands = brandKeys(offers);
  const out = new Map();
  const f = (o) => fichas[chaveNome(o.name)];
  for (const [a, b] of paresCandidatos(offers, sigs, brands)) {
    const v = decidirPorFicha(offers[a], offers[b], f(offers[a]), f(offers[b]));
    if (v !== undefined) out.set(pairKey(offers[a], offers[b]), v);
  }
  return out;
}
