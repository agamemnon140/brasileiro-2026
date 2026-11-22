// Valida a 2ª fase REAL da Série C (v4.81): results.json.quad_c → applyQuadCAuto → QUAD_C_AUTO
// → grupos, placares e final REAIS dentro do simMC da C.
//
// O que se pinça aqui não se denuncia sozinho na UI: um quadrangular plausível-e-errado (grupo
// presumido no lugar do oficial, placar real ignorado, final editada sobrepondo a real) é
// invisível; uma probabilidade que tinha de ser 100 ou 0 e não é, não.
//
// A liga é fechada de forma determinística (SC_RES + o resto da fixture como 1x0 do mandante),
// então o top-8 é fixo e os grupos sintéticos podem ser construídos com a regra do app.
// Placares sintéticos: g[i] vence g[j] (i < j) em casa e fora por 2x0 → 1º e 2º de cada grupo
// são determinísticos (18 e 12 pts) e q4 tem de dar 100/100/0/0.
//
// v4.92: a final chega em DOIS formatos — fase 'FINAL' (passe do PDF) e "GRUPO D" (a API de
// jogos da CBF lista a decisão como mais um grupo: fase 'Q', grupo 'D', rodadas 1 e 2). Este
// harness só testava o primeiro, e a final real de 2026, que veio no segundo, ficou um mês
// ignorada com tudo verde aqui. Agora os dois têm de dar o mesmo resultado, e há um teste
// sobre o results.json de verdade: se a final está lá inteira, o campeão sai com 100%.
const fs = require('fs');
const path = require('path');
const { runWithEngine } = require('./engine.cjs');
let LIVE = {};
try { LIVE = JSON.parse(fs.readFileSync(process.env.RESULTS || path.join(__dirname, '..', 'results.json'), 'utf8')); } catch (e) {}
const LIVE_QUAD = Array.isArray(LIVE.quad_c) ? LIVE.quad_c : [];
const LIVE_C = (LIVE.results || []).filter(r => r && r.serie === 'C').map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));

const NS = parseInt(process.env.NS || '400', 10);

