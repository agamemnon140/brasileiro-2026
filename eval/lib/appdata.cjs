// Reconstrói, fora do navegador, EXATAMENTE o conjunto de resultados que o app enxerga.
//
// O app funde três fontes com precedência embutido > manual > buscado, dedup por par
// casa|fora (mergeRes, v4.50). O harness não tem localStorage, então "manual" é sempre
// vazio e a fusão vira mergeRes(SX_RES, fetched), onde `fetched` é o results.json passado
// pelo mesmo tratamento que handleSearchResults aplica: normName + findRod + descarte de
// jogos já embutidos.
//
// normName e findRod são declarados DENTRO do componente React, então loadEngine() não os
// alcança (não são bindings de topo). São fatiados por marcador textual e reavaliados no
// escopo do motor — mesma disciplina do scripts/engine.cjs: marcadores, nunca linhas.
const fs = require('fs');
const path = require('path');
const { runWithEngine, HTML } = require('../../scripts/engine.cjs');

const ROOT = path.join(__dirname, '..', '..');

// Fatia uma função declarada dentro do componente, do marcador até o fecho `};` na mesma
// indentação. Falha alto se o marcador sumir.
function sliceFn(html, marker, endMarker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error(`appdata: marcador nao encontrado no index.html: ${marker}`);
  const j = html.indexOf(endMarker, i);
  if (j < 0) throw new Error(`appdata: fim nao encontrado para: ${marker}`);
  return html.slice(i, j + endMarker.length);
}

function load() {
  const html = fs.readFileSync(HTML, 'utf8');
  const normNameSrc = sliceFn(html, '  const normName = n => {', "\n  };");
  const findRodSrc  = sliceFn(html, '  const findRod = (casa, fora, serie) => {', "\n  };");

  const resultsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'results.json'), 'utf8'));

  const harness = `
${normNameSrc}
${findRodSrc}
const __RJ = ${JSON.stringify(resultsJson.results || [])};
const builtIn = { A: SA_RES, B: SB_RES, C: SC_RES, D: SD_RES };
const dSet = new Set(SD_TIMES);
const fetched = { A: [], B: [], C: [], D: [] };
const rejeitados = [];
__RJ.forEach(r => {
  const s = (r.serie || '').toUpperCase();
  if (!fetched[s]) { rejeitados.push(['serie', r.serie]); return; }
  const casa = normName(String(r.casa || '').trim());
  const fora = normName(String(r.fora || '').trim());
  const gc = parseInt(r.gc) || 0, gf = parseInt(r.gf) || 0;
  let rod = parseInt(r.rodada) || 0;
  if (!casa || !fora) { rejeitados.push(['nome vazio', r]); return; }
  if (s === 'D' && (!dSet.has(casa) || !dSet.has(fora))) { rejeitados.push(['D nao canonico', casa + ' x ' + fora]); return; }
  if (builtIn[s].some(e => e.c === casa && e.f === fora)) return; // já embutido: não é rejeição
  if (!rod) rod = findRod(casa, fora, s);
  fetched[s].push({ c: casa, f: fora, gc, gf, r: rod });
});
return {
  merged: {
    A: mergeRes(SA_RES, fetched.A),
    B: mergeRes(SB_RES, fetched.B),
    C: mergeRes(SC_RES, fetched.C),
    D: mergeRes(SD_RES, fetched.D),
  },
  embutidos: { A: SA_RES.length, B: SB_RES.length, C: SC_RES.length, D: SD_RES.length },
  buscados:  { A: fetched.A.length, B: fetched.B.length, C: fetched.C.length, D: fetched.D.length },
  rejeitados,
  tab:     { A: SA_TAB, B: SB_TAB, C: SC_TAB },
  ranking: { A: SA_RANKING, B: SB_RANKING, C: SC_RANKING },
  nm:      { A: SA_NM, B: SB_NM, C: SC_NM },
  meta:    { A: SA_META, B: SB_META, C: SC_META },
};
`;
  const out = runWithEngine(harness);
  out.updated_at = resultsJson.updated_at;
  out.resultsJson = resultsJson;   // cru, para quem precisa de campos fora de `results` (ex.: cb)
  return out;
}

module.exports = { load };
