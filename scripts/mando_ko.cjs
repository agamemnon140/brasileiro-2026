// Valida o mata-mata da Série D contra o CHAVEAMENTO E MANDO REAIS do ko_d (v4.79).
//
// O bug que motivou: os defaults do bracket assumiam mandante da ida = pior campanha
// (ordIda), mas a CBF pôs o Nacional-AM (melhor campanha) na ida do D04 e o Goiatuba na do
// E02 — os dois confrontos empataram no agregado e a orientação invertida entregava os
// pênaltis ao lado errado: o app "classificava" Iguatu (em vez de Nacional) e Goiatuba (em
// vez de ASA). Como os defaults ainda eram persistidos em simUni_sdMM como edição do
// usuário, o erro ganhava precedência máxima e contaminava MC e Geral.
//
// O que se pinça aqui não se denuncia sozinho na UI: um vencedor plausível-e-errado é
// invisível; uma soma de probabilidade que não fecha, não.
const fs = require('fs');
const path = require('path');
const { runWithEngine, SHIM } = require('./engine.cjs');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results.json'), 'utf8'));
const KO = results.ko_d || [];
if (!KO.length) { console.log('results.json sem ko_d — nada a validar\nRESULT: PASS'); process.exit(0); }

const NS = parseInt(process.env.NS || '400', 10);

// localStorage ENVENENADO como o de um usuário que abriu a aba Mata-mata antes da v4.79:
// a entrada do D04 é o default antigo auto-persistido (valores idênticos ao dado, mas cuja
// interpretação dependia do tm presumido — era isso que classificava o Iguatu).
const POISON = JSON.stringify({ D04: { iA: 1, iB: 1, vA: 1, vB: 1, pen: 'A' } });

const src = `
  var __ls = { simUni_sdMM: ${JSON.stringify(POISON)} };
  localStorage = { getItem: k => __ls[k] != null ? __ls[k] : null, setItem: (k, v) => { __ls[k] = v; }, removeItem: k => { delete __ls[k]; } };
  applySdKoAuto(${JSON.stringify(KO)});
  const elim = sdEliminatedSet();
  const rMC = simMC_D({ ...DEFAULT_CFG, drift: 15 }, ${NS}, 'conservador', false);
  const resolve = sdBracketResolve(JSON.parse(${JSON.stringify(POISON)}));
  return { SD_KO_AUTO, SD_KO_CODES, sdKoKey, elim: [...elim], probs: rMC.probs, overlay: resolve.overlay };
`;
const E = runWithEngine(src);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };

// (1) vencedores dos confrontos decididos nos pênaltis com mando "fora da regra" (o PDF é
// a fonte da verdade: D04 → Nacional-AM, E02 → ASA)
const w = (a, b) => (E.SD_KO_AUTO[E.sdKoKey(a, b)] || {}).w;
check(w('Nacional-AM', 'Iguatu') === 'Nacional-AM', `D04: SD_KO_AUTO dá Nacional-AM (deu: ${w('Nacional-AM', 'Iguatu')})`);
check(w('Goiatuba', 'ASA') === 'ASA', `E02: SD_KO_AUTO dá ASA (deu: ${w('Goiatuba', 'ASA')})`);

// (2) SD_KO_CODES traz o emparelhamento real das quartas com a = mandante da ida
const QF = { E01: ['São José-RS', 'Gama'], E02: ['Goiatuba', 'ASA'], E03: ['Nacional-AM', 'ABC'], E04: ['Uberlândia', 'CSA'] };
for (const c in QF) {
  const kc = E.SD_KO_CODES[c] || {};
  check(kc.a === QF[c][0] && kc.b === QF[c][1], `${c}: SD_KO_CODES = ${QF[c].join(' × ')} (deu: ${kc.a} × ${kc.b})`);
}

// (3) localStorage envenenado NÃO reinstala o Iguatu: o resolvedor, orientado pelo mando
// real, devolve Nacional para a entrada legada do D04
const ov = E.overlay[E.sdKoKey('Nacional-AM', 'Iguatu')];
check(!ov || ov.w === 'Nacional-AM', `sdBracketResolve(legado D04) dá Nacional-AM (deu: ${ov && ov.w})`);

// (4) Geral: Iguatu eliminado; perdedores das quartas VIVOS (jogam o play-off); semifinalistas vivos
check(E.elim.includes('Iguatu'), 'Geral: Iguatu eliminado (perdeu as oitavas)');
for (const t of ['Nacional-AM', 'CSA', 'Goiatuba', 'São José-RS']) check(!E.elim.includes(t), `Geral: ${t} vivo (play-off de acesso pendente)`);
for (const t of ['Gama', 'ASA', 'ABC', 'Uberlândia']) check(!E.elim.includes(t), `Geral: ${t} vivo (semifinalista)`);

// (5) MC: semifinalistas com acesso e semi = 100%; perdedores das quartas sem semi
const P = {}; E.probs.forEach(p => P[p.time] = p);
for (const t of ['Gama', 'ASA', 'ABC', 'Uberlândia']) {
  check(Math.abs(P[t].ac - 100) < 1e-9, `MC: ac(${t}) = 100 (deu ${P[t].ac.toFixed(3)})`);
  check(Math.abs(P[t].sf - 100) < 1e-9, `MC: sf(${t}) = 100 (deu ${P[t].sf.toFixed(3)})`);
}
check(P['Iguatu'].qf === 0, `MC: qf(Iguatu) = 0 (deu ${P['Iguatu'].qf.toFixed(3)})`);
check(P['Nacional-AM'].qf === 100, `MC: qf(Nacional-AM) = 100 (deu ${P['Nacional-AM'].qf.toFixed(3)})`);

// (6) o PAR do play-off é o real (F03 São José × Goiatuba, F04 Nacional × CSA): em cada par,
// exatamente um sobe em cada simulação → a soma de ac fecha 100 por par. Com o reseed
// presumido (Nacional × São José / CSA × Goiatuba) essas somas não fecham.
const s1 = P['São José-RS'].ac + P['Goiatuba'].ac;
const s2 = P['Nacional-AM'].ac + P['CSA'].ac;
check(Math.abs(s1 - 100) < 1e-9, `MC: ac(São José) + ac(Goiatuba) = 100 → par F03 real (deu ${s1.toFixed(3)})`);
check(Math.abs(s2 - 100) < 1e-9, `MC: ac(Nacional) + ac(CSA) = 100 → par F04 real (deu ${s2.toFixed(3)})`);

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
