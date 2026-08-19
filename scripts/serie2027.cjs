// Valida a projecao de serie para 2027 (v4.72/v4.73).
//
// A invariante forte: somando as probabilidades de cada clube por divisao, o total tem de
// dar o TAMANHO da divisao em 2027. A = 20, B = 20, C = 24 (a C expande: 20 - 2 rebaixados
// - 4 promovidos + 4 vindos da B + 6 vindos da D) e D = 96 menos as vagas que ainda nao tem
// dono conhecido. Se o encadeamento de acesso e rebaixamento estiver errado em qualquer
// divisao, alguma dessas somas nao fecha.
//
// O segundo teste e de reconciliacao: a chave e (nome, UF). Indexar por nome faria o
// Santa Cruz/PE emprestar a projecao dele ao Santa Cruz/RN e ao Santa Cruz/RS.
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '1000', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'simMC_CB', 'parseTab', 'buildRNC',
  'build2027Alloc', 'build2027Series', 's27Key', 'ufOfTeam', 'RNC_2026', 'rncOf',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES',
  'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };
const cfg = { ...E.DEFAULT_CFG, drift: 15 };
const dash = {};
for (const [k, rk, tab, nm, dt, res] of [['A', 'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES'],
                                          ['B', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES'],
                                          ['C', 'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']]) {
  dash[k] = E.simMC(Object.keys(E[rk]), E[rk], E.parseTab(E[tab], E[nm], E[dt]), E[res], cfg, k, NS, 'conservador', false);
}
dash.D = E.simMC_D(cfg, NS, 'conservador', false);
dash.CB = E.simMC_CB(cfg, NS, 'conservador', false, {}, {});
const al = E.build2027Alloc(dash.D, dash.C, E.buildRNC(dash), null);
const s = E.build2027Series(dash, al);

// ---------- 1. tamanho de cada divisao ----------
const soma = k => Object.values(s).reduce((a, o) => a + o[k], 0) / 100;
const alvo = { A: 20, B: 20, C: 24, D: 96 - al.eSemDono };
console.log('tamanho de cada divisao em 2027 (soma das probabilidades por clube):');
for (const k of ['A', 'B', 'C', 'D']) {
  const v = soma(k);
  const bom = Math.abs(v - alvo[k]) < 0.5;
  console.log(`  Série ${k}: ${v.toFixed(2)}  (esperado ${alvo[k].toFixed(2)})${bom ? '' : '  <<<'}`);
  if (!bom) fail(`Série ${k} deveria somar ~${alvo[k].toFixed(2)}`);
}
console.log(`  vagas sem dono conhecido: ${al.eSemDono.toFixed(2)}  (D + sem dono = ${(soma('D') + al.eSemDono).toFixed(2)})`);

// ---------- 2. cada clube soma 100% ----------
let pior = 0;
Object.keys(s).forEach(k => {
  const o = s[k];
  pior = Math.max(pior, Math.abs(o.A + o.B + o.C + o.D + o.fora - 100));
});
console.log(`cada clube soma 100%: desvio máximo ${pior.toExponential(2)}`);
if (pior > 1e-6) fail('algum clube não soma 100%');

// ---------- 3. homonimos nao herdam projecao ----------
// Teste exato, nao heuristico: um clube do RNC que nao casa com nenhum clube do app E nao
// aparece na alocacao de vagas nao pode ter projecao NENHUMA. Era assim que o Santa Cruz/PE
// emprestava a dele ao Santa Cruz/RN e ao Santa Cruz/RS.
const proj = E.buildRNC(dash);
const naAloc = new Set((al.clubProb || []).map(c => E.s27Key(c.n, c.u)));
const indevidas = [];
proj.clubes.forEach(c => {
  const k = E.s27Key(c.app || c.n, c.u);
  if (!c.app && !naAloc.has(k) && s[k]) indevidas.push(`${c.n}/${c.u} -> ${s[k].mais} ${s[k].maisP.toFixed(0)}%`);
});
console.log(`clubes sem vinculo com o app e sem vaga projetada: ${proj.clubes.filter(c => !c.app && !naAloc.has(E.s27Key(c.n, c.u))).length}`);
console.log(`  destes, com projecao indevida: ${indevidas.length}`);
indevidas.slice(0, 8).forEach(x => console.log('    ' + x));
if (indevidas.length) fail('homonimo herdando projecao -- a chave voltou a ser so o nome');

// E o caso concreto que motivou a correcao.
const sc = proj.clubes.filter(c => c.n === 'Santa Cruz');
console.log('Santa Cruz (' + sc.length + ' clubes distintos no RNC):');
sc.forEach(c => {
  const o = s[E.s27Key(c.app || c.n, c.u)];
  console.log(`  /${c.u}  app=${c.app || '(nenhum)'}  serie27=${o ? o.mais + ' ' + o.maisP.toFixed(0) + '%' : '(sem projecao)'}`);
});

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
