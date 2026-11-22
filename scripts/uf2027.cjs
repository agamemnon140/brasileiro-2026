// Aba Estados (v4.91): clubes de cada UF em cada divisão nacional em 2027.
//
// buildUF2027 monta as quatro divisões de 2027 por sorteio e conta por estado. O que este
// harness prende são as invariantes que uma tabela plausível e errada não denuncia:
// (1) Rastros novos: B.rebTrace (4 rebaixados/sim) e C.accTrace (4 acessos/sim) reproduzem
//     EXATAMENTE z4 da B e q4 da C, e ninguém sobe e cai na mesma simulação.
// (2) As divisões fecham em TODO sorteio: A = 20, B = 20, C = 24 (20 − 4 − 2 + 4 + 6), D = 96;
//     em cada UF, Σ P(k) = 100 e E[total] = E[A] + E[B] + E[C] + E[D].
// (3) Série A reconstruída aqui, por outro caminho, direto dos rastros: o histograma por UF
//     tem de ser IDÊNTICO (é o teste da conjunta — marginais somadas não o passam), e a
//     esperança tem de ser base − Σ z4 + Σ bAccess do dashboard, sem ruído.
// (4) Clubes: somando os clubes de um estado dá a esperança dele em A, B e C; na D a
//     diferença é exatamente o que ainda não tem dono (copa estadual em disputa).
// (5) O gancho não mexeu na Série D: a contagem por UF é idêntica à do build2027Alloc puro
//     (mesma seed), ou seja, aos números da aba Série D → Class. 2027.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'simMC_CB', 'parseTab', 'buildRNC', 'build2027Alloc', 'buildUF2027',
  'mergeRes', 'applyQuadCAuto', 'applySdKoAuto', 'ufOfTeam', 'EST_QUOTA_2027', 'UF27_DIVS', 'SD_TIMES',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);
let results = {};
// RESULTS=<arquivo> troca o results.json (ex.: um recorte de meio de temporada, para exercitar
// o caso em que C e D ainda têm incerteza); RESULTS=none roda só com o embutido no app.
const RJ = process.env.RESULTS === 'none' ? null : (process.env.RESULTS || path.join(__dirname, '..', 'results.json'));
if (RJ) { try { results = JSON.parse(fs.readFileSync(RJ, 'utf8')); } catch (e) {} }
E.applyQuadCAuto(results.quad_c || []);
E.applySdKoAuto(results.ko_d || []);
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
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const UFS = Object.keys(E.EST_QUOTA_2027).sort();
const KS = E.UF27_DIVS.map(d => d.key);

console.log('(1) rastros');
const freq = (arr, n) => { const m = {}; arr.forEach(t => m[t] = (m[t] || 0) + 1); for (const k in m) m[k] = m[k] / n * 100; return m; };
check(dash.B.rebTrace && dash.B.rebTrace.length === 4 * NS, `B.rebTrace = 4·NS (${dash.B.rebTrace && dash.B.rebTrace.length})`);
check(dash.C.accTrace && dash.C.accTrace.length === 4 * NS, `C.accTrace = 4·NS (${dash.C.accTrace && dash.C.accTrace.length})`);
check(dash.B.accTrace && dash.B.accTrace.length === 4 * NS && dash.C.rebTrace && dash.C.rebTrace.length === 2 * NS && dash.A.rebTrace && dash.A.rebTrace.length === 4 * NS,
  'os rastros antigos seguem iguais (A.rebTrace 4·NS, B.accTrace 4·NS, C.rebTrace 2·NS)');
if (!dash.B.rebTrace || !dash.C.accTrace) { console.log('\nRESULT: FAIL'); process.exit(1); }
const fBr = freq(dash.B.rebTrace, NS), fCa = freq(dash.C.accTrace, NS);
check(dash.B.probs.every(p => near(fBr[p.time] || 0, p.z4, 1e-6)), 'rebTrace da B reproduz z4');
check(dash.C.probs.every(p => near(fCa[p.time] || 0, p.q4, 1e-6)), 'accTrace da C reproduz q4');
let cruzado = 0;
for (let i = 0; i < NS; i++) {
  const sB = new Set(dash.B.accTrace.slice(4 * i, 4 * i + 4));
  if (dash.B.rebTrace.slice(4 * i, 4 * i + 4).some(t => sB.has(t)) || sB.size !== 4) cruzado++;
  const sC = new Set(dash.C.accTrace.slice(4 * i, 4 * i + 4));
  if (dash.C.rebTrace.slice(2 * i, 2 * i + 2).some(t => sC.has(t)) || sC.size !== 4) cruzado++;
}
check(cruzado === 0, 'ninguém sobe e cai na mesma simulação; 4 acessos distintos por sim');

