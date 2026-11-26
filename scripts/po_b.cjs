// Playoff de acesso da Série B (v4.95): confrontos e pernas REAIS (results.json.po_b) e a
// regra de que o placar oficial substitui o que o navegador tinha guardado.
//
// O sintoma que este harness prende: "os cruzamentos do mata-mata da B estão errados". Havia
// três caminhos até ele, e cada bloco abaixo fecha um:
//
// (1) mergeFetchedRes — placar oficial (results.json) SUBSTITUI o guardado do mesmo jogo; fonte
//     local não sobrescreve. E o caso real: o navegador que guardou Fortaleza 1×0 Operário-PR
//     (R25; o results.json foi corrigido para 1×1 em 27/09) tem de voltar a dar 3º Vila Nova ×
//     6º Atlético-GO e 4º Fortaleza × 5º Criciúma — os confrontos que a CBF joga. Com a regra
//     antiga ("o primeiro que chegou fica") o mesmo cenário dá Fortaleza × Atlético-GO: o teste
//     confere isso também, para provar que ele ficaria vermelho.
// (2) applyPoBAuto / poBPairs — a fixture só vale como chaveamento se forem 2 confrontos entre
//     4 clubes; os pares reais prevalecem sobre o cruzamento presumido mesmo que a ordem do 3º
//     ao 6º esteja trocada; clube estranho ao playoff → volta ao presumido.
// (3) Monte Carlo e 1 Sim — com as idas reais, a perna de ida de TODA simulação é a real e a
//     P(acesso) anda na direção do placar; com as quatro pernas o vencedor do agregado sobe em
//     100% (também por pênaltis e com o mando invertido em relação ao presumido); com a liga
//     truncada (Evolução) o playoff real não entra; edição do usuário só vale na perna que a
//     CBF ainda não jogou.
//
// Os nomes dos quatro clubes são os de 2026 de propósito: a fase de liga da B está encerrada
// e é esse caso concreto que não pode voltar a quebrar. RESULTS=none pula o que depende do
// results.json.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./engine.cjs');

const NS = Math.max(parseInt(process.env.NS || '400', 10), 1000); // a liga está toda jogada: só o playoff é sorteado
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simUnica', 'parseTab', 'mergeRes', 'mergeFetchedRes', 'bcSeeds', 'BC_RES_MERGED',
  'applyPoBAuto', 'poBPairs', 'poBLegs', 'poBRealAB', 'ligaCompleta', 'localStorage', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES']);
let results = null;
const RJ = process.env.RESULTS === 'none' ? null : (process.env.RESULTS || path.join(__dirname, '..', 'results.json'));
if (RJ) { try { results = JSON.parse(fs.readFileSync(RJ, 'utf8')); } catch (e) {} }
const cfg = { ...E.DEFAULT_CFG, drift: 15 };

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const VN = 'Vila Nova', FOR = 'Fortaleza', CRI = 'Criciúma', AGO = 'Atlético-GO';
const CBF = [[VN, AGO], [FOR, CRI]]; // jogos 381–384 da CBF, melhor colocado primeiro
const leg = (l, data, casa, gc, fora, gf, pen_c, pen_f) => ({ leg: l, data, casa, fora, gc, gf, pen_c: pen_c == null ? null : pen_c, pen_f: pen_f == null ? null : pen_f });
// o que a API da CBF mostrava em 26/11/2026: idas jogadas em 22/11, voltas marcadas
const IDAS = [leg('ida', '22/11', CRI, 1, FOR, 0), leg('ida', '22/11', AGO, 1, VN, 1), leg('volta', '27/11', VN, null, AGO, null), leg('volta', '28/11', FOR, null, CRI, null)];

