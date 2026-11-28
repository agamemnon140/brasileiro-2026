// Vagas continentais dinâmicas e "time sem objetivo" (v4.98).
//
// Duas coisas que erram em silêncio: uma linha de corte plausível e errada (G6 em vez de G7) e
// um ajuste que parece ligado e não age — ou age para o lado errado. Nenhuma se denuncia na tela.
//
// (1) alocaVagasInt (função pura), em casos montados à mão: os QUATRO cenários publicados para a
//     reta final de 2026 — final da Libertadores com um brasileiro × o finalista da Copa do Brasil
//     cair ou não — dão G6 / G7 / G7 / G8 com 1º–4º, 1º–5º ou 1º–6º nos grupos; a ordem da final
//     da Copa não muda nada nesses casos; finalistas desconhecidos = corte-base; os dois
//     finalistas no G4; campeão ou vice em 5º; campeão continental fora e dentro da zona.
// (2) Invariantes em tabelas e copas sorteadas: os conjuntos são disjuntos, ninguém rebaixado
//     leva vaga, o total de clubes na Libertadores é a cota (nenhuma vaga se cria ou se perde),
//     todo clube até a linha está classificado e a Sul-Americana são os 6 seguintes elegíveis.
// (3) Cenários: final continental em aberto com brasileiro = dois cenários; decidida = um; os
//     cortes do "sem objetivo" da Série A encolhem quando o brasileiro perde a final.
// (4) semObjFlags em casos à mão (campeão antecipado, rebaixado, empate em pontos = ameaça).
// (5) Monte Carlo da Série A de hoje: por cenário, Σ Libertadores = cota × 100, Σ Sula = 600, a
//     linha soma 100%; por um SEGUNDO caminho (probs.z4 e posF, que não passam pela alocação):
//     finalista da Copa do Brasil vai à Libertadores sempre que não cai, quem termina no G4
//     vai aos grupos, quem termina até o 5º vai à Libertadores.
// (6) O ajuste: m = 1 reproduz a flag desligada bit a bit (mesma semente) nas Séries A e B; na
//     Série B truncada na 37ª rodada (bandeiras = tabela real, iguais em toda simulação) os
//     adversários dos times sem objetivo pontuam MAIS com o ajuste ligado; na Série C o ajuste
//     não age (sem evidência → sem cortes).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '400', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'parseTab', 'mergeRes', 'applyCbAuto', 'calcClassif',
  'VAGAS_INT', 'vagasIntCtx', 'alocaVagasInt', 'cdbFinalInfo', 'semObjCortes', 'semObjFlags',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);
let results = {};
try { results = JSON.parse(fs.readFileSync(process.env.RESULTS || path.join(__dirname, '..', 'results.json'), 'utf8')); } catch (e) {}
E.applyCbAuto(results.cb || []);
const RL = k => (results.results || []).filter(r => r && r.serie === k).map(r => ({ c: r.casa, f: r.fora, gc: +r.gc, gf: +r.gf, r: +r.rodada }));

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// PRNG semeado (o motor usa Math.random)
const semear = seed => {
  const orig = Math.random; let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { Math.random = orig; };
};
const BASE = { dir: 4, pre: 1, sula: 6 };

