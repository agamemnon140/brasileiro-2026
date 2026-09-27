// Converte eval/REPORT.md em uma pagina HTML autocontida (eval/out/report.html).
//
// Existe porque o relatorio e um documento de tabelas densas: numeros alinhados, intervalos
// de confianca e marcacoes de significancia se leem muito melhor com numeral tabular e
// regras finas do que em markdown cru. E porque o .md dentro do Google Drive nem sempre
// abre.
//
// Nada e recalculado aqui — a fonte continua sendo o REPORT.md, que por sua vez so formata
// os JSON canonicos. Regenerar: node eval/publicar.cjs
const fs = require('fs');
const path = require('path');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Marcacao inline: crase para codigo, ** para forte, * para enfase, [texto](url).
function inline(s) {
  // Escapar ANTES de converter os trechos de crase dispensa qualquer marcador temporario:
  // o escape nao mexe em crases, entao elas sobrevivem e a conversao acontece sobre texto ja
  // seguro. Uma versao anterior guardava o conteudo de `codigo` de lado e o repunha por um
  // indice delimitado — o que exigia um delimitador que jamais aparecesse no texto, e o
  // relatorio esta cheio de numeros soltos ("media de 3 sementes") prontos para colidir.
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

// Celulas cujo conteudo e numerico ganham alinhamento a direita e numeral tabular; a
// primeira coluna fica a esquerda mesmo quando parece numero (costuma ser rotulo).
const ehNumero = c => /^[+\-−]?[\d.,]+(\s|$)|^\*\*[+\-−]?[\d.,]/.test(c.trim()) || /^\[[-\d.,\s]+\]$/.test(c.trim());

function converter(md) {
  const linhas = md.split('\n');
  const out = [];
  const toc = [];
  let i = 0;
  let nSec = 0;

  const fechaPara = buf => { if (buf.length) { out.push(`<p>${inline(buf.join(' '))}</p>`); buf.length = 0; } };
  const buf = [];

  while (i < linhas.length) {
    const l = linhas[i];

    // tabela: linha com | seguida de separador |---|
    if (/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test(linhas[i + 1] || '')) {
      fechaPara(buf);
      const cels = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cels(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\|/.test(linhas[i])) { corpo.push(cels(linhas[i])); i++; }
      const th = head.map((c, k) => `<th${k > 0 && ehNumero((corpo[0] || [])[k] || '') ? ' class="num"' : ''}>${inline(c)}</th>`).join('');
      const tr = corpo.map(r => '<tr>' + r.map((c, k) => `<td${k > 0 && ehNumero(c) ? ' class="num"' : ''}>${inline(c)}</td>`).join('') + '</tr>').join('');
      out.push(`<div class="tabela"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      fechaPara(buf);
      const n = h[1].length;
      const txt = h[2];
      if (n === 2) {
        nSec++;
        const id = 's' + nSec;
        toc.push({ id, txt: txt.replace(/^\d+\.\s*/, '') });
        out.push(`<h2 id="${id}">${inline(txt)}</h2>`);
      } else if (n === 1) {
        out.push(`<h1>${inline(txt)}</h1>`);
      } else {
        out.push(`<h${n}>${inline(txt)}</h${n}>`);
      }
      i++; continue;
    }

    if (/^>\s?/.test(l)) {
      fechaPara(buf);
      const q = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) { q.push(linhas[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      fechaPara(buf);
      const ord = /^\s*\d+\.\s+/.test(l);
      const itens = [];
      while (i < linhas.length && (/^\s*[-*]\s+/.test(linhas[i]) || /^\s*\d+\.\s+/.test(linhas[i]) || (itens.length && /^\s{2,}\S/.test(linhas[i])))) {
        if (/^\s*[-*]\s+/.test(linhas[i]) || /^\s*\d+\.\s+/.test(linhas[i])) {
          itens.push(linhas[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ''));
        } else {
          itens[itens.length - 1] += ' ' + linhas[i].trim();   // continuacao indentada
        }
        i++;
      }
      out.push(`<${ord ? 'ol' : 'ul'}>` + itens.map(t => `<li>${inline(t)}</li>`).join('') + `</${ord ? 'ol' : 'ul'}>`);
      continue;
    }

    if (!l.trim()) { fechaPara(buf); i++; continue; }
    buf.push(l.trim());
    i++;
  }
  fechaPara(buf);
  return { corpo: out.join('\n'), toc };
}

const CSS = `
:root{
  --ground:#F4F5F7; --surface:#FFFFFF; --ink:#161C24; --ink-2:#4A5560; --ink-3:#79838F;
  --rule:#DCE0E6; --rule-forte:#B9C0C9;
  --acento:#1D3F5E;          /* azul-tinta sobrio: cor de instrumento, nao de time */
  --acento-suave:#E7EDF3;
  --sinal:#8A5200;           /* ambar de placar: marca o que e significativo */
  --sinal-suave:#F6ECDC;
  --defeito:#8C2733;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0E1216; --surface:#151B21; --ink:#E7EBEF; --ink-2:#AEB8C2; --ink-3:#7C8794;
    --rule:#242C34; --rule-forte:#39434D;
    --acento:#8FB8DC; --acento-suave:#1A2833;
    --sinal:#E0A961; --sinal-suave:#2A2214;
    --defeito:#E08A94;
  }
}
:root[data-theme="dark"]{
  --ground:#0E1216; --surface:#151B21; --ink:#E7EBEF; --ink-2:#AEB8C2; --ink-3:#7C8794;
  --rule:#242C34; --rule-forte:#39434D;
  --acento:#8FB8DC; --acento-suave:#1A2833;
  --sinal:#E0A961; --sinal-suave:#2A2214;
  --defeito:#E08A94;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  font-size:16px; line-height:1.65; -webkit-text-size-adjust:100%;
}
.pagina{max-width:1180px; margin:0 auto; padding:clamp(1.5rem,4vw,3.5rem) clamp(1rem,4vw,2.5rem) 6rem;
  display:grid; grid-template-columns:1fr; gap:2.5rem;}
@media(min-width:1000px){ .pagina{grid-template-columns:15rem minmax(0,1fr); align-items:start;} }

/* indice */
nav.indice{position:sticky; top:2rem; font-size:.82rem; line-height:1.45; display:none;}
@media(min-width:1000px){ nav.indice{display:block;} }
nav.indice p{font:600 .7rem/1 "IBM Plex Sans",sans-serif; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-3); margin:0 0 .9rem;}
nav.indice ol{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.55rem; counter-reset:n;}
nav.indice li{counter-increment:n; display:flex; gap:.6rem;}
nav.indice li::before{content:counter(n,decimal-leading-zero); color:var(--ink-3);
  font-family:"IBM Plex Mono",monospace; font-size:.72rem; padding-top:.12rem;}
nav.indice a{color:var(--ink-2); text-decoration:none; border-bottom:1px solid transparent;}
nav.indice a:hover,nav.indice a:focus-visible{color:var(--acento); border-bottom-color:var(--acento);}

main{min-width:0; display:flex; flex-direction:column; gap:1.15rem;}
h1{font-family:"Fraunces",Georgia,serif; font-weight:600; font-size:clamp(1.9rem,4.2vw,2.9rem);
  line-height:1.12; letter-spacing:-.015em; text-wrap:balance; margin:0 0 .3rem; max-width:22ch;}
h2{font-family:"Fraunces",Georgia,serif; font-weight:600; font-size:clamp(1.3rem,2.6vw,1.7rem);
  line-height:1.2; text-wrap:balance; margin:2.6rem 0 .2rem; padding-top:1.4rem;
  border-top:1px solid var(--rule-forte); scroll-margin-top:1.5rem;}
h3{font-family:"IBM Plex Sans",sans-serif; font-weight:600; font-size:1.02rem; letter-spacing:.005em;
  text-wrap:balance; margin:1.9rem 0 .1rem; color:var(--ink);}
p{margin:0; max-width:68ch;}
ul,ol{margin:.2rem 0; padding-left:1.35rem; max-width:68ch; display:flex; flex-direction:column; gap:.5rem;}
li{padding-left:.2rem;}
a{color:var(--acento);}
strong{font-weight:600;}
code{font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:.86em;
  background:var(--acento-suave); padding:.1em .34em; border-radius:3px; word-break:break-word;}
blockquote{margin:.4rem 0; padding:.85rem 1.1rem; background:var(--sinal-suave);
  border-left:3px solid var(--sinal); border-radius:0 4px 4px 0; max-width:68ch; color:var(--ink);}
blockquote strong{color:var(--sinal);}

/* tabelas: o coracao do documento */
.tabela{overflow-x:auto; margin:.5rem 0 .3rem; background:var(--surface);
  border:1px solid var(--rule); border-radius:6px;}
table{border-collapse:collapse; width:100%; font-size:.85rem;}
thead th{position:sticky; top:0; background:var(--surface); text-align:left;
  font:600 .68rem/1.3 "IBM Plex Sans",sans-serif; letter-spacing:.09em; text-transform:uppercase;
  color:var(--ink-3); padding:.7rem .85rem; border-bottom:1px solid var(--rule-forte); white-space:nowrap;}
td{padding:.55rem .85rem; border-bottom:1px solid var(--rule); vertical-align:top;}
tbody tr:last-child td{border-bottom:none;}
th.num,td.num{text-align:right; font-family:"IBM Plex Mono",monospace;
  font-variant-numeric:tabular-nums; white-space:nowrap;}
td strong{color:var(--sinal);}   /* significancia marcada em negrito no md */
tbody tr:hover td{background:var(--acento-suave);}

footer{margin-top:3.5rem; padding-top:1.2rem; border-top:1px solid var(--rule);
  font-size:.78rem; color:var(--ink-3); max-width:68ch;}
@media(prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important;}}
`;

function montar(md) {
  const { corpo, toc } = converter(md);
  return `<title>Acerto das previsões do Brasileirão 2026</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${CSS}</style>
<div class="pagina">
<nav class="indice" aria-label="Seções">
<p>Seções</p>
<ol>${toc.map(t => `<li><a href="#${t.id}">${t.txt}</a></li>`).join('')}</ol>
</nav>
<main>
${corpo}
<footer>Gerado por <code>node eval/publicar.cjs</code> a partir de <code>eval/REPORT.md</code>,
que por sua vez formata <code>eval/out/curto.json</code> e <code>eval/out/longo.json</code>.
Nenhum número é calculado nesta página.</footer>
</main>
</div>
`;
}

if (require.main === module) {
  const md = fs.readFileSync(path.join(__dirname, 'REPORT.md'), 'utf8');
  const dst = path.join(__dirname, 'out', 'report.html');
  fs.writeFileSync(dst, montar(md));
  console.log('-> ' + dst);
}

module.exports = { montar, converter };