// ---------- (1) placar oficial substitui o guardado ----------
console.log('\n(1) mergeFetchedRes');
{
  const guardado = [{ c: FOR, f: 'Operário-PR', gc: 1, gf: 0, r: 25 }, { c: 'Goiás', f: 'Avaí', gc: 2, gf: 2, r: 30 }];
  const novo = [{ c: FOR, f: 'Operário-PR', gc: 1, gf: 1, r: 25 }, { c: 'CRB', f: 'Sport', gc: 3, gf: 0, r: 31 }];
  const of = E.mergeFetchedRes(guardado, novo, true), loc = E.mergeFetchedRes(guardado, novo, false);
  check(of.length === 3 && of[0].gf === 1 && of[1].gc === 2 && of[2].c === 'CRB', 'oficial: placar corrigido substitui o guardado, o resto fica e o jogo novo entra');
  check(loc.length === 3 && loc[0].gf === 0, 'fonte local: não sobrescreve o que já estava guardado');
  check(guardado[0].gf === 0 && guardado.length === 2, 'não altera o array de entrada');
  check(eq(E.mergeFetchedRes(null, novo, true), novo) && eq(E.mergeFetchedRes(guardado, null, true), guardado), 'entradas vazias');
}
if (results && (results.results || []).some(r => r.serie === 'B' && r.casa === FOR && r.fora === 'Operário-PR')) {
  const RL = (results.results || []).filter(r => r.serie === 'B').map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));
  const velho = [{ c: FOR, f: 'Operário-PR', gc: 1, gf: 0, r: 25 }]; // o que o results.json dizia até 27/09
  const pares = (oficial) => {
    E.applyPoBAuto([]); // só a classificação: sem a fixture real para "salvar" o resultado
    E.BC_RES_MERGED.B = E.mergeRes(E.SB_RES, [], E.mergeFetchedRes(velho, RL, oficial));
    const s = E.bcSeeds('B');
    return { s, p: E.poBPairs(s.cl.slice(2, 6).map(c => c.t), false) };
  };
  const antes = pares(false), depois = pares(true);
  check(depois.s.fase1Done && eq(depois.p, CBF), `navegador com o placar antigo → cruzamentos da CBF (${depois.p.map(p => p.join(' × ')).join(' e ')})`);
  check(depois.s.st[FOR].P === 65 && depois.s.st[VN].P === 66, `Fortaleza 65, Vila Nova 66 (${depois.s.st[FOR].P}, ${depois.s.st[VN].P})`);
  check(antes.s.st[FOR].P === 67 && !eq(antes.p, CBF), `com a regra antiga o mesmo cenário dava ${antes.p.map(p => p.join(' × ')).join(' e ')} — o teste pega a regressão`);
  E.BC_RES_MERGED.B = null;
} else console.log('  (results.json sem a Série B — cenário do navegador antigo pulado)');

// ---------- (2) fixture → chaveamento ----------
console.log('\n(2) applyPoBAuto / poBPairs');
{
  const A = E.applyPoBAuto(IDAS);
  check(A.ties.length === 2 && A.n === 2 && Object.keys(A.legs).length === 4, 'fixture de 26/11: 2 confrontos, 4 pernas, 2 com placar');
  const L = E.poBLegs(VN, AGO);
  check(L && L.ida.casa === AGO && L.ida.gc === 1 && L.volta.casa === VN && L.volta.gc === null, 'pernas de Vila Nova × Atlético-GO: ida 1×1 em Goiânia (Accioly), volta sem placar');
  check(eq(E.poBPairs([VN, FOR, CRI, AGO], true), CBF), 'classificação certa: pares reais = 3º×6º e 4º×5º');
  check(eq(E.poBPairs([FOR, VN, CRI, AGO], true), [[FOR, CRI], [VN, AGO]]), 'ordem do 3º/4º trocada: os pares continuam sendo os da CBF');
  check(eq(E.poBPairs([FOR, VN, CRI, AGO], false), [[FOR, AGO], [VN, CRI]]), 'sem a fixture real vale o presumido (3º×6º, 4º×5º)');
  check(eq(E.poBPairs([VN, FOR, CRI, 'CRB'], true), [[VN, 'CRB'], [FOR, CRI]]), 'clube fora do playoff publicado → presumido');
  check(eq(E.poBRealAB(VN, AGO), { iA: 1, iB: 1 }) && eq(E.poBRealAB(FOR, CRI), { iA: 0, iB: 1 }) && E.poBRealAB(VN, CRI) === null, 'placar na ordem A×B do editor: só os campos já disputados');
  check(E.applyPoBAuto(IDAS.slice(0, 1)).ties.length === 0, '1 confronto só → não vale como chaveamento');
  check(E.applyPoBAuto(IDAS.concat([leg('ida', '22/11', 'CRB', 1, 'Goiás', 0)])).ties.length === 0, '3 confrontos → não vale');
  check(E.applyPoBAuto([leg('ida', '22/11', CRI, 1, FOR, 0), leg('ida', '22/11', FOR, 1, VN, 1)]).ties.length === 0, 'clube repetido em dois confrontos → não vale');
  check(E.applyPoBAuto(null).ties.length === 0 && E.applyPoBAuto([]).n === 0, 'sem po_b: nada');
}