console.log('(1) alocaVagasInt: casos à mão');
{
  const T = n => 'T' + n;
  const fica = Array.from({ length: 20 }, (_, i) => T(i + 1)); fica[1] = 'PAL'; fica[15] = 'GRE';       // PAL 2º, GRE 16º (fica)
  const cai = fica.slice(); cai[15] = 'T16'; cai[16] = 'GRE';                                             // GRE 17º (cai)
  const A = (ord, lib, sul, ch, vc) => E.alocaVagasInt(ord, 4, BASE, lib, sul, ch, vc);
  const S = a => [...a].sort();
  let r = A(fica, null, null, 'PAL', 'GRE');
  check(r.linha === 6 && r.linhaDir === 4 && eq(S(r.dir), S(['GRE', 'T1', 'PAL', 'T3', 'T4'])) && eq(r.pre, ['T5', 'T6']), 'brasileiro perde a final, finalista fica: G6, grupos 1º–4º + finalista, prévia 5º–6º');
  check(eq(r.sula, ['T7', 'T8', 'T9', 'T10', 'T11', 'T12']) && r.linhaSul === 12, '   Sul-Americana do 7º ao 12º');
  const r2 = A(fica, null, null, 'GRE', 'PAL');
  check(eq(S(r.dir), S(r2.dir)) && eq(S(r.pre), S(r2.pre)) && eq(r.sula, r2.sula), '   a ordem da final da Copa do Brasil não muda a distribuição');
  r = A(cai, null, null, 'PAL', 'GRE');
  check(r.linha === 7 && r.linhaDir === 5 && eq(r.dir, ['T1', 'PAL', 'T3', 'T4', 'T5']) && eq(r.pre, ['T6', 'T7']) && !r.dir.includes('GRE'), 'brasileiro perde, finalista CAI: G7, grupos 1º–5º, prévia 6º–7º, rebaixado sem vaga');
  check(eq(S(A(cai, null, null, 'GRE', 'PAL').dir), S(r.dir)) && r.linhaSul === 13, '   idem com o rebaixado campeão; Sula até o 13º');
  r = A(fica, 'PAL', null, 'PAL', 'GRE');
  check(r.linha === 7 && r.linhaDir === 5 && eq(S(r.dir), S(['PAL', 'GRE', 'T1', 'T3', 'T4', 'T5'])) && eq(r.pre, ['T6', 'T7']), 'brasileiro campeão continental, finalista fica: G7, grupos 1º–5º, prévia 6º–7º');
  r = A(cai, 'PAL', null, 'GRE', 'PAL');
  check(r.linha === 8 && r.linhaDir === 6 && eq(S(r.dir), S(['PAL', 'T1', 'T3', 'T4', 'T5', 'T6'])) && eq(r.pre, ['T7', 'T8']) && r.linhaSul === 14, 'brasileiro campeão e finalista cai: G8, grupos 1º–6º, prévia 7º–8º, Sula até o 14º');
  r = A(fica, null, null, null, null);
  check(r.linha === 5 && eq(r.dir, ['T1', 'PAL', 'T3', 'T4']) && eq(r.pre, ['T5']) && eq(r.sula, ['T6', 'T7', 'T8', 'T9', 'T10', 'T11']), 'finalistas desconhecidos: corte-base (G5; Sula 6º–11º)');
  r = A(fica, null, null, 'PAL', 'T3');
  check(r.linha === 7 && eq(r.dir, ['T1', 'PAL', 'T3', 'T4', 'T5']) && eq(r.pre, ['T6', 'T7']), 'os dois finalistas no G4: as duas vagas descem (G7)');
  r = A(fica, null, null, 'T5', 'T12');
  check(eq(S(r.dir), S(['T5', 'T1', 'PAL', 'T3', 'T4'])) && eq(S(r.pre), S(['T12', 'T6'])) && r.linha === 6, 'campeão da Copa em 5º: fica com a vaga direta e a prévia da tabela desce para o 6º');
  r = A(fica, null, null, 'T10', 'T5');
  check(eq(S(r.dir), S(['T10', 'T1', 'PAL', 'T3', 'T4'])) && eq(r.pre, ['T5', 'T6']) && r.linha === 6, 'vice da Copa em 5º: fica com a prévia da tabela e a da Copa desce para o 6º');
  r = A(fica, null, 'T9', null, null);
  check(r.dir.includes('T9') && r.linha === 5 && eq(r.sula, ['T6', 'T7', 'T8', 'T10', 'T11', 'T12']), 'campeão continental fora da zona: vaga por fora, linha não se move, Sula pula o campeão');
  r = A(fica, 'PAL', null, null, null);
  check(r.linha === 6 && eq(S(r.dir), S(['PAL', 'T1', 'T3', 'T4', 'T5'])) && eq(r.pre, ['T6']), 'campeão continental no G4: a vaga dele na tabela desce um degrau (G6)');
}

