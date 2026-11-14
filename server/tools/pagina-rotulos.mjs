// Monta a página de rotulagem (pares "mesmo produto?") a partir de data/rotulos/candidatos.json.
// As fotos vão embutidas (a página publicada não carrega imagem de outros sites). Saída: data/rotulos/rotulos.html
// Uso: node tools/pagina-rotulos.mjs [--entrada=arquivo.json] [--saida=arquivo.html] [--titulo=texto]
// Par com "atual" (revisão): a página mostra o rótulo de antes e a resposta do juiz.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/rotulos');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) || d;
const pairs = JSON.parse(fs.readFileSync(path.resolve(DIR, arg('entrada', 'candidatos.json')), 'utf8'));
const TITLE = arg('titulo', 'Mesmo produto?');
const LEAD = pairs.some((p) => p.atual)
  ? 'Nestes pares o juiz discordou de você. Confira cada um pelo seu critério (sabor, fragrância ou versão diferente = produto diferente) e marque de novo: pode manter ou trocar.'
  : 'Para cada par, diga se é o mesmo produto (dá para comparar o preço) ou se é outro produto. Suas respostas ensinam o Bate Ofertas a juntar certo.';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function thumb(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = await sharp(Buffer.from(await r.arrayBuffer())).resize(112, 112, { fit: 'contain', background: '#ffffff' }).webp({ quality: 60 }).toBuffer();
    return 'data:image/webp;base64,' + buf.toString('base64');
  } catch { return null; }
}
let ok = 0;
for (const p of pairs) {
  for (const k of ['a', 'b']) { p[k].thumb = await thumb(p[k].image); if (p[k].thumb) ok++; delete p[k].image; }
}
console.log(`fotos: ${ok} de ${pairs.length * 2}`);

