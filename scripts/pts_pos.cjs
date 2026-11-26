// Matriz pontos × posição (v4.94): rMC.ptsPos, o histograma CONJUNTO que alimenta o bloco
// "Matriz pontos × posição" do detalhamento do Monte Carlo (Séries A/B/C).
//
// A tela divide a mesma contagem por dois denominadores — pelo nº de times-simulação com
// aquela pontuação ("com 42 pontos, em que posição?") e pelo nº de simulações ("o 16º termina
// com quantos pontos?"). Uma contagem errada continua dando linhas que somam 100% e um mapa de
// calor com cara de certo; o que não fecha são as invariantes abaixo.
//
// (1) Estrutura: m tem uma coluna por posição, cada coluna soma nS (toda simulação tem
//     exatamente um time em cada posição) e o total é nS × nº de times.
// (2) Segundo caminho: o total de cada pontuação é recontado a partir dos ptsSamples de cada
//     time (que não passam pelo ptsAtPos) e tem de sair IDÊNTICO; lo/hi = extremos da amostra.
// (3) Percentis: ptsPosPctl reproduz EXATAMENTE os p10/p50/p90 de rMC.cortes nas cinco
//     posições que os cortes cobrem — mediana da matriz e p50 dos cortes não podem divergir.
// (4) Ordem: a média e a mediana de pontos não sobem quando a posição piora (em cada sim a
//     classificação é decrescente em pontos, logo a ordem vale posição a posição).
// (5) Fecho com probs: Σ_posições E[pontos na posição] = Σ_times mediaPts.
// (6) Eixo: decrescente, só pontuações que ocorreram, `null` só entre vizinhos não
//     consecutivos, nunca duas lacunas seguidas nem lacuna na ponta.
// (7) Caso montado à mão (3 times × 3 sims) com a matriz, o eixo e os percentis esperados.
//
// Casos: Série A hoje (results.json), Série A com 19 rodadas e com 0 (é onde a distribuição
// abre de verdade), Séries B e C hoje (liga encerrada: matriz degenerada tem de fechar igual).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'parseTab', 'mergeRes', 'applyQuadCAuto', 'buildPtsPos', 'ptsPosAxis', 'ptsPosPctl',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES', 'SA_META', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES', 'SB_META',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES', 'SC_META']);
let results = {};
const RJ = process.env.RESULTS === 'none' ? null : (process.env.RESULTS || path.join(__dirname, '..', 'results.json'));
if (RJ) { try { results = JSON.parse(fs.readFileSync(RJ, 'utf8')); } catch (e) {} }
E.applyQuadCAuto(results.quad_c || []);
const RL = k => (results.results || []).filter(r => r && r.serie === k).map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));
const cfg = { ...E.DEFAULT_CFG, drift: 15 };

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

const S = {
  A: [E.SA_RANKING, E.SA_TAB, E.SA_NM, E.SA_DATES, E.SA_RES, E.SA_META],
  B: [E.SB_RANKING, E.SB_TAB, E.SB_NM, E.SB_DATES, E.SB_RES, E.SB_META],
  C: [E.SC_RANKING, E.SC_TAB, E.SC_NM, E.SC_DATES, E.SC_RES, E.SC_META]
};
const run = (sk, maxRod) => {
  const [rk, tab, nm, dt, emb, meta] = S[sk];
  const times = Object.keys(rk);
  let res = E.mergeRes(emb, RL(sk));
  if (maxRod != null) res = res.filter(r => r.r >= 1 && r.r <= maxRod);
  // tabela PARSEADA (parseTab) — a forma crua produz lixo em silêncio, ver CLAUDE.md
  const r = E.simMC(times, rk, E.parseTab(tab, nm, dt), res, cfg, sk, NS, 'conservador', false, { ignoreUser: true });
  return { r, times, meta, nRes: res.length };
};

