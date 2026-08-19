// As cascatas de AL, RN e MG ja se consumaram na vida real. Com as quartas de final agora
// aplicadas de verdade (v4.74), o modelo tem de reproduzi-las sozinho, a partir da fila
// estadual -- sem nenhum caso especial.
const { extractEngine, SHIM } = require('./engine.cjs');
const rj = JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'..','results.json'), 'utf8'));
const NS = parseInt(process.env.NS || '1200', 10);
const src = extractEngine() + '\n' +
  'applySdKoAuto(' + JSON.stringify(rj.ko_d || []) + ');\n' +
  'const cfg = { ...DEFAULT_CFG, drift: 15 };\n' +
  'const dash = {};\n' +
  "dash.A = simMC(Object.keys(SA_RANKING), SA_RANKING, parseTab(SA_TAB, SA_NM, SA_DATES), SA_RES, cfg, 'A', " + NS + ", 'conservador', false);\n" +
  "dash.B = simMC(Object.keys(SB_RANKING), SB_RANKING, parseTab(SB_TAB, SB_NM, SB_DATES), SB_RES, cfg, 'B', " + NS + ", 'conservador', false);\n" +
  "dash.C = simMC(Object.keys(SC_RANKING), SC_RANKING, parseTab(SC_TAB, SC_NM, SC_DATES), SC_RES, cfg, 'C', " + NS + ", 'conservador', false);\n" +
  "dash.D = simMC_D(cfg, " + NS + ", 'conservador', false);\n" +
  "dash.CB = simMC_CB(cfg, " + NS + ", 'conservador', false, {}, {});\n" +
  'const al = build2027Alloc(dash.D, dash.C, buildRNC(dash), null);\n' +
  'return { al, dash };';
const R = new Function(SHIM + src)();

const p = {};
R.al.clubProb.forEach(c => p[c.n] = c.p);
const ac = {};
R.dash.D.probs.forEach(x => ac[x.time] = x.ac);
const linha = t => '    ' + t.padEnd(22) +
  'acesso à C: ' + (ac[t] != null ? ac[t].toFixed(0).padStart(3) + '%' : '  —') +
  '   fica na D 2027: ' + (p[t] != null ? p[t].toFixed(0).padStart(3) + '%' : '  0%');

console.log('cascatas ja consumadas na vida real — o modelo reproduz sozinho?');
[['AL', 'ASA subiu → Murici herda a vaga', ['ASA', 'CSA', 'Murici', 'Cruzeiro-AL']],
 ['RN', 'ABC subiu → Potiguar de Mossoró herda', ['ABC', 'América-RN', 'Potiguar de Mossoró']],
 ['MG', 'Uberlândia subiu', ['Uberlândia', 'Pouso Alegre', 'North', 'URT', 'Tombense']]
].forEach(([uf, nota, times]) => {
  console.log('\n  ' + uf + ' — ' + nota);
  times.forEach(t => console.log(linha(t)));
});
console.log('\nE[Critério 3] = ' + R.al.eD26.toFixed(2) +
  ' | E[Ranking] = ' + R.al.eRnc.toFixed(2) +
  ' | sem dono = ' + R.al.eSemDono.toFixed(2));