const src = `
  const T = parseTab(SC_TAB, SC_NM, SC_DATES);
  const seen = new Set(SC_RES.map(r => r.c + '|' + r.f));
  const full = SC_RES.slice();
  for (const g of T) if (!seen.has(g.casa + '|' + g.fora)) { seen.add(g.casa + '|' + g.fora); full.push({ c: g.casa, f: g.fora, gc: 1, gf: 0, r: g.rodada }); }
  const times = Object.keys(SC_RANKING);
  const st = {}; times.forEach(t => st[t] = { P: 0, V: 0, GP: 0, GC: 0 });
  full.forEach(r => { const c = r.c, f = r.f; if (!st[c] || !st[f]) return; st[c].GP += r.gc; st[c].GC += r.gf; st[f].GP += r.gf; st[f].GC += r.gc; if (r.gc > r.gf) { st[c].V++; st[c].P += 3; } else if (r.gc === r.gf) { st[c].P++; st[f].P++; } else { st[f].V++; st[f].P += 3; } });
  const cl = times.map(t => ({ t, ...st[t], SG: st[t].GP - st[t].GC })).sort((a, b) => b.P - a.P || b.V - a.V || b.SG - a.SG || b.GP - a.GP);
  const top8 = cl.slice(0, 8).map(c => c.t);
  const gA = [top8[0], top8[3], top8[4], top8[7]], gB = [top8[1], top8[2], top8[5], top8[6]];
  const rows = [];
  const mkG = (g, letra) => { let rod = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if (i === j) continue; rows.push({ fase: 'Q', grupo: letra, rodada: 1 + (rod++ % 6), data: '05/09', casa: g[i], fora: g[j], gc: i < j ? 2 : 0, gf: i < j ? 0 : 2, pen_c: null, pen_f: null }); } };
  mkG(gA, 'B'); mkG(gB, 'C');
  const cfg = { ...DEFAULT_CFG, drift: 15 };
  const runC = (opts) => { const P = {}; simMC(times, SC_RANKING, T, full, cfg, 'C', ${NS}, 'conservador', false, opts).probs.forEach(p => P[p.time] = p); return P; };

  applyQuadCAuto([]);
  const base = runC();
  applyQuadCAuto(rows);
  const labels = QUAD_C_AUTO.labels, groups = QUAD_C_AUTO.groups, nGames = QUAD_C_AUTO.n;
  const grp = runC();
  const grpIgnore = runC({ ignoreUser: true });
  // grupos que NÃO são o top-8 (9º no lugar do 8º): o guard tem de manter o presumido
  const ninth = cl[8].t;
  const bad = rows.map(r => ({ ...r, casa: r.casa === top8[7] ? ninth : r.casa, fora: r.fora === top8[7] ? ninth : r.fora }));
  applyQuadCAuto(bad);
  const groupsBad = QUAD_C_AUTO.groups;
  const badP = runC();
  // final completa: ida gB[0] 0x1 gA[0]; volta gA[0] 2x0 gB[0] → gA[0] campeão
  const ida = { fase: 'FINAL', grupo: null, rodada: 1, data: '18/10', casa: gB[0], fora: gA[0], gc: 0, gf: 1, pen_c: null, pen_f: null };
  const volta = { fase: 'FINAL', grupo: null, rodada: 2, data: '25/10', casa: gA[0], fora: gB[0], gc: 2, gf: 0, pen_c: null, pen_f: null };
  applyQuadCAuto([...rows, ida, volta]);
  const fin = runC();
  // só a ida real (1x0 fora para gA[0]): a volta é simulada
  applyQuadCAuto([...rows, ida]);
  const finIda = runC();
  // final empatada no agregado, decidida nos pênaltis do PDF para gB[0]
  const voltaEmp = { ...volta, gc: 0, gf: 1, pen_c: 3, pen_f: 4 };
  applyQuadCAuto([...rows, ida, voltaEmp]);
  const finPen = runC();
  // jogo com data futura/sem placar: gc null não conta como disputado
  applyQuadCAuto([{ ...rows[0], gc: null, gf: null }, ...rows.slice(1)]);
  const nNull = QUAD_C_AUTO.n, groupsNull = QUAD_C_AUTO.groups;
  // v4.92 — a MESMA final no formato do GWEB: fase 'Q', grupo 'D', rodadas 1 e 2
  const comoD = r => ({ ...r, fase: 'Q', grupo: 'D' });
  applyQuadCAuto([...rows, comoD(ida), comoD(volta)]);
  const gweb = { n: QUAD_C_AUTO.n, finalG: QUAD_C_AUTO.finalG.slice(), labels: QUAD_C_AUTO.labels, pernas: Object.keys(QUAD_C_AUTO.final).length,
    jogoFantasma: !!(QUAD_C_AUTO.games[ida.casa + '>' + ida.fora] || QUAD_C_AUTO.games[volta.casa + '>' + volta.fora]),
    ehFinal: quadCIsFinal(comoD(ida)), naoEhFinal: quadCIsFinal(rows[0]) };
  const finD = runC();
  applyQuadCAuto([...rows, comoD(ida)]);
  const finDIda = runC();
  // "grupo" de 2 clubes do MESMO quadrangular não é final: fica como estava (jogo de grupo)
  applyQuadCAuto([...rows, { ...comoD(ida), casa: gA[0], fora: gA[1] }]);
  const mesmo = { finalG: QUAD_C_AUTO.finalG.slice(), pernas: Object.keys(QUAD_C_AUTO.final).length, labels: QUAD_C_AUTO.labels };
  // dados ao vivo: o quad_c do results.json como ele É, sobre a liga real
  let live = null;
  const LQ = ${JSON.stringify(LIVE_QUAD)}, LC = ${JSON.stringify(LIVE_C)};
  if (LQ.length) {
    applyQuadCAuto(LQ);
    const pernas = LQ.filter(r => quadCIsFinal(r) && r.gc != null);
    live = { n: QUAD_C_AUTO.n, grupos: !!QUAD_C_AUTO.groups, finalG: QUAD_C_AUTO.finalG.slice(), pernas: pernas.map(r => ({ casa: r.casa, fora: r.fora, gc: +r.gc, gf: +r.gf, pen_c: r.pen_c, pen_f: r.pen_f, rodada: +r.rodada })),
      nGrupo: LQ.filter(r => !quadCIsFinal(r) && r.gc != null).length };
    const P = {};
    simMC(times, SC_RANKING, T, mergeRes(SC_RES, LC), cfg, 'C', ${NS}, 'conservador', false).probs.forEach(p => P[p.time] = p);
    live.P = P;
  }
  applyQuadCAuto([]);
  return { top8, gA, gB, ninth, labels, groups, nGames, base, grp, grpIgnore, badP, groupsBad, fin, finIda, finPen, nNull, groupsNull, gweb, finD, finDIda, mesmo, live, nRes: full.length };
`;
const E = runWithEngine(src);

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const sum = (P, k) => Object.values(P).reduce((s, p) => s + (p[k] || 0), 0);
const same = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

