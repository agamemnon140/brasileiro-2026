// Valida o sorteio projetado dos 16 grupos (v4.70).
//
// O criterio de aceitacao NAO e "coincidir ao maximo com a CBF". Medindo compacidade de
// verdade -- soma das distancias entre TODOS os pares de clubes de cada grupo -- a solucao
// do fluxo e mais compacta que a da propria CBF. Perseguir mais coincidencia significaria
// piorar a geografia para imitar a preferencia da CBF por divisoes 2/2/2 e 3/3, o que seria
// overfitting a um unico sorteio. Entao: testes ESTRUTURAIS + compacidade <= a da CBF, com
// a coincidencia entrando so como faixa de sanidade.
const { loadEngine } = require('./engine.cjs');

const E = loadEngine(['sorteio2027', 'UF_COORD', 'ufKm', 'SD_GRUPOS', 'SD_GL', 'SD_INFO',
  'SD_TD', 'EST_QUOTA_2027', 'SD27_CFG']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };

// --- alloc sintetico com as cotas de 2026, para a regressao ---
const q26 = {};
E.SD_TD.forEach(t => q26[t.u] = (q26[t.u] || 0) + 1);
const fake = {
  cfg: E.SD27_CFG,
  clubProb: [],
  ufDist: Object.keys(q26).map(u => ({ uf: u, total: { E: q26[u] } }))
};
const so = E.sorteio2027(fake);

// --- 1. estrutura ---
console.log('regressao com as cotas de 2026:');
const tam = so.grupos.map(g => Object.values(g.comp).reduce((a, b) => a + b, 0));
const total = tam.reduce((a, b) => a + b, 0);
console.log(`  grupos: ${so.grupos.length} | fluxo total: ${total} | tamanhos distintos: ${[...new Set(tam)].join(',')}`);
if (so.grupos.length !== 16) fail('deveria haver 16 grupos');
if (total !== 96) fail('o fluxo total deveria ser 96');
if (tam.some(t => t !== 6)) fail('todo grupo deveria ter exatamente 6');

// --- 2. teto de 3: impossivel por construcao (e a capacidade do arco) ---
const viol = so.grupos.filter(g => Math.max(...Object.values(g.comp)) > 3);
console.log(`  grupos violando o teto de 3 por UF: ${viol.length}`);
if (viol.length) fail('teto de 3 violado -- o bug esta na capacidade do arco, nao no reparo');

// --- 3. cada UF recebe exatamente a sua cota ---
const dado = {};
so.grupos.forEach(g => { for (const u in g.comp) dado[u] = (dado[u] || 0) + g.comp[u]; });
const difQ = Object.keys(q26).filter(u => dado[u] !== q26[u]);
console.log(`  UFs com cota respeitada: ${Object.keys(q26).length - difQ.length}/${Object.keys(q26).length}`);
if (difQ.length) fail('cota nao respeitada em ' + difQ.join(', '));

// --- 4. determinismo ---
const so2 = E.sorteio2027(fake);
const igual = JSON.stringify(so.grupos.map(g => g.comp)) === JSON.stringify(so2.grupos.map(g => g.comp));
console.log(`  duas execucoes identicas: ${igual ? 'OK' : 'NAO'}`);
if (!igual) fail('sorteio nao e deterministico');

// --- 5. compacidade: o teste de qualidade ---
const compacDe = comps => {
  let t = 0;
  comps.forEach(c => {
    const l = [];
    for (const u in c) for (let k = 0; k < c[u]; k++) l.push(u);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) t += E.ufKm(E.UF_COORD[l[i]], E.UF_COORD[l[j]]);
  });
  return t;
};
const realComp = E.SD_GRUPOS.map(g => {
  const c = {};
  g.forEach(t => { const u = E.SD_INFO[t].uf; c[u] = (c[u] || 0) + 1; });
  return c;
});
const cCBF = compacDe(realComp), cFlow = compacDe(so.grupos.map(g => g.comp));
console.log(`  compacidade (soma das distancias par a par, menor e melhor):`);
console.log(`    sorteio real da CBF: ${Math.round(cCBF).toLocaleString('pt-BR')} km`);
console.log(`    fluxo:               ${Math.round(cFlow).toLocaleString('pt-BR')} km  (${((cFlow / cCBF - 1) * 100).toFixed(1)}%)`);
if (cFlow > cCBF) fail('o fluxo ficou MENOS compacto que o sorteio real da CBF');

// --- 6. coincidencia: faixa de sanidade, nao alvo ---
const PARES = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]];
const inter = (x, y) => { let t = 0; for (const u in x) t += Math.min(x[u], y[u] || 0); return t; };
let acerto = 0;
for (const [a, b] of PARES) {
  const A = so.grupos[a].comp, B = so.grupos[b].comp;
  // a ordem DENTRO de um par gemeo do SD_PAIRS e arbitraria
  acerto += Math.max(inter(A, realComp[a]) + inter(B, realComp[b]), inter(A, realComp[b]) + inter(B, realComp[a]));
}
const pct = 100 * acerto / 96;
console.log(`  coincidencia com SD_GRUPOS: ${acerto}/96 = ${pct.toFixed(1)}%`);
if (pct < 75) fail('coincidencia abaixo de 75% -- provavel regressao no custo ou nos centroides');
if (pct > 90) fail('coincidencia acima de 90% -- cheira a overfitting ao sorteio de 2026');

// --- 7. o caso que motivou a mudanca ---
const a12 = so.grupos[11].comp;
const fmt = c => Object.entries(c).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([u, n]) => u + ':' + n).join(' ');
console.log(`  grupo 12 (${E.SD_GL[11]}): CBF ${fmt(realComp[11])} | fluxo ${fmt(a12)}`);
if (fmt(a12) !== fmt(realComp[11])) fail('o grupo BA+ES+MG deixou de ser reproduzido (era o caso que derrubou a ordenacao linear)');

// --- 8. sorteio com as cotas de 2027 ---
console.log('\ncomposicao projetada (cotas de 2027 sintetizadas a partir de 2026 para este teste):');
so.grupos.forEach(g => console.log(`  ${g.label}`));

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