const rnc = E.buildRNC(dash);
const R = E.buildUF2027(dash, rnc, null);
check(!!R, 'buildUF2027 devolve resultado');
if (!R) { console.log('\nRESULT: FAIL'); process.exit(1); }
const row = {};
R.ufDist.forEach(r => row[r.uf] = r);

console.log('\n(2) as divisões fecham');
check(R.nDraws === NS, `um cenário por sorteio da Série D (${R.nDraws})`);
check(R.erros === 0, `nenhum sorteio com conta furada (${R.erros})`);
check(R.semUF.length === 0, `todo clube de A/B/C/D tem UF válida${R.semUF.length ? ' — ' + R.semUF.join(', ') : ''}`);
check(R.alinhado, 'A e B alinhadas por índice com a D (mesmo nº de sims)');
const alvo = { A: 20, B: 20, C: 24, D: 96 };
for (const k of KS) {
  const s = R.ufDist.reduce((a, r) => a + r[k].E, 0);
  check(near(s, alvo[k]) && near(R.tam[k], alvo[k]), `Série ${k} 2027: Σ E sobre as UFs = ${s.toFixed(6)} (esperado ${alvo[k]})`);
}
check(R.tam26.A === 20 && R.tam26.B === 20 && R.tam26.C === 20 && R.tam26.D === 96, 'base de 2026 = 20/20/20/96');
check(R.ufDist.length === 27, `27 UFs (${R.ufDist.length})`);
check(R.ufDist.every(r => KS.concat('tot').every(k => near(r[k].pcts.reduce((a, p) => a + p, 0), 100, 1e-6))), 'Σ P(k) = 100 em toda UF e divisão');
check(R.ufDist.every(r => near(r.tot.E, r.A.E + r.B.E + r.C.E + r.D.E, 1e-9)), 'E[total] = E[A] + E[B] + E[C] + E[D] em toda UF');
check(R.ufDist.every(r => near(r.n26.tot, r.n26.A + r.n26.B + r.n26.C + r.n26.D)), 'total de 2026 = soma das divisões');

console.log('\n(3) Série A 2027 reconstruída dos rastros (teste da conjunta)');
const baseA = {}, ufA = {};
UFS.forEach(u => baseA[u] = 0);
Object.keys(E.SA_RANKING).forEach(t => { baseA[E.ufOfTeam(t)]++; });
const histA = {};
UFS.forEach(u => histA[u] = []);
for (let d = 0; d < NS; d++) {
  const c = Object.assign({}, baseA);
  for (let k = 0; k < 4; k++) { c[E.ufOfTeam(dash.A.rebTrace[4 * d + k])]--; c[E.ufOfTeam(dash.B.accTrace[4 * d + k])]++; }
  UFS.forEach(u => histA[u][c[u]] = (histA[u][c[u]] || 0) + 1);
}
let piorH = 0;
UFS.forEach(u => {
  const mx = Math.max(histA[u].length, row[u].A.pcts.length);
  for (let k = 0; k < mx; k++) piorH = Math.max(piorH, Math.abs((histA[u][k] || 0) / NS * 100 - (row[u].A.pcts[k] || 0)));
});
check(piorH < 1e-9, `P(k) da Série A por UF idêntico ao recomputado (desvio máx ${piorH.toExponential(2)})`);
let piorE = 0;
UFS.forEach(u => {
  const esp = baseA[u]
    - dash.A.probs.filter(p => E.ufOfTeam(p.time) === u).reduce((a, p) => a + p.z4, 0) / 100
    + dash.B.probs.filter(p => E.ufOfTeam(p.time) === u).reduce((a, p) => a + (p.bAccess || 0), 0) / 100;
  piorE = Math.max(piorE, Math.abs(esp - row[u].A.E));
});
check(piorE < 1e-9, `E[Série A] por UF = base − Σ z4 + Σ bAccess do dashboard (desvio máx ${piorE.toExponential(2)})`);
// A conjunta tem de MORDER onde os clubes não são independentes: se dois clubes do mesmo
// estado brigam pelo mesmo acesso/rebaixamento, a variância difere da soma de Bernoullis.
const varDe = d => { const m = d.E; return d.pcts.reduce((a, p, k) => a + p / 100 * (k - m) * (k - m), 0); };
const dep = UFS.map(u => {
  const ps = dash.A.probs.filter(p => E.ufOfTeam(p.time) === u).map(p => p.z4 / 100)
    .concat(dash.B.probs.filter(p => E.ufOfTeam(p.time) === u).map(p => (p.bAccess || 0) / 100));
  return { u, vJ: varDe(row[u].A), vI: ps.reduce((a, p) => a + p * (1 - p), 0) };
}).filter(x => x.vI > 1e-6).sort((a, b) => Math.abs(b.vJ - b.vI) - Math.abs(a.vJ - a.vI));
console.log('      variância conjunta vs soma de marginais (Série A): ' +
  (dep.length ? dep.slice(0, 4).map(x => `${x.u} ${x.vJ.toFixed(3)} vs ${x.vI.toFixed(3)}`).join(' · ') : 'nenhuma UF com incerteza na A'));