console.log(`liga fechada com ${E.nRes} jogos · top-8: ${E.top8.join(', ')} · NS=${NS}`);

console.log('\n(1) applyQuadCAuto: composição dos grupos a partir da fixture');
check(E.labels && E.labels.join('') === 'BC', `letras da CBF em ordem (deu ${E.labels && E.labels.join(',')})`);
check(E.groups && same(E.groups[0], E.gA), 'grupo B da CBF → grupo A do app (1º,4º,5º,8º)');
check(E.groups && same(E.groups[1], E.gB), 'grupo C da CBF → grupo B do app (2º,3º,6º,7º)');
check(E.nGames === 24, `24 jogos com placar (deu ${E.nGames})`);
check(E.nNull === 23 && E.groupsNull, `jogo sem placar entra na composição mas não conta como disputado (deu ${E.nNull})`);

console.log('\n(2) MC sem quad_c: estrutura fechada (baseline)');
check(near(sum(E.base, 'q4'), 400), `Σq4 = 400 (deu ${sum(E.base, 'q4').toFixed(3)})`);
check(near(sum(E.base, 'qChamp'), 100), `ΣqChamp = 100 (deu ${sum(E.base, 'qChamp').toFixed(3)})`);

console.log('\n(3) MC com os 24 placares reais: acesso determinístico');
for (const t of [E.gA[0], E.gA[1], E.gB[0], E.gB[1]]) check(near(E.grp[t].q4, 100), `q4(${t}) = 100 (deu ${E.grp[t].q4.toFixed(3)})`);
for (const t of [E.gA[2], E.gA[3], E.gB[2], E.gB[3]]) check(near(E.grp[t].q4, 0), `q4(${t}) = 0 (deu ${E.grp[t].q4.toFixed(3)})`);
check(near(sum(E.grp, 'q4'), 400), `Σq4 = 400 (deu ${sum(E.grp, 'q4').toFixed(3)})`);
check(near(E.grp[E.gA[0]].qChamp + E.grp[E.gB[0]].qChamp, 100), `final entre os 1ºs: qChamp(${E.gA[0]}) + qChamp(${E.gB[0]}) = 100 (deu ${(E.grp[E.gA[0]].qChamp + E.grp[E.gB[0]].qChamp).toFixed(3)})`);
check([E.gA[0], E.gA[1], E.gB[0], E.gB[1]].every(t => near(E.grpIgnore[t].q4, 100)), 'ignoreUser (Evolução) NÃO apaga o placar real: q4 continua 100 nos 4');

console.log('\n(4) guard: grupos da CBF que não são o top-8 simulado → vale o presumido');
check(E.groupsBad && E.groupsBad.flat().includes(E.ninth), `fixture "errada" inclui o 9º (${E.ninth})`);
check(near(E.badP[E.ninth].q4, 0), `q4(${E.ninth}) = 0 (deu ${E.badP[E.ninth].q4.toFixed(3)})`);
check(near(sum(E.badP, 'q4'), 400), `Σq4 = 400 (deu ${sum(E.badP, 'q4').toFixed(3)})`);
check(E.top8.some(t => E.badP[t].q4 > 0 && E.badP[t].q4 < 100), 'quadrangular volta a ser simulado (algum q4 estritamente entre 0 e 100)');

