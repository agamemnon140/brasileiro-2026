// Copa do Brasil 2027 (v4.86): composição dos 128 a partir dos rastros do Monte Carlo.
//
// (1) Rastros novos: A.rebTrace (4 rebaixados/sim), B.accTrace (4 acessos/sim) e C.finTrace
//     ([campeão, vice]/sim) reproduzem EXATAMENTE z4, bAccess e qChamp.
// (2) Contas fecham: Σ P(Série A 2027) = 20 vagas; Σ Critério 2 = regionais decididas + C + D
//     (cada uma no máximo 100%); Σ estaduais = 102 − vagas de copa em disputa − lista curta.
// (3) Um clube conta uma vez por cenário (pA27 + pC2 + pEst ≤ 100).
// (4) "Garantido" é regra de pontos, não Monte Carlo — então todo garantido tem de estar
//     classificado em 100% dos cenários, e todo dono certo de vaga estadual com pEst = 100.
//     É o teste que pega uma regra de certeza otimista demais.
// (5) Dados: a tabela de vagas por federação soma 102 e cada UF tem lista longa o bastante.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'simMC_CB', 'parseTab', 'buildRNC', 'buildCB2027', 'mergeRes',
  'applyQuadCAuto', 'CB27_UF', 'CB27_REG', 'CB27_N2',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);
