// Valida a composicao da Serie D 2027 (v4.69).
//
// A regra tem duas cascatas com destinos OPOSTOS, e e o ponto mais facil de errar:
//   · clube com vaga estadual que SOBE para a Serie C  -> a vaga desce na fila do ESTADO
//   · clube com vaga estadual que TAMBEM se classifica pelo Criterio 3 (vaga dupla)
//     -> o excedente vai para o RANKING NACIONAL; o estado nao ganha vaga extra
// Trocar as duas produz uma tabela plausivel e errada, entao ha um teste dirigido para cada.
const { loadEngine } = require('./engine.cjs');

const NS = parseInt(process.env.NS || '1500', 10);
const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'simMC_CB', 'parseTab', 'buildRNC',
  'build2027Alloc', 'EST_QUOTA_2027', 'EST_FILA_2027', 'SD26_POR_UF', 'SD_TIMES', 'SD_IDX',
  'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES',
  'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES',
  'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };
const cfg = { ...E.DEFAULT_CFG, drift: 15 };

const dash = {};
for (const [k, rk, tab, nm, dt, res] of [['A', 'SA_RANKING', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RES'],
                                          ['B', 'SB_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RES'],
                                          ['C', 'SC_RANKING', 'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RES']]) {
  dash[k] = E.simMC(Object.keys(E[rk]), E[rk], E.parseTab(E[tab], E[nm], E[dt]), E[res], cfg, k, NS, 'conservador', false);
}
dash.D = E.simMC_D(cfg, NS, 'conservador', false);
dash.CB = E.simMC_CB(cfg, NS, 'conservador', false, {}, {});
const rnc = E.buildRNC(dash);
const a = E.build2027Alloc(dash.D, dash.C, rnc, null);

// ---------- 1. a conta fecha ----------
console.log(`sorteios: ${a.nDraws}`);
console.log(`  soma != 96: ${a.erros}`);
if (a.erros) fail('a alocacao nao fechou 96 em todo sorteio');
const soma = k => a.ufDist.reduce((s, r) => s + r[k].E, 0);
const checa = (k, esp, msg) => {
  const v = soma(k);
  console.log(`  E[${k}] somado sobre as UFs: ${v.toFixed(6)} (esperado ${esp})`);
  if (Math.abs(v - esp) > 1e-9) fail(msg);
};
checa('total', 96, 'total != 96');
// A cascata desloca a vaga DENTRO do estado; nunca cria nem destroi vaga estadual.
checa('estadual', 64, 'a cascata alterou o total de vagas estaduais');
checa('rebC', 2, 'rebaixados da Serie C != 2 (Art. 42 do REC)');
console.log(`  E[Criterio 3] = ${a.eD26.toFixed(2)} | E[Ranking] = ${a.eRnc.toFixed(2)} | soma ${(a.eD26 + a.eRnc).toFixed(4)} (esperado 30 = 96 - 2 - 64)`);
if (Math.abs(a.eD26 + a.eRnc - 30) > 1e-6) fail('Criterio 3 + Criterio 4 != 30');

// ---------- 2. determinismo ----------
const b = E.build2027Alloc(dash.D, dash.C, rnc, null);
const igual = JSON.stringify(a.ufDist) === JSON.stringify(b.ufDist);
console.log(`  duas execucoes com a mesma seed sao identicas: ${igual ? 'OK' : 'NAO'}`);
if (!igual) fail('resultado nao e reprodutivel');

// ---------- 3. cascata por ACESSO: a vaga fica no estado ----------
// Em AL a cascata ja se consumou na vida real: o ASA subiu e o Murici herdou. A fila e
// ASA(2o) -> CSA(3o) -> Murici(4o) com cota 2, entao sem acesso da ASA os donos sao
// ASA+CSA, e com acesso viram CSA+Murici. O modelo tem de reproduzir isso sozinho.
const tr = dash.D.trace;
const bitsOf = (arr, off) => {
  const s = new Set();
  for (let w = 0; w < 3; w++) { const v = arr[off + w]; for (let bb = 0; bb < 32; bb++) if (v & 1 << bb) s.add(E.SD_TIMES[w * 32 + bb]); }
  return s;
};
let comAcesso = 0, semAcesso = 0;
for (let d = 0; d < tr.n; d++) if (bitsOf(tr.prom, d * 3).has('ASA')) comAcesso++; else semAcesso++;
console.log(`\ncascata por acesso (AL): ASA sobe em ${(comAcesso / tr.n * 100).toFixed(1)}% dos sorteios`);
if (comAcesso === 0 || semAcesso === 0) {
  console.log('  (sem os dois cenarios nesta amostra; teste dirigido pulado)');
} else {
  // AL tem cota 2. Com o ASA fora, os donos passam a ser CSA e Murici -- ou seja, o Murici
  // so aparece quando o ASA sobe. E o total de vagas estaduais de AL nao muda.
  const al = a.ufDist.find(r => r.uf === 'AL');
  console.log(`  E[estadual] de AL = ${al.estadual.E.toFixed(4)} (cota ${E.EST_QUOTA_2027.AL}, tem de ser exata)`);
  if (Math.abs(al.estadual.E - E.EST_QUOTA_2027.AL) > 1e-9) fail('a cascata mudou a cota de AL');
  const fila = E.EST_FILA_2027.AL.map(x => x.n);
  if (fila[0] !== 'ASA' || fila[2] !== 'Murici') fail('fila de AL nao esta na ordem esperada');
  console.log(`  fila de AL: ${fila.slice(0, 4).join(' -> ')}  OK`);
}

// ---------- 4. cascata por VAGA DUPLA: a sobra vai ao Ranking, nao ao estado ----------
console.log('\nvaga dupla (estadual + Criterio 3): o excedente vai ao Ranking Nacional');
a.dupla.slice(0, 8).forEach(x => console.log(`  ${x.t.padEnd(20)} ${x.p.toFixed(1)}%`));
const eDupla = a.dupla.reduce((s, x) => s + x.p / 100, 0);
console.log(`  E[vagas duplas] = ${eDupla.toFixed(2)}`);
// 26 clubes chegam a 3a fase sem subir; os que ja tem vaga estadual saem do Criterio 3.
console.log(`  26 - E[vagas duplas] = ${(26 - eDupla).toFixed(2)} vs E[Criterio 3] = ${a.eD26.toFixed(2)}`);
if (Math.abs(26 - eDupla - a.eD26) > 1e-6) fail('vaga dupla nao explica a diferenca do Criterio 3');

// ---------- 5. fila esgotada tem de ser visivel ----------
const esg = Object.keys(a.filaEsgotada);
console.log(`\nfilas que se esgotam em algum sorteio: ${esg.length ? esg.map(u => `${u} (${(a.filaEsgotada[u] / a.nDraws * 100).toFixed(0)}%)`).join(', ') : 'nenhuma'}`);
console.log('  (buraco declarado: a UI mostra badge ambar; a vaga NAO vai para o Ranking por omissao)');

// ---------- 6. comparativo ----------
const s26 = Object.values(E.SD26_POR_UF).reduce((s, v) => s + v, 0);
console.log(`\n2026 vs 2027: soma 2026 = ${s26} | soma E[2027] = ${soma('total').toFixed(4)}`);
if (s26 !== 96) fail('a contagem de 2026 nao soma 96');
const mv = a.ufDist.map(r => ({ u: r.uf, d: r.total.E - (E.SD26_POR_UF[r.uf] || 0) })).sort((x, y) => y.d - x.d);
console.log('  maiores ganhos: ' + mv.slice(0, 4).map(x => `${x.u} ${x.d > 0 ? '+' : ''}${x.d.toFixed(2)}`).join(', '));
console.log('  maiores perdas: ' + mv.slice(-4).map(x => `${x.u} ${x.d.toFixed(2)}`).join(', '));

console.log('\nfavoritos a vaga pelo Ranking Nacional:');
a.rncPicks.slice(0, 10).forEach(x => console.log(`  ${(x.n + '/' + x.u).padEnd(24)} ${x.p.toFixed(1)}%`));

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