console.log('(2) invariantes em tabelas e copas sorteadas');
{
  const rest = semear(4242);
  let disj = true, reb = true, cota = true, ateLinha = true, sulaOk = true, n = 0;
  const base = Array.from({ length: 20 }, (_, i) => 'C' + i);
  for (let it = 0; it < 4000; it++) {
    const ord = base.slice().sort(() => Math.random() - 0.5);
    const pick = () => ord[Math.floor(Math.random() * 20)];
    const lib = Math.random() < 0.4 ? pick() : null, sul = Math.random() < 0.3 ? pick() : null;
    const temCdb = Math.random() < 0.8; let ch = null, vc = null;
    if (temCdb) { ch = pick(); do { vc = pick(); } while (vc === ch); }
    const r = E.alocaVagasInt(ord, 4, BASE, lib, sul, ch, vc);
    const pos = t => ord.indexOf(t) + 1, eleg = t => t != null && pos(t) <= 16;
    const todos = [...r.dir, ...r.pre, ...r.sula];
    if (new Set(todos).size !== todos.length) disj = false;
    if (todos.some(t => pos(t) > 16)) reb = false;
    const titulos = new Set([lib, sul].filter(eleg)).size;
    if (r.dir.length + r.pre.length !== 5 + (temCdb ? 2 : 0) + titulos) cota = false;
    const lb = new Set([...r.dir, ...r.pre]);
    for (let p = 1; p <= r.linha; p++) if (!lb.has(ord[p - 1])) ateLinha = false;
    const esperado = ord.filter(t => !lb.has(t) && eleg(t)).slice(0, 6);
    if (!eq(r.sula, esperado)) sulaOk = false;
    n++;
  }
  rest();
  check(disj, `grupos, prévia e Sul-Americana são disjuntos (${n} casos)`);
  check(reb, 'nenhum rebaixado leva vaga');
  check(cota, 'total na Libertadores = 5 + 2 da Copa (se conhecida) + títulos continentais: nenhuma vaga criada ou perdida');
  check(ateLinha, 'todo clube até a linha está na Libertadores');
  check(sulaOk, 'Sul-Americana = os 6 seguintes elegíveis fora da Libertadores');
}

console.log('(3) cenários e cortes do "sem objetivo"');
{
  const V = E.VAGAS_INT, guarda = JSON.stringify({ lib: V.lib, sula: V.sula });
  try {
    V.lib = { rot: 'Libertadores', data: 'x', final: ['BR1', 'EXT'], br: ['BR1'], campeao: null };
    V.sula = { rot: 'Sul-Americana', data: 'x', final: ['BR2', 'EXT2'], br: ['BR2'], campeao: 'EXT2' };
    let c = E.vagasIntCtx();
    check(c.cen.length === 2 && c.cen[0].lib === 'BR1' && c.cen[1].lib === null && c.cen.every(s => s.sul === null), 'final com brasileiro por jogar: dois cenários (campeão / não)');
    check(eq(E.semObjCortes('A', 20, 4), [1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 16]), 'cortes da A com a final aberta: título, 4º–8º, 11º–14º, 16º');
    V.lib.campeao = 'EXT';
    c = E.vagasIntCtx();
    check(c.cen.length === 1 && c.cen[0].lib === null, 'estrangeiro campeão: um cenário, sem vaga extra');
    check(eq(E.semObjCortes('A', 20, 4), [1, 4, 5, 6, 7, 11, 12, 13, 16]), 'cortes encolhem: o 8º e o 14º deixam de ser linha possível');
    V.lib.campeao = 'BR1';
    c = E.vagasIntCtx();
    check(c.cen.length === 1 && c.cen[0].lib === 'BR1' && E.semObjCortes('A', 20, 4).includes(8), 'brasileiro campeão: um cenário com a vaga extra; 8º segue possível');
    V.lib.campeao = null; V.sula.campeao = null;
    check(E.vagasIntCtx().cen.length === 4 && E.semObjCortes('A', 20, 4).includes(9), 'duas finais abertas com brasileiros: quatro cenários, linha possível até o 9º');
    V.lib = { rot: 'Libertadores', data: 'x', final: ['EXT', 'EXT3'], br: [], campeao: null };
    check(E.vagasIntCtx().cen.length === 2, 'final sem brasileiro não abre cenário (só a outra final conta)');
  } finally { const g = JSON.parse(guarda); V.lib = g.lib; V.sula = g.sula; }
  check(eq(E.semObjCortes('B', 20, 4), [1, 2, 6, 16]) && E.semObjCortes('C', 20, 2) === null && E.semObjCortes('D', 96, 0) === null, 'Série B: título, acesso, playoff, Z4; C e D sem cortes (sem ajuste)');
}