const valida = (rotulo, sk, maxRod) => {
  const { r, times, meta, nRes } = run(sk, maxRod);
  const pp = r.ptsPos, nT = times.length;
  console.log(`\n${rotulo} — ${nRes} resultado(s) reais, ${nT} times, NS=${NS}`);
  if (!pp) { check(false, 'simMC não emitiu ptsPos'); return null; }

  // (1) estrutura
  const colSum = new Array(nT).fill(0);
  let total = 0, larguraOk = true;
  pp.m.forEach(row => { if (row.length !== nT) larguraOk = false; row.forEach((v, i) => { colSum[i] += v; total += v; }); });
  check(pp.nS === NS && pp.m.length === pp.hi - pp.lo + 1 && larguraOk, `(1) dimensões: ${pp.m.length} pontuações (${pp.lo}–${pp.hi}) × ${nT} posições`);
  check(colSum.every(v => v === NS), '(1) cada posição soma nS');
  check(total === NS * nT, `(1) total = nS × times (${total})`);

  // (2) segundo caminho: ptsSamples por time
  const porPts = {};
  let lo = Infinity, hi = -Infinity, nAm = 0;
  r.probs.forEach(p => p.ptsSamples.forEach(v => { porPts[v] = (porPts[v] || 0) + 1; nAm++; if (v < lo) lo = v; if (v > hi) hi = v; }));
  const { axis, tot } = E.ptsPosAxis(pp);
  let dif = 0;
  for (let p = pp.lo; p <= pp.hi; p++) if ((porPts[p] || 0) !== tot[p - pp.lo]) dif++;
  check(nAm === NS * nT && dif === 0, `(2) total por pontuação idêntico ao recontado pelos ptsSamples (${dif} divergência(s))`);
  check(lo === pp.lo && hi === pp.hi, `(2) lo/hi = extremos da amostra (${lo}–${hi})`);

  // (3) percentis = cortes
  const nReb = sk === 'C' ? 2 : 4;
  const alvo = { titulo: 0, g4: 3, meio: Math.floor(nT / 2), z4: nT - nReb, ultimo: nT - 1 };
  let pdif = [];
  for (const k in alvo) for (const [q, f] of [[0.1, 'p10'], [0.5, 'p50'], [0.9, 'p90']]) {
    const v = E.ptsPosPctl(pp, alvo[k], q);
    if (v !== r.cortes[k][f]) pdif.push(`${k}.${f}: matriz ${v} × cortes ${r.cortes[k][f]}`);
  }
  check(pdif.length === 0, `(3) ptsPosPctl = cortes nas 5 posições × p10/p50/p90${pdif.length ? ' — ' + pdif.join('; ') : ''}`);

  // (4) ordem por posição
  const media = colSum.map((_, i) => { let s = 0; for (let p = pp.lo; p <= pp.hi; p++) s += p * pp.m[p - pp.lo][i]; return s / NS; });
  const med = colSum.map((_, i) => E.ptsPosPctl(pp, i, 0.5));
  let sobe = 0;
  for (let i = 1; i < nT; i++) if (media[i] > media[i - 1] + 1e-9 || med[i] > med[i - 1]) sobe++;
  check(sobe === 0, `(4) média e mediana de pontos não sobem quando a posição piora (1º ${media[0].toFixed(1)} … ${nT}º ${media[nT - 1].toFixed(1)})`);

  // (5) fecho com probs
  const somaPos = media.reduce((a, b) => a + b, 0), somaTimes = r.probs.reduce((a, p) => a + p.mediaPts, 0);
  check(near(somaPos, somaTimes), `(5) Σ E[pts por posição] = Σ mediaPts (${somaPos.toFixed(3)} × ${somaTimes.toFixed(3)})`);
  check(r.probs.every(p => near(p.posF.reduce((a, b) => a + b, 0), 100)), '(5) a matriz time × posição segue somando 100 por time');

  // (6) eixo
  const vals = axis.filter(p => p != null);
  const esperado = []; for (let p = pp.hi; p >= pp.lo; p--) if (tot[p - pp.lo] > 0) esperado.push(p);
  let eixoOk = JSON.stringify(vals) === JSON.stringify(esperado) && axis[0] != null && axis[axis.length - 1] != null;
  for (let k = 1; k < axis.length - 1 && eixoOk; k++) {
    if (axis[k] == null) { if (axis[k - 1] == null || axis[k + 1] == null || axis[k - 1] - axis[k + 1] < 2) eixoOk = false; }
    else if (axis[k - 1] != null && axis[k - 1] - axis[k] !== 1) eixoOk = false;
  }
  check(eixoOk, `(6) eixo: ${vals.length} pontuações, ${axis.length - vals.length} lacuna(s)`);

  // leitura "por pontos": cada linha exibida soma 100% (denominador = total da pontuação)
  const linhaOk = vals.every(p => { const n = tot[p - pp.lo]; return n > 0 && near(pp.m[p - pp.lo].reduce((a, v) => a + v / n * 100, 0), 100); });
  check(linhaOk, '(1) leitura por pontos: toda linha soma 100%');
  return { pp, axis, vals, meta, nT };
};

