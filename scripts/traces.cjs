// Valida os traces que ligam as simulacoes a composicao da Serie D 2027 (v4.68).
//
// A regra do Art. 2o do REC acopla duas competicoes: quem sobe da Serie D libera vaga
// estadual em cascata, e quem cai da Serie C entra pelo Criterio 1. Os traces carregam
// essa informacao por sorteio. Se estiverem errados, a alocacao inteira fica errada de um
// jeito que a tabela final nao denuncia -- dai o teste ser por invariante estrutural.
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '1500', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'parseTab', 'SD_TIMES', 'SD_IDX', 'SD_INFO',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };
const cfg = { ...E.DEFAULT_CFG, drift: 15 };

// ---------- Serie D: g3 (Criterio 3) e prom (promovidos) ----------
const d = E.simMC_D(cfg, NS, 'conservador', false);
if (!d.trace) { fail('simMC_D nao emitiu trace'); process.exit(1); }
const tr = d.trace;
console.log(`Serie D: ${tr.n} sorteios tracados (nS=${NS})`);
if (tr.n !== NS) fail('numero de sorteios no trace difere de nS');

const bits = (arr, off) => {
  const out = [];
  for (let w = 0; w < 3; w++) {
    let v = arr[off + w];
    for (let b = 0; b < 32; b++) if (v & (1 << b)) out.push(w * 32 + b);
  }
  return out;
};
let g3ruim = 0, promRuim = 0, cruz = 0;
const contaG3 = {}, contaProm = {};
for (let i = 0; i < tr.n; i++) {
  const off = i * 3;
  const g3 = bits(tr.g3, off), pr = bits(tr.prom, off);
  if (g3.length !== 26) g3ruim++;
  if (pr.length !== 6) promRuim++;
  const sp = new Set(pr);
  if (g3.some(x => sp.has(x))) cruz++;   // um clube nao pode estar nos dois
  g3.forEach(x => contaG3[x] = (contaG3[x] || 0) + 1);
  pr.forEach(x => contaProm[x] = (contaProm[x] || 0) + 1);
}
console.log(`  popcount g3 = 26 em todo sorteio: ${g3ruim === 0 ? 'OK' : g3ruim + ' fora'}`);
console.log(`  popcount prom = 6 em todo sorteio: ${promRuim === 0 ? 'OK' : promRuim + ' fora'}`);
console.log(`  g3 e prom disjuntos: ${cruz === 0 ? 'OK' : cruz + ' sorteios com interseccao'}`);
if (g3ruim) fail('g3 deveria ter sempre 26 clubes (32 chegam a 3a fase, 6 sobem)');
if (promRuim) fail('prom deveria ter sempre 6 clubes');
if (cruz) fail('clube aparece como promovido E no grupo do Criterio 3');

// cruzamento com as probabilidades que a engine calcula por outro caminho
let maxD1 = 0, maxD2 = 0;
d.probs.forEach(p => {
  const i = E.SD_IDX[p.time];
  const pg3 = (contaG3[i] || 0) / tr.n * 100;
  const ppr = (contaProm[i] || 0) / tr.n * 100;
  maxD1 = Math.max(maxD1, Math.abs(pg3 - (p.f3 - p.ac)));   // chegou a 3a fase menos subiu
  maxD2 = Math.max(maxD2, Math.abs(ppr - p.ac));            // promovidos == acesso
});
console.log(`  P(g3) vs (f3 - ac): erro max ${maxD1.toExponential(2)}`);
console.log(`  P(prom) vs ac:      erro max ${maxD2.toExponential(2)}`);
if (maxD1 > 1e-9) fail('g3 nao bate com f3 - ac');
if (maxD2 > 1e-9) fail('prom nao bate com ac');

// ---------- Serie C: rebaixados ----------
const c = E.simMC(Object.keys(E.SC_RANKING), E.SC_RANKING, E.parseTab(E.SC_TAB, E.SC_NM, E.SC_DATES),
  E.SC_RES, cfg, 'C', NS, 'conservador', false);
if (!c.rebTrace) { fail('simMC da Serie C nao emitiu rebTrace'); }
else {
  const nReb = c.rebTrace.length / NS;
  console.log(`Serie C: rebTrace com ${c.rebTrace.length} nomes = ${nReb} por sorteio`);
  if (nReb !== 2) fail('a Serie C 2026 rebaixa 2 (Art. 42 do REC); rebTrace deveria ter 2 por sorteio');
  const cnt = {};
  c.rebTrace.forEach(t => cnt[t] = (cnt[t] || 0) + 1);
  let maxD3 = 0;
  c.probs.forEach(p => { maxD3 = Math.max(maxD3, Math.abs((cnt[p.time] || 0) / NS * 100 - p.z4)); });
  console.log(`  P(rebaixado) vs z4: erro max ${maxD3.toExponential(2)}`);
  if (maxD3 > 1e-9) fail('rebTrace nao bate com z4');
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log('  mais provaveis: ' + top.map(([t, n]) => `${t} ${(n / NS * 100).toFixed(1)}%`).join(', '));
}

// ---------- custo ----------
const kb = (tr.g3.byteLength + tr.prom.byteLength) / 1024;
console.log(`memoria dos traces: ${kb.toFixed(0)} KB para ${NS} sims`);

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