console.log('(4) semObjFlags: casos à mão');
{
  const st = { A: { P: 80, J: 36 }, B: { P: 74, J: 37 }, C: { P: 66, J: 36 }, D: { P: 63, J: 36 }, E: { P: 57, J: 36 }, F: { P: 20, J: 36 } };
  const f = E.semObjFlags(st, [1, 4, 5], 38);
  check(f.A && f.B, 'líder inalcançável e vice travado: decididos em 1, 4 e 5');
  check(f.C && !f.D && !f.E, '3º garantido no G4 = decidido; 4º que o 5º ainda pode EMPATAR e 5º que ainda alcança o 4º = com objetivo');
  check(f.F, 'lanterna que não alcança nenhum corte = decidido');
  check(E.semObjFlags({ X: { P: 10, J: 37 }, Y: { P: 10, J: 37 } }, [1], 38).X === false, 'empate em pontos conta como ameaça (não marca)');
}

const S = {
  A: [E.SA_RANKING, E.SA_TAB, E.SA_NM, E.SA_DATES, E.SA_RES],
  B: [E.SB_RANKING, E.SB_TAB, E.SB_NM, E.SB_DATES, E.SB_RES],
  C: [E.SC_RANKING, E.SC_TAB, E.SC_NM, E.SC_DATES, E.SC_RES]
};
const run = (sk, cfg, seed, maxRod) => {
  const [rk, tab, nm, dt, emb] = S[sk];
  let res = E.mergeRes(emb, RL(sk));
  if (maxRod != null) res = res.filter(r => r.r >= 1 && r.r <= maxRod);
  const rest = semear(seed);
  try { return { r: E.simMC(Object.keys(rk), rk, E.parseTab(tab, nm, dt), res, cfg, sk, NS, 'conservador', false, { ignoreUser: true }), res, times: Object.keys(rk), tab: E.parseTab(tab, nm, dt) }; }
  finally { rest(); }
};
const comSO = so => ({ ...E.DEFAULT_CFG, semObj: so });

console.log('(5) Monte Carlo da Série A: somas e segundo caminho');
{
  const { r } = run('A', E.DEFAULT_CFG, 11);
  const vi = r.vagasInt, cdb = E.cdbFinalInfo();
  check(!!vi && vi.cen.length >= 1 && vi.nS === NS, `rMC.vagasInt com ${vi ? vi.cen.length : 0} cenário(s)`);
  const P = {}; r.probs.forEach(p => { P[p.time] = p; });
  for (const s of (vi ? vi.cen : [])) {
    const T = {}; s.times.forEach(t => { T[t.time] = t; });
    const sLib = s.times.reduce((a, t) => a + t.lib, 0), sSul = s.times.reduce((a, t) => a + t.sul, 0);
    const titulos = [s.lib, s.sul].filter(Boolean);
    const zTit = titulos.reduce((a, t) => a + (P[t] ? P[t].z4 : 100), 0);   // título de rebaixado não vira vaga
    check(near(sLib, 100 * (5 + (cdb ? 2 : 0) + titulos.length) - zTit, 1e-6), `[${s.curto}] Σ Libertadores = ${(sLib / 100).toFixed(2)} clubes = cota`);
    check(near(sSul, 600, 1e-6), `[${s.curto}] Σ Sul-Americana = 6 clubes`);
    check(near(s.linha.reduce((a, x) => a + x.pct, 0), 100, 1e-6) && s.linha.every(x => x.pos >= 5 && x.pos <= 9), `[${s.curto}] linha soma 100% e fica entre G5 e G9: ${s.linha.map(x => 'G' + x.pos + ' ' + x.pct.toFixed(1) + '%').join(', ')}`);
    check(s.times.every(t => t.dir + t.pre + t.sul <= 100 + 1e-6 && near(t.lib, t.dir + t.pre)), `[${s.curto}] nenhum time passa de 100% somando grupos, prévia e Sula`);
    if (cdb) check([cdb.a, cdb.b].every(f => !T[f] || near(T[f].lib, 100 - P[f].z4, 1e-6)), `[${s.curto}] finalista da Copa do Brasil vai à Libertadores sempre que não cai (2º caminho: probs.z4)`);
    check(s.times.every(t => t.dir >= P[t.time].g4 - 1e-6), `[${s.curto}] quem termina no G4 vai aos grupos (2º caminho: probs.g4)`);
    check(s.times.every(t => t.lib >= P[t.time].posF.slice(0, 5).reduce((a, b) => a + b, 0) - 1e-6), `[${s.curto}] quem termina até o 5º vai à Libertadores (2º caminho: posF)`);
    if (s.lib && P[s.lib]) check(near(T[s.lib].dir, 100 - P[s.lib].z4, 1e-6), `[${s.curto}] o campeão continental está nos grupos em toda simulação em que não cai`);
  }
  if (vi && vi.cen.length === 2 && vi.cen[0].lib && !vi.cen[1].lib) {
    const m = s => s.linha.reduce((a, x) => a + x.pos * x.pct, 0) / 100;
    check(m(vi.cen[0]) >= m(vi.cen[1]) + 1 - 1e-6 || !P[vi.cen[0].lib] || P[vi.cen[0].lib].posF.slice(0, 5).reduce((a, b) => a + b, 0) < 99.999,
      'com o brasileiro campeão a linha média desce um degrau inteiro (quando ele termina sempre na zona)');
  }
}

