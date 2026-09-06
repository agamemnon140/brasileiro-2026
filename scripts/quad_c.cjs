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
const { runWithEngine } = require('./engine.cjs');

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
  applyQuadCAuto([]);
  return { top8, gA, gB, ninth, labels, groups, nGames, base, grp, grpIgnore, badP, groupsBad, fin, finIda, finPen, nNull, groupsNull, nRes: full.length };
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

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