const data = JSON.stringify(pairs).replace(/</g, '\\u003c');
const html = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Public+Sans:wght@400;600;700&display=swap">
<style>
/* layout: uma coluna de cartões de comparação, com barra fixa de progresso no topo */
:root{--bg:#f3f5fa;--card:#ffffff;--fg:#121a2e;--muted:#5c6886;--line:#d9dfec;--same:#11994c;--diff:#d23242;--skip:#8a6d00;--accent:#2f6fe0;
--display:"Barlow Condensed","Arial Narrow",sans-serif;--body:"Public Sans",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#070c1b;--card:#0f1833;--fg:#e8eeff;--muted:#8d9ac0;--line:#1f2d55;--same:#2fe07a;--diff:#ff5d6c;--skip:#ffc21a;--accent:#5b9bff;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#070c1b;--card:#0f1833;--fg:#e8eeff;--muted:#8d9ac0;--line:#1f2d55;--same:#2fe07a;--diff:#ff5d6c;--skip:#ffc21a;--accent:#5b9bff;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 48px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
.wrap{max-width:860px;margin:0 auto}
header{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding-block:16px 12px;border-bottom:1px solid var(--line)}
h1{font-family:var(--display);font-weight:800;font-size:2rem;margin:0;letter-spacing:.01em;text-wrap:balance}
.lead{color:var(--muted);margin:4px 0 10px;max-width:65ch}
.bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden}.bar>i{display:block;height:100%;background:var(--accent);width:0;transition:width .3s}
.meta{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:8px;font-size:.85rem;color:var(--muted)}
.meta b{color:var(--fg);font-variant-numeric:tabular-nums}
.filters{display:flex;gap:6px;margin-left:auto}
.filters button{font:inherit;font-size:.8rem;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.filters button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);font-weight:700}
#status{font-size:.8rem}
ol{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:14px}
.pair{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:12px}
.pair[data-label="mesmo"]{border-color:var(--same)}.pair[data-label="diferente"]{border-color:var(--diff)}.pair[data-label="nao_sei"]{border-color:var(--skip)}
.head{display:flex;justify-content:space-between;gap:8px;font-size:.78rem;color:var(--muted)}
.head .n{font-family:var(--display);font-weight:700;font-size:1rem;color:var(--fg)}
.kind{text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.sides{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
.vs{align-self:center;font-family:var(--display);font-weight:800;color:var(--muted)}
.prod{display:flex;gap:10px;min-width:0}
.prod img,.prod .ph{width:72px;height:72px;flex:none;border-radius:10px;background:#fff;object-fit:contain;border:1px solid var(--line)}
.prod .ph{display:grid;place-items:center;font-family:var(--display);font-size:1.6rem;color:#9aa6c4}
.prod div{min-width:0}
.mk{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}
.nm{font-weight:600;line-height:1.3;margin:2px 0;overflow-wrap:anywhere}
.pr{font-family:var(--display);font-weight:700;font-size:1.15rem;font-variant-numeric:tabular-nums}
.why{font-size:.8rem;color:var(--muted)}.was{font-size:.85rem;padding:8px 10px;border-radius:8px;background:var(--bg);border:1px dashed var(--line)}.was b{font-weight:700}.why mark{background:none;color:var(--fg);font-weight:700}
.acts{display:flex;flex-wrap:wrap;gap:8px}
.acts button{font:inherit;font-weight:700;padding:10px 14px;border-radius:10px;border:2px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;min-width:120px}
.acts .s[aria-pressed="true"]{background:var(--same);border-color:var(--same);color:#fff}
.acts .d[aria-pressed="true"]{background:var(--diff);border-color:var(--diff);color:#fff}
.acts .k[aria-pressed="true"]{background:var(--skip);border-color:var(--skip);color:#111}
.acts button:hover{border-color:var(--accent)}
button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
@media (max-width:600px){.sides{grid-template-columns:1fr}.vs{justify-self:center}.acts button{flex:1;min-width:0}}
@media (prefers-reduced-motion:reduce){.bar>i{transition:none}}
</style>
<div class="wrap">
<header>
  <h1>${TITLE}</h1>
  <p class="lead">${LEAD}</p>
  <div class="bar"><i id="fill"></i></div>
  <div class="meta"><span><b id="done">0</b> de <b id="total">0</b> respondidos</span><span id="status">Conectando…</span>
    <div class="filters" role="group" aria-label="Mostrar"><button id="f-todos" aria-pressed="false">Todos</button><button id="f-faltam" aria-pressed="true">Faltam</button></div></div>
</header>
<ol id="list"></ol>
</div>
<script>
const PAIRS = ${data};
const KIND = {juntos:'hoje juntos', separados:'hoje separados', ean:'mesmo código de barras'};
const NOME = {mesmo:'mesmo produto', diferente:'diferente', nao_sei:'não sei'};
const labels = {}; let filter = 'faltam', db = null, canWrite = true;
const brl = (n) => n == null ? '' : n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc = (s) => String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function side(p){return '<div class="prod">'+(p.thumb?'<img alt="" src="'+p.thumb+'">':'<span class="ph">'+esc(p.name.trim()[0]||'?')+'</span>')+'<div><div class="mk">'+esc(p.market)+'</div><div class="nm">'+esc(p.name)+'</div><div class="pr">'+brl(p.price)+'</div></div></div>'}
function render(){
  const list = document.getElementById('list');
  const shown = PAIRS.filter((p)=>filter==='todos'||!labels[p.id]);
  list.innerHTML = shown.map((p)=>{const n=PAIRS.indexOf(p)+1, l=labels[p.id]||'';
    return '<li class="pair" data-id="'+p.id+'" data-label="'+l+'"><div class="head"><span class="n">'+n+'</span><span class="kind">'+(KIND[p.kind]||'')+'</span></div>'+
    '<div class="sides">'+side(p.a)+'<span class="vs">×</span>'+side(p.b)+'</div>'+
    (p.atual?'<div class="was">Antes você marcou <b>'+NOME[p.atual]+'</b>; o juiz disse <b>'+NOME[p.juiz]+'</b>.</div>':'')+
    (p.diff?'<div class="why">Palavras que mudam: <mark>'+esc(p.diff.join(', ')||'—')+'</mark></div>':'')+
    '<div class="acts"><button class="s" data-v="mesmo" aria-pressed="'+(l==='mesmo')+'">Mesmo produto</button><button class="d" data-v="diferente" aria-pressed="'+(l==='diferente')+'">Diferente</button><button class="k" data-v="nao_sei" aria-pressed="'+(l==='nao_sei')+'">Não sei</button></div></li>'}).join('')
    || '<li class="pair"><b>Tudo respondido.</b> Obrigado! Toque em "Todos" para revisar.</li>';
  const done = PAIRS.filter((p)=>labels[p.id]).length;
  document.getElementById('done').textContent = done; document.getElementById('total').textContent = PAIRS.length;
  document.getElementById('fill').style.width = (100*done/PAIRS.length)+'%';
}
function setFilter(f){filter=f;document.getElementById('f-todos').setAttribute('aria-pressed',f==='todos');document.getElementById('f-faltam').setAttribute('aria-pressed',f==='faltam');render()}
document.getElementById('f-todos').onclick=()=>setFilter('todos');
document.getElementById('f-faltam').onclick=()=>setFilter('faltam');
document.getElementById('list').addEventListener('click', async (e)=>{
  const b = e.target.closest('button[data-v]'); if(!b) return;
  const id = b.closest('[data-id]').dataset.id, v = b.dataset.v;
  const p = PAIRS.find((x)=>x.id===id);
  labels[id] = v; render();
  if(!db){ status('Sem conexão: a resposta não foi salva.'); return; }
  try { await db.doc('rotulos/'+id).set({label:v, kind:p.kind, a:p.a.market+' | '+p.a.name, b:p.b.market+' | '+p.b.name, diff:p.diff, at:new Date().toISOString()}); status('Salvo'); }
  catch(err){ status(err&&err.code==='invalid_argument'?'Você não tem permissão para salvar aqui.':'Não consegui salvar. Tente de novo.'); }
});
function status(t){document.getElementById('status').textContent=t}
render();
(async()=>{
  try{ db = await window.claude?.use?.('db'); }catch{}
  if(!db){ status('Sem conexão com o armazenamento: respostas não serão salvas.'); return; }
  const timer = setTimeout(()=>status('Ainda conectando…'), 10000);
  db.collection('rotulos').onSnapshot((snap)=>{
    for(const d of snap.docs){ const v=d.data(); if(v&&v.label) labels[d.id]=v.label; }
    if(!snap.metadata.fromCache){ clearTimeout(timer); status('Respostas salvas automaticamente'); }
    render();
  },(err)=>{ clearTimeout(timer); status('Não consegui ler as respostas salvas.'); });
})();
</script>`;
fs.writeFileSync(path.resolve(DIR, arg('saida', 'rotulos.html')), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
