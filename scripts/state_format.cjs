const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'state_result.json'), 'utf8'));
const NS = d.NS;
const PHASES = ['f2', 'f3', 'oit', 'qf', 'sf', 'fin', 'ac'];
const LABEL = { f2: 'F2', f3: 'F3', oit: 'Oitavas', qf: 'Quartas', sf: 'Semi', fin: 'Final', ac: 'Acesso' };
const UFS = Object.keys(d.hist);
const exp = (arr) => arr.reduce((s, c, k) => s + c * k, 0) / NS;
// ordena estados por nº esperado de acessos desc
const rows = UFS.map(u => {
  const n = d.ufTeams[u].length;
  const e = {};
  PHASES.forEach(p => { e[p] = exp(d.hist[u][p]); });
  return { u, n, e, hist: d.hist[u] };
}).sort((a, b) => b.e.ac - a.e.ac || b.e.sf - a.e.sf || b.e.f2 - a.e.f2);

const pct = (x) => (x / NS * 100);
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);

// Tabela 1: nº esperado de times por estado por fase
console.log('### Nº ESPERADO de times por fase (E[times])  | NS=' + NS);
console.log('UF  n  | ' + PHASES.map(p => LABEL[p].padStart(7)).join(' '));
rows.forEach(r => {
  console.log(r.u.padEnd(3) + ' ' + String(r.n).padStart(2) + '  | ' +
    PHASES.map(p => f2(r.e[p]).padStart(7)).join(' '));
});

// Tabela 2: distribuição de ACESSO P(k) por estado
console.log('\n### ACESSO — P(exatamente k times sobem) %  | NS=' + NS);
const maxK = Math.max(...rows.map(r => r.hist.ac.length - 1));
let header = 'UF  n  |';
for (let k = 0; k <= Math.min(maxK, 4); k++) header += ('k=' + k).padStart(8);
header += '   E[ac]   P(>=1)';
console.log(header);
rows.forEach(r => {
  const h = r.hist.ac;
  let line = r.u.padEnd(3) + ' ' + String(r.n).padStart(2) + '  |';
  for (let k = 0; k <= Math.min(maxK, 4); k++) line += f1(pct(h[k] || 0)).padStart(8);
  const p0 = pct(h[0] || 0);
  line += f2(r.e.ac).padStart(8) + f1(100 - p0).padStart(9);
  console.log(line);
});

// Tabela 3: distribuição completa para fases-chave (F2, Oitavas) das maiores UFs
function distTable(phase) {
  console.log('\n### ' + LABEL[phase] + ' — P(exatamente k times) %  | NS=' + NS);
  const mk = Math.max(...rows.map(r => r.hist[phase].length - 1));
  let hdr = 'UF  n  |';
  for (let k = 0; k <= mk; k++) hdr += ('k=' + k).padStart(7);
  hdr += '   E';
  console.log(hdr);
  rows.forEach(r => {
    const h = r.hist[phase];
    let line = r.u.padEnd(3) + ' ' + String(r.n).padStart(2) + '  |';
    for (let k = 0; k <= mk; k++) line += f1(pct(h[k] || 0)).padStart(7);
    line += f2(r.e[phase]).padStart(7);
    console.log(line);
  });
}
distTable('f2');

// totais de sanidade
console.log('\n### Sanidade: soma de E[times] sobre todos os estados (deve bater com vagas da fase)');
PHASES.forEach(p => {
  const tot = rows.reduce((s, r) => s + r.e[p], 0);
  console.log('  ' + LABEL[p].padEnd(8) + ' = ' + f2(tot));
});