const hoje = valida('Série A hoje', 'A', null);
const meio = valida('Série A com 19 rodadas', 'A', 19);
valida('Série A com 0 rodadas', 'A', 0);
valida('Série B hoje', 'B', null);
valida('Série C hoje', 'C', null);

// o recorte de meio de temporada tem de abrir a distribuição — senão o harness só estaria
// testando o caso quase degenerado do fim do campeonato
if (hoje && meio) {
  console.log('\nabertura da distribuição');
  check(meio.vals.length > hoje.vals.length || hoje.vals.length >= 40, `19 rodadas espalha mais pontuações (${meio.vals.length}) que hoje (${hoje.vals.length})`);
  const z = meio.nT - (meio.meta.nReb || 4);
  const linhasMistas = meio.vals.filter(p => { const row = meio.pp.m[p - meio.pp.lo]; let n = 0, k = 0; row.forEach((v, i) => { n += v; if (i >= z) k += v; }); return k > 0 && k < n; }).length;
  check(linhasMistas >= 3, `com 19 rodadas há pontuações em que o time ora cai, ora escapa (${linhasMistas})`);
}

// (7) caso à mão: 3 times, 3 sims. ptsAtPos[pos] = pontos de quem ficou em pos, por sim.
console.log('\n(7) caso montado à mão');
const pp = E.buildPtsPos([[10, 10, 12], [9, 10, 7], [3, 4, 7]], 3);
check(pp.lo === 3 && pp.hi === 12 && pp.nS === 3, 'lo = 3, hi = 12');
check(JSON.stringify(pp.m[10 - 3]) === '[2,1,0]' && JSON.stringify(pp.m[7 - 3]) === '[0,1,1]' && JSON.stringify(pp.m[12 - 3]) === '[1,0,0]',
  '10 pts: 2× em 1º e 1× em 2º · 7 pts: 1× em 2º e 1× em 3º · 12 pts: 1× em 1º');
const ax = E.ptsPosAxis(pp);
check(JSON.stringify(ax.axis) === '[12,null,10,9,null,7,null,4,3]', `eixo ${JSON.stringify(ax.axis)}`);
check(ax.tot[10 - 3] === 3 && ax.tot[7 - 3] === 2 && ax.tot[5 - 3] === 0, 'totais: 10 pts = 3 casos, 7 pts = 2, 5 pts = 0');
check(E.ptsPosPctl(pp, 0, 0.5) === 10 && E.ptsPosPctl(pp, 1, 0.5) === 9 && E.ptsPosPctl(pp, 2, 0.5) === 4 && E.ptsPosPctl(pp, 0, 0.9) === 12 && E.ptsPosPctl(pp, 2, 0.1) === 3,
  'percentis: medianas 10 / 9 / 4, p90 do 1º = 12, p10 do 3º = 3');
check(E.buildPtsPos([[], []], 0) === null, 'sem simulações devolve null (a tela não monta o bloco)');

console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
