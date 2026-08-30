// Valida a "máscara de fases" da aba Evolução (v4.80): opts.koMask (Série D), opts.cbMask
// (Copa do Brasil) e opts.ignoreUser + resultados truncados por rodada (A/B/C).
//
// O que se pinça aqui não se denuncia sozinho na UI: uma curva plausível-e-errada (fase
// "mascarada" que ainda vaza o vencedor real, ou o contrário) é invisível; uma soma de
// probabilidade que não fecha, ou um eliminado real com chance > 0 depois da fase dele
// ter entrado, não.
//
// Invariantes:
//  (1) D: para QUALQUER máscara, o bracket é fechado — Σf3=3200, Σoit=1600, Σqf=800,
//      Σsf=400, Σfin=200, Σac=600, Σch=100 (em % somados sobre os 96 clubes).
//  (2) D: a máscara morde na fase certa — perdedor real da 2ª fase tem f3>0 sem máscara e
//      f3=0 quando B entra; perdedor real da 3ª tem oit>0 com {B} e oit=0 com {B,C};
//      perdedor real das oitavas (ko_d) tem qf>0 com {B,C} e qf=0 com {B,C,D}.
//  (3) D: koMask=null é o comportamento antigo — todo eliminado de sdEliminatedSet tem ac=0.
//  (4) CB: Σr16=1600, Σqf=800, Σsf=400, Σfin=200, Σch=100 em qualquer máscara; sem máscara
//      algum eliminado real da R32 chega às oitavas; com {R32} os 16 reais têm r16=100 e os
//      demais 0; perdedor real de oitavas decidida tem qf=0 com null e qf>0 com {R32}.
//  (5) A/B/C: com res truncado em N rodadas, mediaPts de todo time fica em [pontos reais
//      após N, 3·nR] (jogo simulado só soma) e BC_USER sai vazio com ignoreUser.
const fs = require('fs');
const path = require('path');
const { runWithEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
let results = {};
try { results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results.json'), 'utf8')); } catch (e) {}
const KO = Array.isArray(results.ko_d) ? results.ko_d : [];
const CBR = Array.isArray(results.cb) ? results.cb : [];

const src = `
  applySdKoAuto(${JSON.stringify(KO)});
  applyCbAuto(${JSON.stringify(CBR)});
  const cfg = { ...DEFAULT_CFG, drift: 15 };
  const NS = ${NS};
  const byTeam = r => { const P = {}; r.probs.forEach(p => P[p.time] = p); return P; };
  const runD = mask => byTeam(simMC_D(cfg, NS, 'conservador', false, undefined, { koMask: mask }));
  const D = { none: runD(new Set()), B: runD(new Set(['B'])), BC: runD(new Set(['B', 'C'])), BCD: runD(new Set(['B', 'C', 'D'])), all: runD(null) };
  const runCB = mask => byTeam(simMC_CB(cfg, NS, 'conservador', false, {}, {}, { cbMask: mask }));
  const C = { none: runCB(new Set()), R32: runCB(new Set(['R32'])), all: runCB(null) };
  const elim = [...sdEliminatedSet()];
  // perdedores reais por fase da D
  const f2L = SD_F2_REAL.filter(t => t.w).map(t => t.w === t.a ? t.b : t.a);
  const f3L = SD_F3_REAL.filter(t => t.vA != null && t.vB != null).map(t => { const r = SD_KO_REAL[sdKoKey(t.a, t.b)]; return r ? (r.w === t.a ? t.b : t.a) : null; }).filter(Boolean);
  const oitL = Object.keys(SD_KO_CODES).filter(c => c[0] === 'D').map(c => { const p = SD_KO_CODES[c]; const r = SD_KO_AUTO[sdKoKey(p.a, p.b)]; return r ? (r.w === p.a ? p.b : p.a) : null; }).filter(Boolean);
  const oitDecidedAll = Object.keys(SD_KO_CODES).filter(c => c[0] === 'D').length === 8 && oitL.length === 8;
  // oitavas da CB decididas no agregado (perdedor certo, sem pênaltis)
  const cbL = CB_R16_PAIRS.map((p, idx) => { const u = cbR16Eff(CB_USER.r16, CB_AUTO.r16, idx); if (!u || u.g1a == null || u.g1b == null || u.g2a == null || u.g2b == null) return null; const aA = u.g1a + u.g2a, aB = u.g1b + u.g2b; return aA > aB ? p[1] : aB > aA ? p[0] : null; }).filter(Boolean);
  // A/B/C truncado por rodada
  const L = {};
  for (const [k, rk, tab, nm, dt, res, meta] of [['A', SA_RANKING, SA_TAB, SA_NM, SA_DATES, SA_RES, SA_META], ['B', SB_RANKING, SB_TAB, SB_NM, SB_DATES, SB_RES, SB_META], ['C', SC_RANKING, SC_TAB, SC_NM, SC_DATES, SC_RES, SC_META]]) {
    const times = Object.keys(rk), T = parseTab(tab, nm, dt);
    const maxR = res.reduce((m, r) => Math.max(m, r.r || 0), 0);
    L[k] = { nR: meta.nR, pts: [] };
    for (const N of [0, Math.floor(maxR / 2), maxR]) {
      const sub = res.filter(r => r.r >= 1 && r.r <= N);
      const real = {}; times.forEach(t => real[t] = 0);
      for (const r of sub) { if (real[r.c] == null || real[r.f] == null) continue; if (r.gc > r.gf) real[r.c] += 3; else if (r.gc < r.gf) real[r.f] += 3; else { real[r.c]++; real[r.f]++; } }
      const P = byTeam(simMC(times, rk, T, sub, cfg, k, NS, 'conservador', false, { ignoreUser: true }));
      L[k].pts.push({ N, nres: sub.length, rows: times.map(t => ({ t, real: real[t], media: P[t].mediaPts })) });
    }
  }
  return { D, C, elim, f2L, f3L, oitL, oitDecidedAll, cbL, L, r16set: [...CB_R16_SET], cbTeams: CB_TEAMS, sdTimes: SD_TIMES, bcUser: BC_USER, nKo: Object.keys(SD_KO_CODES).length, nCb16: Object.keys(CB_AUTO.r16).length };
`;
const E = runWithEngine(src);

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const sum = (P, k) => Object.values(P).reduce((s, p) => s + (p[k] || 0), 0);

console.log(`ko_d: ${E.nKo} códigos · cb R16: ${E.nCb16} confrontos · NS=${NS}`);

// (1) estrutura fechada em qualquer máscara
console.log('\n(1) Série D: bracket fechado para toda máscara');
for (const mk of ['none', 'B', 'BC', 'BCD', 'all']) {
  const P = E.D[mk];
  for (const [k, tot] of [['f3', 3200], ['oit', 1600], ['qf', 800], ['sf', 400], ['fin', 200], ['ac', 600], ['ch', 100]]) {
    const s = sum(P, k);
    check(near(s, tot), `mask=${mk}: Σ${k} = ${tot} (deu ${s.toFixed(3)})`);
  }
}

// (2) a máscara morde na fase certa
console.log('\n(2) Série D: a máscara morde na fase certa');
check(E.f2L.length === 32, `32 perdedores reais da 2ª fase (deu ${E.f2L.length})`);
const t2 = E.f2L[0];
check(E.D.none[t2].f3 > 0, `${t2} (perdeu a 2ª fase): f3 > 0 sem máscara (deu ${E.D.none[t2].f3.toFixed(2)})`);
check(E.f2L.every(t => E.D.B[t].f3 === 0), 'todo perdedor real da 2ª fase: f3 = 0 com {B}');
check(E.f2L.every(t => E.D.all[t].f3 === 0), 'todo perdedor real da 2ª fase: f3 = 0 com null');
if (E.f3L.length) {
  const t3 = E.f3L[0];
  check(E.D.B[t3].oit > 0, `${t3} (perdeu a 3ª fase): oit > 0 com {B} (deu ${E.D.B[t3].oit.toFixed(2)})`);
  check(E.f3L.every(t => E.D.BC[t].oit === 0), `todo perdedor real da 3ª fase (${E.f3L.length}): oit = 0 com {B,C}`);
}
if (E.oitDecidedAll) {
  const t4 = E.oitL[0];
  check(E.D.BC[t4].qf > 0, `${t4} (perdeu as oitavas): qf > 0 com {B,C} (deu ${E.D.BC[t4].qf.toFixed(2)})`);
  check(E.oitL.every(t => E.D.BCD[t].qf === 0), 'todo perdedor real das oitavas: qf = 0 com {B,C,D}');
} else console.log('  skip oitavas do ko_d incompletas — sub-check pulado');

// (3) null = legado
console.log('\n(3) Série D: koMask=null reproduz o comportamento antigo');
check(E.elim.length > 0 && E.elim.every(t => E.D.all[t].ac === 0), `todo eliminado de sdEliminatedSet (${E.elim.length}) tem ac = 0 com null`);

// (4) Copa do Brasil
console.log('\n(4) Copa do Brasil: cbMask');
const r16 = new Set(E.r16set);
for (const mk of ['none', 'R32', 'all']) {
  const P = E.C[mk];
  for (const [k, tot] of [['r16', 1600], ['qf', 800], ['sf', 400], ['fin', 200], ['ch', 100]]) {
    const s = sum(P, k);
    check(near(s, tot), `mask=${mk}: Σ${k} = ${tot} (deu ${s.toFixed(3)})`);
  }
}
const outR32 = E.cbTeams.filter(t => !r16.has(t));
check(outR32.some(t => E.C.none[t].r16 > 0), 'sem máscara: algum eliminado real da R32 chega às oitavas');
check(E.cbTeams.every(t => near(E.C.R32[t].r16, r16.has(t) ? 100 : 0)), 'com {R32}: r16 = 100 para os 16 reais e 0 para os demais');
if (E.cbL.length) {
  check(E.cbL.every(t => E.C.all[t].qf === 0), `perdedores reais de oitavas decididas (${E.cbL.length}): qf = 0 com null`);
  check(E.cbL.every(t => E.C.R32[t].qf > 0), 'os mesmos: qf > 0 com {R32} (oitavas simuladas)');
} else console.log('  skip sem oitavas da CB decididas no agregado — sub-check pulado');

// (5) A/B/C truncado
console.log('\n(5) Séries A/B/C: resultados truncados por rodada');
for (const k of ['A', 'B', 'C']) {
  for (const p of E.L[k].pts) {
    const bad = p.rows.filter(r => !(r.media >= r.real - 1e-6 && r.media <= 3 * E.L[k].nR + 1e-6));
    check(!bad.length, `Série ${k} N=${p.N} (${p.nres} jogos): mediaPts ∈ [reais, 3·nR] para todos${bad.length ? ' — ' + bad.slice(0, 3).map(r => `${r.t}: ${r.media.toFixed(1)} < ${r.real}`).join('; ') : ''}`);
  }
  check(E.L[k].pts[0].nres === 0, `Série ${k} N=0: nenhum jogo real (deu ${E.L[k].pts[0].nres})`);
}
check(Object.keys(E.bcUser.B).length === 0 && Object.keys(E.bcUser.C.games).length === 0 && Object.keys(E.bcUser.C.final).length === 0, 'BC_USER vazio após simMC com ignoreUser');

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
