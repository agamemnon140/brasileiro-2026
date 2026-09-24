// Copa do Brasil — quartas em diante (v4.84) e "Próxima fase" do 1 Sim de B/C.
//
// (1) applyCbAuto monta CB_AUTO.ko a partir do results.json.cb: quartas com 4 confrontos entre
//     os 8 vencedores reais das oitavas, semis com sfLinks resolvidos quando os nomes já constam.
// (2) cbKoPlan só entrega o chaveamento real quando os 8 das quartas são os vencedores simulados
//     das oitavas; com máscara, a estrutura fica e o placar sai; com vencedores "errados", null.
// (3) simMC_CB com tudo real: perdedor de quarta decidida tem sf = 0, semifinalista sf = 100,
//     somas por fase fecham; com máscara {R32,R16} os mesmos perdedores voltam a ter sf > 0.
// (4) simUnica(B/C).fase2 (simFase2BC) fecha estruturalmente: 2 confrontos/4 acessos na B;
//     2 grupos × 12 jogos, 4 acessos e campeão entre os líderes na C, placares reais travados.
const fs = require('fs');
const path = require('path');
const { runWithEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
let results = {};
// RESULTS=<caminho> aponta para outro results.json (fixture com quartas/semis para testar o caminho real).
try { results = JSON.parse(fs.readFileSync(process.env.RESULTS || path.join(__dirname, '..', 'results.json'), 'utf8')); } catch (e) {}
const CBR = Array.isArray(results.cb) ? results.cb : [];
const QC = Array.isArray(results.quad_c) ? results.quad_c : [];
// liga de B/C = embutido + results.json (como no app: allRes), senão o top-8 simulado da C nunca
// bate com os grupos reais do quad_c e a fixture do 1 Sim cai no presumido.
const RL = (k) => (Array.isArray(results.results) ? results.results : []).filter(r => r && r.serie === k).map(r => ({ c: r.casa, f: r.fora, gc: Number(r.gc), gf: Number(r.gf), r: Number(r.rodada) }));

const src = `
  applyCbAuto(${JSON.stringify(CBR)});
  applyQuadCAuto(${JSON.stringify(QC)});
  const cfg = { ...DEFAULT_CFG, drift: 15 };
  const NS = ${NS};
  const byTeam = r => { const P = {}; r.probs.forEach(p => P[p.time] = p); return P; };
  const KO = CB_AUTO.ko;
  // vencedores REAIS das oitavas (agregado decidido)
  const w16 = CB_R16_PAIRS.map((p, idx) => { const u = CB_AUTO.r16[idx]; if (!u || u.g1a == null || u.g1b == null || u.g2a == null || u.g2b == null) return null; const aA = u.g1a + u.g2a, aB = u.g1b + u.g2b; return aA > aB ? p[0] : aB > aA ? p[1] : null; }).filter(Boolean);
  const tieW = t => { const s = t.sc || {}; if (s.g1a == null || s.g2a == null) return null; const aa = s.g1a + s.g2a, ab = s.g1b + s.g2b; return aa > ab ? t.a : ab > aa ? t.b : t.pen === 'A' ? t.a : t.pen === 'B' ? t.b : null; };
  const qfDecided = KO.QF.map(t => ({ w: tieW(t), l: tieW(t) ? (tieW(t) === t.a ? t.b : t.a) : null })).filter(x => x.w);
  const plan = cbKoPlan(w16, null);
  const planMasked = cbKoPlan(w16, new Set(['R32', 'R16']));
  const planWrong = cbKoPlan(CB_TEAMS.filter(t => !w16.includes(t)).slice(0, 16), null);
  const all = byTeam(simMC_CB(cfg, NS, 'conservador', false, {}, {}, null));
  const r16only = byTeam(simMC_CB(cfg, NS, 'conservador', false, {}, {}, { cbMask: new Set(['R32', 'R16']) }));
  const U = {};
  for (const [k, rk, tab, nm, dt, res] of [['B', SB_RANKING, SB_TAB, SB_NM, SB_DATES, mergeRes(SB_RES, ${JSON.stringify(RL('B'))})], ['C', SC_RANKING, SC_TAB, SC_NM, SC_DATES, mergeRes(SC_RES, ${JSON.stringify(RL('C'))})]]) {
    U[k] = simUnica(Object.keys(rk), rk, parseTab(tab, nm, dt), res, cfg, k, 'conservador', false).fase2;
  }
  return { KO, sfLinks: CB_AUTO.sfLinks, w16, qfDecided, plan, planMasked, planWrong, all, r16only, U, cbTeams: CB_TEAMS, quadN: QUAD_C_AUTO.n, quadGroups: QUAD_C_AUTO.groups };
`;
const E = runWithEngine(src);

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const sum = (P, k) => Object.values(P).reduce((s, p) => s + (p[k] || 0), 0);

console.log(`(1) CB_AUTO.ko a partir do results.json.cb (${CBR.length} linha(s))`);
const hasQF = E.KO.QF.length > 0;
if (hasQF) {
  check(E.KO.QF.length === 4, `4 confrontos de quartas (deu ${E.KO.QF.length})`);
  const teams = E.KO.QF.flatMap(t => [t.a, t.b]);
  check(new Set(teams).size === 8, '8 times distintos nas quartas');
  check(teams.every(t => E.w16.includes(t)), `todos os 8 são vencedores reais das oitavas (oitavas decididas: ${E.w16.length})`);
  check(E.KO.QF.every(t => t.a && t.b && t.gr), 'cada confronto tem a, b e GR');
  if (E.KO.SF.length) {
    check(E.KO.SF.length === 2, `2 semis (deu ${E.KO.SF.length})`);
    check(Array.isArray(E.sfLinks) && E.sfLinks.length === 2 && new Set(E.sfLinks.flat()).size === 4, `sfLinks resolvidos: ${JSON.stringify(E.sfLinks)}`);
    check(E.KO.SF.every(s => E.qfDecided.some(q => q.w === s.a) && E.qfDecided.some(q => q.w === s.b)), 'os semifinalistas são os vencedores das quartas decididas');
  } else console.log('  skip semis ainda sem nomes no results.json');
} else console.log('  skip results.json.cb sem quartas — só oitavas (formato anterior)');

console.log('\n(2) cbKoPlan');
if (hasQF) {
  check(!!E.plan.qf, 'vencedores reais das oitavas → chaveamento real das quartas');
  check(E.plan.qf.every(t => Object.keys(t.sc).length > 0 || t.gr), 'sem máscara: placares reais presentes (ou confronto ainda por jogar)');
  check(!!E.planMasked.qf && E.planMasked.qf.every(t => Object.keys(t.sc).length === 0 && t.pen == null), 'com máscara {R32,R16}: mesmo chaveamento, placares e pênaltis removidos');
  check(E.planWrong.qf === null && E.planWrong.sfLinks === null, 'vencedores divergentes → null (sorteio, como antes)');
  if (E.sfLinks) check(E.planMasked.sfLinks && E.planMasked.sfLinks.length === 2, 'sfLinks valem também com máscara (estrutura)');
} else console.log('  skip');

console.log('\n(3) simMC_CB');
for (const [k, tot] of [['r16', 1600], ['qf', 800], ['sf', 400], ['fin', 200], ['ch', 100]]) {
  check(near(sum(E.all, k), tot), `mask=null: Σ${k} = ${tot} (deu ${sum(E.all, k).toFixed(3)})`);
  check(near(sum(E.r16only, k), tot), `mask={R32,R16}: Σ${k} = ${tot} (deu ${sum(E.r16only, k).toFixed(3)})`);
}
if (E.qfDecided.length) {
  check(E.qfDecided.every(q => E.all[q.l].sf === 0), `perdedores reais de quartas decididas (${E.qfDecided.length}): sf = 0 com tudo real`);
  check(E.qfDecided.every(q => near(E.all[q.w].sf, 100)), 'vencedores reais das quartas: sf = 100 com tudo real');
  check(E.qfDecided.every(q => E.r16only[q.l].sf > 0), 'os mesmos perdedores: sf > 0 com {R32,R16} (quartas simuladas no chaveamento real)');
  if (E.sfLinks) {
    // com tudo real, cada semi só pode cruzar os pares definidos: fin = 0 fora do link
    const sfPairs = E.KO.SF.map(s => [s.a, s.b].sort().join('|'));
    const finPairs = new Set();
    for (const t of E.qfDecided.map(q => q.w)) for (const m of (E.all[t].matchups.sf || [])) if (m.pct > 0) finPairs.add([t, m.adv].sort().join('|'));
    check([...finPairs].every(p => sfPairs.includes(p)), `semis simuladas só nos pares oficiais (${[...finPairs].join('; ')})`);
  }
} else console.log('  skip quartas ainda não decididas');

console.log('\n(4) simUnica.fase2 — simFase2BC');
const B = E.U.B;
check(B && B.ties.length === 2 && B.sobem.length === 4 && new Set(B.sobem).size === 4, 'B: 2 confrontos, 4 acessos distintos');
check(B && B.ties.every(t => [t.a, t.b].includes(t.w)), 'B: vencedor de cada confronto é um dos dois');
check(B && B.ties.every(t => t.aggA === t.ida.gf + t.volta.gc && t.aggB === t.ida.gc + t.volta.gf && t.ida.casa === t.b && t.volta.casa === t.a), 'B: ida na casa do pior colocado, volta na do melhor, agregado consistente');
check(B && B.ties.every(t => (t.aggA !== t.aggB) === !t.pen), 'B: pênaltis exatamente quando o agregado empata');
const C = E.U.C;
check(C && C.groups.length === 2 && C.groups.every(g => g.games.length === 12 && g.standing.length === 4 && g.teams.length === 4), 'C: 2 grupos × 12 jogos × 4 times');
check(C && C.sobem.length === 4 && new Set(C.sobem).size === 4 && C.groups.every(g => g.standing.slice(0, 2).every(r => C.sobem.includes(r.time))), 'C: 4 acessos = top-2 de cada grupo');
check(C && [C.groups[0].standing[0].time, C.groups[1].standing[0].time].includes(C.campeao) && C.final.w === C.campeao, 'C: campeão é um dos líderes de grupo e vence a final');
check(C && C.groups.every(g => g.standing.every(r => r.J === 6)), 'C: cada time joga 6 no grupo');
if (E.quadGroups) {
  const realN = C.groups.reduce((n, g) => n + g.games.filter(x => x.real).length, 0);
  check(C.groups.every(g => g.real), 'C: grupos reais do quad_c usados');
  check(realN === E.quadN, `C: ${realN} jogo(s) com placar oficial travado = QUAD_C_AUTO.n (${E.quadN})`);
} else console.log('  skip quad_c sem grupos reais');

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