console.log('(6) o ajuste "time sem objetivo"');
{
  for (const sk of ['A', 'B']) {
    const off = run(sk, comSO({ on: false, m: 1.15, ultimas: 8 }), 77), um = run(sk, comSO({ on: true, m: 1, ultimas: 8 }), 77);
    check(eq(off.r.probs, um.r.probs), `Série ${sk}: m = 1 reproduz a flag desligada bit a bit`);
  }
  // Série B com 37 rodadas reais: as bandeiras da 38ª são a tabela real, iguais em toda simulação
  const off = run('B', comSO({ on: false, m: 1.5, ultimas: 8 }), 5, 37), on = run('B', comSO({ on: true, m: 1.5, ultimas: 8 }), 5, 37);
  const nR = off.tab.reduce((a, g) => Math.max(a, g.rodada), 0);
  const st = {}; off.times.forEach(t => { st[t] = { P: 0, J: 0 }; });
  off.res.forEach(g => { st[g.c].J++; st[g.f].J++; if (g.gc > g.gf) st[g.c].P += 3; else if (g.gc === g.gf) { st[g.c].P++; st[g.f].P++; } else st[g.f].P += 3; });
  const fl = E.semObjFlags(st, E.semObjCortes('B', 20, 4), nR);
  const jogos = off.tab.filter(g => g.rodada === nR && fl[g.casa] !== fl[g.fora]);
  const M = x => { const m = {}; x.r.probs.forEach(p => { m[p.time] = p.mediaPts; }); return m; };
  const a = M(off), b = M(on);
  const vivos = jogos.map(g => fl[g.casa] ? g.fora : g.casa), mortos = jogos.map(g => fl[g.casa] ? g.casa : g.fora);
  const dV = vivos.reduce((s, t) => s + b[t] - a[t], 0), dM = mortos.reduce((s, t) => s + b[t] - a[t], 0);
  check(jogos.length >= 3, `Série B, última rodada: ${jogos.length} confrontos assimétricos pela tabela real (${Object.keys(fl).filter(t => fl[t]).length} times sem objetivo)`);
  check(dV > 0.1 * jogos.length && dM < -0.1 * jogos.length, `com m = 1,5 os adversários ganham ${dV.toFixed(2)} ponto(s) e os sem objetivo perdem ${(-dM).toFixed(2)} no total — o ajuste age, e para o lado certo`);
  const outros = off.times.filter(t => !vivos.includes(t) && !mortos.includes(t));
  check(outros.every(t => Math.abs(b[t] - a[t]) < 0.35), 'times fora desses confrontos não mudam além do ruído de sorteio');
  const cOff = run('C', comSO({ on: false, m: 1.5, ultimas: 8 }), 9, 15), cOn = run('C', comSO({ on: true, m: 1.5, ultimas: 8 }), 9, 15);
  check(eq(cOff.r.probs, cOn.r.probs), 'Série C: ligado = desligado (sem cortes, o ajuste não age)');
}

console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
