// Valida a classificação geral 1º-96º da Série D (v4.65).
//
// As 9 bandas do bracket criam invariantes exatas: como a banda k contém exatamente os clubes
// eliminados naquela fase, a soma ACUMULADA de posGe até o corte de cada fase tem de reproduzir
// a probabilidade daquela fase, que a engine já calcula por outro caminho (ct[t].f3 etc.).
// Se as duas contas divergirem, ou a ordem das bandas está errada ou uma banda tem tamanho
// errado — os dois jeitos de quebrar isto.
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '2000', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC_D', 'SD_TIMES']);
const r = E.simMC_D({ ...E.DEFAULT_CFG, drift: 15 }, NS, 'conservador', false);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };
const N = E.SD_TIMES.length;

// (1) toda posição geral é ocupada por exatamente um clube em cada simulação
console.log(`sims=${r.nSims} clubes=${r.probs.length}`);
let worst = 0;
for (let pos = 0; pos < N; pos++) {
  const tot = r.probs.reduce((s, p) => s + p.posGe[pos], 0);
  worst = Math.max(worst, Math.abs(tot - 100));
}
console.log(`(1) soma de posGe por posição: desvio máx de 100% = ${worst.toFixed(9)}`);
if (worst > 1e-6) fail('alguma posição geral não soma 100%');

// (2) acumulado até cada corte = probabilidade da fase, calculada pela outra via
const CORTES = [[1, 'ch'], [2, 'fin'], [4, 'sf'], [6, 'ac'], [8, 'qf'], [16, 'oit'], [32, 'f3'], [64, 'f2']];
console.log('(2) acumulado de posGe vs. fase da engine (maior divergência por corte):');
for (const [k, fase] of CORTES) {
  let mx = 0, who = '';
  for (const p of r.probs) {
    const acc = p.posGe.slice(0, k).reduce((s, v) => s + v, 0);
    const d = Math.abs(acc - p[fase]);
    if (d > mx) { mx = d; who = p.time; }
  }
  const good = mx < 1e-9;
  console.log(`    top-${String(k).padStart(2)} = ${fase.padEnd(3)} | máx ${mx.toFixed(9)} ${good ? 'OK' : '<<< ' + who}`);
  if (!good) fail(`acumulado top-${k} != ${fase}`);
}

// (3) esperança de posição: o campeão do MC tem de ser o de menor E[posição]
const withE = r.probs.map(p => ({ t: p.time, E: p.posGe.reduce((s, v, i) => s + v / 100 * (i + 1), 0), ch: p.ch }));
withE.sort((a, b) => a.E - b.E);
const topCh = [...withE].sort((a, b) => b.ch - a.ch)[0];
console.log(`(3) menor E[pos geral]: ${withE[0].t} (${withE[0].E.toFixed(2)}) | maior título%: ${topCh.t} (${topCh.ch.toFixed(1)}%)`);
console.log('    5 melhores por E[pos]: ' + withE.slice(0, 5).map(x => `${x.t} ${x.E.toFixed(1)}`).join(', '));
const somaE = withE.reduce((s, x) => s + x.E, 0);
const esperado = N * (N + 1) / 2;
console.log(`(4) soma de E[pos] sobre os clubes = ${somaE.toFixed(3)} (esperado ${esperado})`);
if (Math.abs(somaE - esperado) > 1e-6) fail('soma de E[pos] != N(N+1)/2');

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