console.log('\n(4) clubes explicam a esperança');
let piorC = 0, dupl = 0, acima = 0;
UFS.forEach(u => {
  const cs = R.clubes[u] || [];
  if (new Set(cs.map(c => c.n)).size !== cs.length) dupl++;
  cs.forEach(c => { if (c.A + c.B + c.C + c.D > 100 + 1e-6 || !near(c.A + c.B + c.C + c.D + c.fora, 100, 1e-6)) acima++; });
  ['A', 'B', 'C'].forEach(k => { piorC = Math.max(piorC, Math.abs(cs.reduce((a, c) => a + c[k], 0) / 100 - row[u][k].E)); });
});
check(piorC < 1e-6, `Σ clubes do estado = E em A, B e C (desvio máx ${piorC.toExponential(2)})`);
check(dupl === 0, 'nenhum clube listado duas vezes no mesmo estado');
check(acima === 0, 'cada clube soma 100% (A + B + C + D + fora)');
const semDonoUF = UFS.map(u => row[u].D.E - (R.clubes[u] || []).reduce((a, c) => a + c.D, 0) / 100);
check(semDonoUF.every(v => v > -1e-6), 'na D nenhum estado tem mais clube nomeado do que vaga');
const somaSemDono = semDonoUF.reduce((a, v) => a + v, 0);
check(near(somaSemDono, R.eSemDono, 1e-6), `vagas da D sem dono: Σ por UF = ${somaSemDono.toFixed(4)} = eSemDono (${R.eSemDono.toFixed(4)})`);
const nomes26 = new Set([].concat(Object.keys(E.SA_RANKING), Object.keys(E.SB_RANKING), Object.keys(E.SC_RANKING), E.SD_TIMES));
const listados = new Set(UFS.flatMap(u => (R.clubes[u] || []).filter(c => c.s26).map(c => c.n)));
check([...nomes26].every(t => listados.has(t)) && listados.size === 156, `os 156 clubes de 2026 aparecem uma vez (${listados.size})`);

console.log('\n(5) o gancho não mexeu na Série D');
const al = E.build2027Alloc(dash.D, dash.C, rnc, null);
const rowD = {};
al.ufDist.forEach(r => rowD[r.uf] = r.total);
let piorD = 0;
UFS.forEach(u => {
  const mx = Math.max(rowD[u].pcts.length, row[u].D.pcts.length);
  for (let k = 0; k < mx; k++) piorD = Math.max(piorD, Math.abs((rowD[u].pcts[k] || 0) - (row[u].D.pcts[k] || 0)));
});
check(piorD < 1e-9, `D 2027 por UF idêntica à do build2027Alloc (desvio máx ${piorD.toExponential(2)})`);
const R2 = E.buildUF2027(dash, rnc, null);
check(JSON.stringify(R2.ufDist) === JSON.stringify(R.ufDist) && JSON.stringify(R2.clubes) === JSON.stringify(R.clubes), 'duas execuções idênticas (reprodutível)');
check(E.buildUF2027({ A: dash.A, B: dash.B, C: dash.C, D: null }, rnc, null) === null, 'sem a Série D simulada devolve null (a aba pede para rodar tudo)');

console.log('\nresumo (E por UF: A / B / C / D):');
R.ufDist.slice().sort((a, b) => b.tot.E - a.tot.E).slice(0, 8).forEach(r =>
  console.log(`  ${r.uf}  ${KS.map(k => r[k].E.toFixed(2).padStart(5)).join(' / ')}   total ${r.tot.E.toFixed(2)} (2026: ${r.n26.tot})`));
const incertas = R.ufDist.flatMap(r => KS.filter(k => !r[k].pcts.some(p => p >= 100 - 1e-9)).map(k =>
  `${r.uf}·${k} [${r[k].pcts.map((p, i) => p > 0 ? i + ':' + p.toFixed(0) + '%' : '').filter(Boolean).join(' ')}]`));
console.log('em aberto: ' + (incertas.length ? incertas.join('  ') : 'nada'));

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