console.log('\n(5) final REAL');
check(near(E.fin[E.gA[0]].qChamp, 100), `ida+volta reais: qChamp(${E.gA[0]}) = 100 (deu ${E.fin[E.gA[0]].qChamp.toFixed(3)})`);
check(near(sum(E.fin, 'qChamp'), 100), `ΣqChamp = 100 (deu ${sum(E.fin, 'qChamp').toFixed(3)})`);
check(E.finIda[E.gA[0]].qChamp > 50 && E.finIda[E.gA[0]].qChamp < 100, `só a ida real (1x0 fora): 50 < qChamp(${E.gA[0]}) < 100 (deu ${E.finIda[E.gA[0]].qChamp.toFixed(2)})`);
check(E.finIda[E.gB[0]].qChamp > 0, `só a ida real: qChamp(${E.gB[0]}) > 0 (deu ${E.finIda[E.gB[0]].qChamp.toFixed(2)})`);
check(near(sum(E.finIda, 'qChamp'), 100), `ΣqChamp = 100 (deu ${sum(E.finIda, 'qChamp').toFixed(3)})`);
check(near(E.finPen[E.gB[0]].qChamp, 100), `agregado 1x1, pênaltis 3x4 do PDF: qChamp(${E.gB[0]}) = 100 (deu ${E.finPen[E.gB[0]].qChamp.toFixed(3)})`);

console.log('\n(6) final no formato do GWEB ("GRUPO D": fase Q, grupo D, rodadas 1 e 2)');
check(E.gweb.finalG.join('') === 'D' && E.gweb.pernas === 2, `grupo D reconhecido como final, 2 pernas (finalG = [${E.gweb.finalG.join(',')}], pernas = ${E.gweb.pernas})`);
check(E.gweb.n === 24 && !E.gweb.jogoFantasma, `as pernas não contam como jogo de grupo (n = ${E.gweb.n})`);
check(E.gweb.labels && E.gweb.labels.join('') === 'BC', 'os quadrangulares seguem sendo B e C');
check(E.gweb.ehFinal && !E.gweb.naoEhFinal, 'quadCIsFinal: linha do grupo D sim, linha de quadrangular não');
check(near(E.finD[E.gA[0]].qChamp, 100) && near(sum(E.finD, 'qChamp'), 100), `ida+volta reais: qChamp(${E.gA[0]}) = 100, igual ao formato do PDF (deu ${E.finD[E.gA[0]].qChamp.toFixed(3)})`);
check(E.finDIda[E.gA[0]].qChamp > 50 && E.finDIda[E.gA[0]].qChamp < 100, `só a ida real: 50 < qChamp(${E.gA[0]}) < 100 (deu ${E.finDIda[E.gA[0]].qChamp.toFixed(2)})`);
check(E.mesmo.finalG.length === 0 && E.mesmo.pernas === 0 && E.mesmo.labels && E.mesmo.labels.join('') === 'BC', '"grupo" de 2 clubes do MESMO quadrangular não vira final');

console.log('\n(7) results.json real');
if (!E.live) console.log('  skip sem quad_c no results.json');
else {
  const L = E.live;
  check(L.grupos, 'os dois quadrangulares são reconhecidos');
  check(L.n === L.nGrupo, `QUAD_C_AUTO.n = jogos de grupo com placar (${L.n} = ${L.nGrupo})`);
  check(L.n <= 24, `no máximo 24 jogos de grupo (deu ${L.n})`);
  if (L.pernas.length === 2) {
    // campeão pelo agregado (ou pelos pênaltis da volta), calculado aqui, sem nome fixo
    const gols = {};
    L.pernas.forEach(p => { gols[p.casa] = (gols[p.casa] || 0) + p.gc; gols[p.fora] = (gols[p.fora] || 0) + p.gf; });
    const [x, y] = Object.keys(gols);
    const volta = L.pernas.slice().sort((a, b) => a.rodada - b.rodada)[1];
    const camp = gols[x] !== gols[y] ? (gols[x] > gols[y] ? x : y)
      : (volta.pen_c != null && volta.pen_f != null ? (volta.pen_c > volta.pen_f ? volta.casa : volta.fora) : null);
    console.log(`      final: ${L.pernas.map(p => `${p.casa} ${p.gc}x${p.gf} ${p.fora}`).join(' · ')} → ${camp || 'empate sem pênaltis gravados'}`);
    if (camp) {
      check(near(L.P[camp].qChamp, 100), `final completa: qChamp(${camp}) = 100 (deu ${L.P[camp].qChamp.toFixed(3)})`);
      check(near(sum(L.P, 'qChamp'), 100), `ΣqChamp = 100 (deu ${sum(L.P, 'qChamp').toFixed(3)})`);
    }
  } else console.log(`      final ainda incompleta no results.json (${L.pernas.length} perna(s)) — título segue simulado`);
}

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