// ---------- (3) Monte Carlo e 1 Sim ----------
if (results && (results.results || []).some(r => r.serie === 'B')) {
  const times = Object.keys(E.SB_RANKING);
  const tab = E.parseTab(E.SB_TAB, E.SB_NM, E.SB_DATES); // tabela PARSEADA — ver CLAUDE.md
  const RL = (results.results || []).filter(r => r.serie === 'B').map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));
  const res = E.mergeRes(E.SB_RES, RL);
  const mc = (rs) => { const r = E.simMC(times, E.SB_RANKING, tab, rs || res, cfg, 'B', NS, 'conservador', false); const P = {}; r.probs.forEach(p => P[p.time] = p); return P; };
  const su = (rs) => E.simUnica(times, E.SB_RANKING, tab, rs || res, cfg, 'B', 'conservador', false).fase2;
  const tie = (f2, x) => f2.ties.find(t => t.a === x || t.b === x);
  console.log(`\n(3) Monte Carlo — ${res.length} jogos de liga, NS=${NS}`);
  check(E.ligaCompleta(tab, res) && !E.ligaCompleta(tab, res.filter(r => r.r <= 37)), 'ligaCompleta: 380 jogos sim, até a R37 não');

  E.applyPoBAuto([]);
  const base = mc();
  check([VN, FOR, CRI, AGO].every(t => Math.round(base[t].bPlayoff) === 100), 'os quatro do playoff são Vila Nova, Fortaleza, Criciúma e Atlético-GO');
  const soma = P => [VN, FOR, CRI, AGO].reduce((a, t) => a + P[t].bAccess, 0);
  check(Math.abs(soma(base) - 200) < 1e-6, 'sem fixture: 2 dos 4 sobem em toda simulação');

  // idas reais (a situação de 26/11)
  E.applyPoBAuto(IDAS);
  const ida = mc();
  check(Math.abs(soma(ida) - 200) < 1e-6 && Math.abs(ida[VN].bAccess + ida[AGO].bAccess - 100) < 1e-6 && Math.abs(ida[FOR].bAccess + ida[CRI].bAccess - 100) < 1e-6, 'com as idas: um de cada confronto real sobe');
  check(ida[CRI].bAccess > base[CRI].bAccess + 8, `Criciúma venceu a ida por 1×0: acesso ${base[CRI].bAccess.toFixed(0)}% → ${ida[CRI].bAccess.toFixed(0)}%`);
  check(ida[FOR].bAccess < base[FOR].bAccess - 8, `Fortaleza perdeu a ida: acesso ${base[FOR].bAccess.toFixed(0)}% → ${ida[FOR].bAccess.toFixed(0)}%`);
  check((ida[VN].matchups.po || []).length === 1 && ida[VN].matchups.po[0].adv === AGO, 'cruzamento registrado no MC: Vila Nova × Atlético-GO em 100%');
  let idaOk = true, voltaSim = true, aggOk = true;
  for (let k = 0; k < 30; k++) {
    const f2 = su(), t1 = tie(f2, VN), t2 = tie(f2, FOR);
    if (!(t1.ida.real && t1.ida.casa === AGO && t1.ida.gc === 1 && t1.ida.gf === 1 && t2.ida.real && t2.ida.casa === CRI && t2.ida.gc === 1 && t2.ida.gf === 0)) idaOk = false;
    if (t1.volta.real || t2.volta.real || t1.volta.casa !== VN || t2.volta.casa !== FOR) voltaSim = false;
    for (const t of [t1, t2]) { const g = (x, c) => x.casa === c ? x.gc : x.gf; if (t.aggA !== g(t.ida, t.a) + g(t.volta, t.a) || t.aggB !== g(t.ida, t.b) + g(t.volta, t.b) || (t.aggA !== t.aggB && t.w !== (t.aggA > t.aggB ? t.a : t.b))) aggOk = false; }
  }
  check(idaOk, '1 Sim ×30: a ida é sempre a real (1×1 em Goiânia, 1×0 em Criciúma), marcada como oficial');
  check(voltaSim, '1 Sim ×30: a volta é sorteada, na casa do melhor colocado');
  check(aggOk, '1 Sim ×30: agregado = soma das duas pernas e vence quem fez mais gols');

  // quatro pernas: decidido no agregado e nos pênaltis
  const FIM = [IDAS[0], IDAS[1], leg('volta', '27/11', VN, 0, AGO, 0, 4, 5), leg('volta', '28/11', FOR, 2, CRI, 0)];
  E.applyPoBAuto(FIM);
  const fim = mc();
  check(fim[FOR].bAccess === 100 && fim[CRI].bAccess === 0, 'Fortaleza 2×0 na volta (2×1 no agregado): sobe em 100%, Criciúma em 0%');
  check(fim[AGO].bAccess === 100 && fim[VN].bAccess === 0, 'Vila Nova 0×0 Atlético-GO (1×1 no agregado), pênaltis 4–5: Atlético-GO sobe em 100%');
  const f2 = su(), tp = tie(f2, VN);
  check(tp.pen && tp.penReal && tp.real && tp.w === AGO && eq(f2.sobem.slice(2).sort(), [AGO, FOR].sort()), '1 Sim: confronto decidido nos pênaltis reais; sobem os dois vencedores');
  check(eq(E.poBRealAB(VN, AGO), { iA: 1, iB: 1, vA: 0, vB: 0, pen: 'B' }), 'editor: os quatro campos travados e os pênaltis para o Atlético-GO');

  // mando invertido em relação ao presumido (ida na casa do MELHOR colocado)
  E.applyPoBAuto([leg('ida', '22/11', VN, 3, AGO, 0), leg('volta', '27/11', AGO, 1, VN, 0), leg('ida', '22/11', FOR, 0, CRI, 0), leg('volta', '28/11', CRI, null, FOR, null)]);
  const inv = mc(), fi = su();
  check(inv[VN].bAccess === 100 && tie(fi, VN).ida.casa === VN && tie(fi, VN).aggA === 3 && tie(fi, VN).aggB === 1, 'mando invertido: usa o mando da CBF (ida em casa do Vila Nova, 3×1 no agregado)');
  check(tie(fi, FOR).volta.casa === CRI && !tie(fi, FOR).volta.real, 'mando invertido: a volta sorteada é na casa de quem a CBF marcou');

  // liga truncada (Evolução): o playoff real não entra
  E.applyPoBAuto(FIM);
  const trunc = res.filter(r => r.r <= 30);
  let vazou = false;
  for (let k = 0; k < 20; k++) { const f = su(trunc); if (f.ties.some(t => t.ida.real || t.volta.real)) vazou = true; }
  const pt = mc(trunc);
  check(!vazou && pt[AGO].bAccess < 100 && pt[FOR].bAccess < 100, `liga até a R30: nenhuma perna real entra (Atlético-GO ${pt[AGO].bAccess.toFixed(0)}%, Fortaleza ${pt[FOR].bAccess.toFixed(0)}%)`);

  // edição do usuário: vale só na perna que a CBF ainda não jogou
  // (no app quem preenche BC_RES_MERGED é o SimuladorUnificado; é dele que saem as posições
  // travadas que ligam o slot po1 do editor ao par 3º×6º)
  E.applyPoBAuto(IDAS);
  E.BC_RES_MERGED.B = res;
  E.localStorage.getItem = k => k === 'simUni_bPO' ? JSON.stringify({ po1: { iA: 5, iB: 0, vA: 0, vB: 2 } }) : null; // usuário: ida VN 5×0 (!), volta VN 0×2 AGO
  const ed = mc(), fe = su(), te = tie(fe, VN);
  check(te.ida.real && te.ida.gc === 1 && te.ida.gf === 1 && te.volta.user && te.volta.gc === 0 && te.volta.gf === 2 && te.w === AGO, 'edição + real: a ida fica a oficial (1×1), a volta é a digitada (0×2) → Atlético-GO');
  check(ed[AGO].bAccess === 100 && ed[VN].bAccess === 0, 'no MC a mesma combinação decide o confronto em 100%');
  E.applyPoBAuto([]);
  const so = su(), ts = tie(so, VN);
  check(ts.ida.user && ts.volta.user && ts.aggA === 5 && ts.aggB === 2 && ts.w === VN, 'sem fixture real a edição completa vale inteira (5×2 no agregado), como antes da v4.95');
  E.localStorage.getItem = () => null;
  E.BC_RES_MERGED.B = null;
} else console.log('\n(3) Monte Carlo — pulado (results.json sem a Série B)');

E.applyPoBAuto([]);
console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
