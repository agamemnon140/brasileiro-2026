// Valida a projecao do RNC 2027 (v4.67) rodando o Monte Carlo real das quatro series mais
// a Copa do Brasil e conferindo a identidade da janela movel, a coerencia da banda e a
// escala de pontos. Imprime o topo do ranking projetado e os maiores movimentos, que sao a
// leitura util: quem sobe e quem cai, e por que.
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '1000', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'simMC_CB', 'parseTab', 'buildRNC',
  'rncPtsSerie', 'rncPtsCB', 'RNC_2026',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES',
  'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };

// ---------- escala ----------
console.log('escala de pontos por colocacao geral:');
for (const [s, pos, esp] of [['A', 1, 800], ['A', 2, 640], ['A', 23, 408], ['A', 60, 408],
                             ['B', 1, 400], ['C', 1, 200], ['D', 1, 100], ['D', 2, 80], ['D', 23, 51], ['D', 96, 51]]) {
  const v = E.rncPtsSerie(s, pos);
  if (v !== esp) fail(`rncPtsSerie(${s},${pos}) = ${v}, esperado ${esp}`);
}
console.log('  OK, incluindo o clamp da 24a em diante');
// A coluna errada da Copa do Brasil dobraria o valor das oitavas -- o erro mais facil de cometer.
if (E.rncPtsCB('oit', 2026) !== 300 || E.rncPtsCB('oit', 2025) !== 200) fail('colunas da Copa do Brasil trocadas');
console.log('  Copa do Brasil: oitavas = 300 em 2026, 200 ate 2025  OK');

// ---------- Monte Carlo ----------
const cfg = { ...E.DEFAULT_CFG, drift: 15 };
const dash = {};
for (const [k, rk, tab, nm, dt, res] of [['A', 'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES'],
                                          ['B', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES'],
                                          ['C', 'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']]) {
  dash[k] = E.simMC(Object.keys(E[rk]), E[rk], E.parseTab(E[tab], E[nm], E[dt]), E[res], cfg, k, NS, 'conservador', false);
}
dash.D = E.simMC_D(cfg, NS, 'conservador', false);
dash.CB = E.simMC_CB(cfg, NS, 'conservador', false, {}, {});
const r = E.buildRNC(dash);
console.log(`\nprojecao: ${r.clubes.length} clubes, ${NS} sims por competicao, parcial=${r.parcial}`);
if (r.clubes.length !== 235) fail('deveria projetar os 235 clubes do RNC');
if (r.parcial) fail('dash deveria estar completo');

// ---------- identidade da janela movel ----------
let maxErr = 0;
r.clubes.forEach(c => { maxErr = Math.max(maxErr, Math.abs(c.rnc27 - (c.rnc26 + 5 * c.p26 - c.s5))); });
console.log(`identidade RNC2027 = RNC2026 + 5*P26 - Sigma: erro max ${maxErr.toExponential(2)}`);
if (maxErr > 1e-6) fail('identidade da janela movel violada');

// ---------- coerencia ----------
const banda = r.clubes.filter(c => !(c.p10 <= c.p50 && c.p50 <= c.p90));
console.log(`banda p10 <= p50 <= p90: ${banda.length === 0 ? 'OK' : banda.length + ' fora'}`);
if (banda.length) fail('banda incoerente em ' + banda.slice(0, 3).map(c => c.n).join(', '));
const teto = r.clubes.filter(c => c.serie === 'A' && c.p26 > 800 + 600);
if (teto.length) fail('P26 da Serie A acima do teto (campeao 800 + Copa 600)');
const posUnica = new Set(r.clubes.map(c => c.pos27)).size;
console.log(`posicoes 2027 unicas: ${posUnica}/${r.clubes.length}`);
if (posUnica !== r.clubes.length) fail('posicoes projetadas duplicadas');
const sim = r.clubes.filter(c => c.simulado).length;
console.log(`P26 vindo do Monte Carlo: ${sim} clubes | estatico ou zerado: ${235 - sim}`);

// ---------- leitura ----------
const lin = c => `${String(c.pos27).padStart(3)}. ${(c.n + '/' + c.u).padEnd(22)} ${String(Math.round(c.rnc27)).padStart(6)}` +
  `  (2026: ${String(c.pos26).padStart(3)}o ${String(c.rnc26).padStart(6)})  ${c.dPos > 0 ? '+' + c.dPos : c.dPos}  ${c.serie || '-'}`;
console.log('\ntop 10 projetado:');
r.clubes.slice(0, 10).forEach(c => console.log('  ' + lin(c)));
console.log('\nmaiores subidas (clubes novos no calendario nacional, Sigma baixo):');
[...r.clubes].sort((a, b) => b.dPos - a.dPos).slice(0, 8).forEach(c => console.log('  ' + lin(c)));
console.log('\nmaiores quedas (sem competicao em 2026: perdem o Sigma inteiro e nao repoem):');
[...r.clubes].sort((a, b) => a.dPos - b.dPos).slice(0, 8).forEach(c => console.log('  ' + lin(c)));

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