let results = {};
try { results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results.json'), 'utf8')); } catch (e) {}
E.applyQuadCAuto(results.quad_c || []);
const RL = k => (results.results || []).filter(r => r && r.serie === k).map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));
const res = { A: E.mergeRes(E.SA_RES, RL('A')), B: E.mergeRes(E.SB_RES, RL('B')), C: E.mergeRes(E.SC_RES, RL('C')) };
const cfg = { ...E.DEFAULT_CFG, drift: 15 };
const dash = {};
for (const [k, rk, tab, nm, dt] of [['A', 'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES'], ['B', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES'], ['C', 'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES']])
  dash[k] = E.simMC(Object.keys(E[rk]), E[rk], E.parseTab(E[tab], E[nm], E[dt]), res[k], cfg, k, NS, 'conservador', false);
dash.D = E.simMC_D(cfg, NS, 'conservador', false);
dash.CB = E.simMC_CB(cfg, NS, 'conservador', false, {}, {});

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

console.log('(1) rastros');
const freq = (arr, n) => { const m = {}; arr.forEach(t => m[t] = (m[t] || 0) + 1); for (const k in m) m[k] = m[k] / n * 100; return m; };
check(dash.A.rebTrace && dash.A.rebTrace.length === 4 * NS, `A.rebTrace = 4·NS (${dash.A.rebTrace && dash.A.rebTrace.length})`);
check(dash.B.accTrace && dash.B.accTrace.length === 4 * NS, `B.accTrace = 4·NS`);
check(dash.C.finTrace && dash.C.finTrace.length === 2 * NS, `C.finTrace = 2·NS`);
check(!dash.A.ufDist, 'A não ganhou ufDist (o rastro da A não liga o resto das estatísticas de B/C)');
const fA = freq(dash.A.rebTrace, NS), fB = freq(dash.B.accTrace, NS), fC = freq(dash.C.finTrace.filter((_, i) => i % 2 === 0), NS);
check(dash.A.probs.every(p => near(fA[p.time] || 0, p.z4)), 'rebTrace da A reproduz z4');
check(dash.B.probs.every(p => near(fB[p.time] || 0, p.bAccess)), 'accTrace da B reproduz bAccess');
check(dash.C.probs.every(p => near(fC[p.time] || 0, p.qChamp)), 'finTrace da C reproduz qChamp');
check(dash.C.finTrace.every((t, i) => i % 2 === 1 || t !== dash.C.finTrace[i + 1]), 'campeão ≠ vice em toda sim');

const rnc = E.buildRNC(dash);
const R = E.buildCB2027(dash, rnc, res.A, res.B);
check(!!R, 'buildCB2027 devolve resultado');
if (!R) { console.log('\nRESULT: FAIL'); process.exit(1); }

console.log('\n(2) contas');
const soma = k => R.clubes.reduce((s, c) => s + c[k], 0);
check(near(soma('pA27'), 2000, 1e-6), `Σ P(Série A 2027) = 20 vagas (deu ${(soma('pA27') / 100).toFixed(4)})`);
const nPend = R.ufs.reduce((s, U) => s + U.pend, 0), nCurta = R.ufs.reduce((s, U) => s + U.curta, 0);
const nVagasUF = R.ufs.reduce((s, U) => s + U.vagas, 0);
check(near(soma('pEst'), (nVagasUF - nPend - nCurta) * 100, 1e-6), `Σ estaduais = ${nVagasUF} vagas − ${nPend.toFixed(2)} em disputa − ${nCurta.toFixed(2)} lista curta`);
const c2Esperado = R.c2.reduce((s, x) => s + x.dist.filter(d => d.n).reduce((a, d) => a + d.p, 0), 0);
check(near(soma('pC2'), c2Esperado, 1e-6) && R.c2.every(x => x.dist.reduce((a, d) => a + d.p, 0) <= 100 + 1e-6), `Σ Critério 2 = soma dos donos por competição (${(c2Esperado / 100).toFixed(3)} vagas)`);
const vagasUF = R.ufs.reduce((s, U) => s + U.vagas, 0);
check(vagasUF === 102, `vagas por federação somam 102 (deu ${vagasUF})`);

console.log('\n(3) um clube, uma vaga por cenário');
const dup = R.clubes.filter(c => c.pA27 + c.pC2 + c.pEst > 100 + 1e-6);
check(!dup.length, `pA27 + pC2 + pEst ≤ 100${dup.length ? ' — ' + dup.slice(0, 3).map(c => c.n).join(', ') : ''}`);

console.log('\n(4) garantido é regra, e o Monte Carlo nunca o desmente');
const G = R.clubes.filter(c => c.garantido);
const furo = G.filter(c => c.p < 100 - 1e-9);
check(furo.length === 0, `${G.length} garantidos, todos com P = 100%${furo.length ? ' — ' + furo.map(c => `${c.n} ${c.p.toFixed(2)}%`).join(', ') : ''}`);
const certosEst = R.ufs.flatMap(U => U.certos.map(n => ({ n, u: U.u })));
const furoEst = certosEst.filter(x => { const c = R.clubes.find(y => y.n === x.n); return !c || c.pEst < 100 - 1e-9; });
check(furoEst.length === 0, `${certosEst.length} donos certos de vaga estadual, todos com pEst = 100%${furoEst.length ? ' — ' + furoEst.map(x => x.n + '/' + x.u).join(', ') : ''}`);
check(R.ufs.every(U => U.certos.length <= U.vagas && new Set(U.certos).size === U.certos.length), 'nenhuma UF com mais donos certos que vagas');
check(G.length <= 128, `garantidos ≤ 128 (${G.length})`);

console.log('\n(5) dados');
for (const u of Object.keys(E.CB27_UF)) {
  const U = E.CB27_UF[u];
  const nA = U.est.ordem.filter(t => E.SA_RANKING[t] || E.SB_RANKING[t]).length;
  if (U.est.ordem.length < U.est.vagas + nA) check(false, `${u}: lista do estadual (${U.est.ordem.length}) não cobre ${U.est.vagas} vagas + ${nA} clubes de A/B que podem ser pulados`);
  const dupN = U.est.ordem.filter((t, i) => U.est.ordem.indexOf(t) !== i);
  if (dupN.length) check(false, `${u}: nome repetido na classificação — ${dupN.join(', ')}`);
}
check(true, `${Object.keys(E.CB27_UF).length} UFs conferidas`);

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
