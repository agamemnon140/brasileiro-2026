// Auditoria das constantes do Ranking Nacional de Clubes (v4.66).
//
// O risco numero 1 aqui nao e aritmetica, e reconciliacao de nomes. O app e a CBF usam
// convencoes diferentes e ha homonimos em UFs diferentes -- 'Primavera' e o do MT no app e
// existe um Primavera-SP; ha tres 'Operario', cinco 'Atletico', dois 'Rio Branco'. Casar so
// por nome gera falso positivo SILENCIOSO, que e o pior tipo. Por isso o join e sempre por
// (nome normalizado, UF) e este script falha ruidosamente em qualquer ambiguidade.
const { loadEngine } = require('./engine.cjs');

const E = loadEngine(['RNC_2026', 'RNC_NM', 'RNC_BASE', 'RNC_PCT', 'RNC_CB_PTS', 'RNC_CB26_PRE',
  'SD_TIMES', 'SA_RANKING', 'SB_RANKING', 'SC_RANKING', 'CB_TEAMS', 'UF_MAP', 'ufOfTeam']);

let ok = true;
const fail = m => { ok = false; console.log('  FAIL ' + m); };

// ---------- normalizacao (a mesma que a UI vai usar) ----------
const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const semUF = n => {
  const m = /[-\s]([A-Z]{2})$/.exec(n);
  return m && UFS.has(m[1]) ? n.slice(0, m.index) : n;
};
const chave = n => semAcento(semUF(n)).toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- 1. forma da tabela ----------
console.log(`RNC_2026: ${E.RNC_2026.length} clubes`);
if (E.RNC_2026.length !== 235) fail('esperado 235 clubes');
const vistos = new Map();
for (const r of E.RNC_2026) {
  if (typeof r.p !== 'number' || typeof r.s5 !== 'number' || typeof r.pos !== 'number') fail(`campos nao numericos em ${r.n}`);
  if (!UFS.has(r.u)) fail(`UF invalida em ${r.n}: ${r.u}`);
  const k = r.n + '|' + r.u;
  if (vistos.has(k)) fail(`duplicata: ${k}`);
  vistos.set(k, r);
}
console.log(`  (n,u) unicos: ${vistos.size}`);

// ---------- 2. pontos decrescentes e posicao no estilo CBF ----------
let prevP = Infinity, prevPos = 0, rank = 0, errPos = 0;
E.RNC_2026.forEach((r, i) => {
  if (r.p > prevP) fail(`pontos fora de ordem em ${r.n} (${r.p} > ${prevP})`);
  if (r.p !== prevP) rank = i + 1;
  if (r.pos !== rank) errPos++;
  prevP = r.p; prevPos = r.pos;
});
console.log(`  posicoes no padrao CBF (empate repete a posicao): ${errPos === 0 ? 'OK' : errPos + ' divergencias'}`);
if (errPos) fail('posicoes nao seguem o ranking de competicao padrao');

// ---------- 3. escala de pontos ----------
console.log(`RNC_PCT: ${E.RNC_PCT.length} valores, ${E.RNC_PCT[0]}..${E.RNC_PCT[E.RNC_PCT.length - 1]}`);
if (E.RNC_PCT.length !== 23) fail('RNC_PCT deveria ter 23 valores (da 24a repete a 23a)');
if (E.RNC_PCT[0] !== 100 || E.RNC_PCT[1] !== 80 || E.RNC_PCT[2] !== 75 || E.RNC_PCT[3] !== 70) fail('topo da escala errado');
for (let i = 4; i < 23; i++) if (E.RNC_PCT[i] !== E.RNC_PCT[i - 1] - 1) fail(`escala deveria cair 1 p.p. na posicao ${i + 1}`);
if (E.RNC_BASE.A !== 800 || E.RNC_BASE.B !== 400 || E.RNC_BASE.C !== 200 || E.RNC_BASE.D !== 100) fail('RNC_BASE errado');
// obs. (g): a menor pontuacao de uma serie e sempre maior que a do campeao da serie inferior
const menor = s => E.RNC_BASE[s] * E.RNC_PCT[22] / 100;
for (const [alta, baixa] of [['A','B'],['B','C'],['C','D']]) {
  if (!(menor(alta) > E.RNC_BASE[baixa])) fail(`obs.(g) violada: menor da ${alta} (${menor(alta)}) <= campeao da ${baixa} (${E.RNC_BASE[baixa]})`);
}
console.log(`  obs.(g) menor da serie > campeao da inferior: A${menor('A')}>${E.RNC_BASE.B} B${menor('B')}>${E.RNC_BASE.C} C${menor('C')}>${E.RNC_BASE.D} OK`);
// Copa do Brasil: a coluna de 2026 tem de ter o qualifier em 10 e as oitavas em 300
if (E.RNC_CB_PTS.de2026.f1 !== 10 || E.RNC_CB_PTS.de2026.oit !== 300) fail('coluna 2026+ da Copa do Brasil errada');
if (E.RNC_CB_PTS.ate2025.f1 !== 25 || E.RNC_CB_PTS.ate2025.oit !== 200) fail('coluna 2021-2025 da Copa do Brasil errada');

// ---------- 4. join app -> RNC ----------
const idx = new Map();
const porChave = new Map();
for (const r of E.RNC_2026) {
  idx.set(chave(r.n) + '|' + r.u, r);
  const c = chave(r.n);
  if (!porChave.has(c)) porChave.set(c, []);
  porChave.get(c).push(r);
}
const resolve = nome => {
  const alvo = E.RNC_NM[nome] || nome;
  const uf = E.ufOfTeam(nome);
  const direto = idx.get(chave(alvo) + '|' + uf);
  if (direto) return { r: direto, via: 'uf' };
  // Com a UF conhecida e sem par (nome, UF), o clube esta AUSENTE do RNC. Nao cair no
  // fallback por nome: e exatamente assim que 'America-RJ' viraria o 'America-MG' ou o
  // 'America/RN'. Adivinhar aqui e o falso positivo silencioso que este script existe
  // para impedir.
  if (uf && uf !== '??') return { r: null, via: 'ausente' };
  const c = porChave.get(chave(alvo)) || [];
  if (c.length === 1) return { r: c[0], via: 'unico' };
  if (c.length > 1) return { r: null, via: 'AMBIGUO' };
  return { r: null, via: 'ausente' };
};
const series = { A: Object.keys(E.SA_RANKING), B: Object.keys(E.SB_RANKING), C: Object.keys(E.SC_RANKING), D: E.SD_TIMES, CB: E.CB_TEAMS };
const orfaos = [], ambiguos = [];
console.log('cobertura do join app -> RNC:');
for (const [s, times] of Object.entries(series)) {
  let hit = 0;
  for (const t of times) {
    const { r, via } = resolve(t);
    if (r) hit++;
    else if (via === 'AMBIGUO') ambiguos.push(`${t} (${s})`);
    else if (!orfaos.some(o => o.startsWith(t + ' '))) orfaos.push(`${t} (${E.ufOfTeam(t)})`);
  }
  console.log(`  ${s.padEnd(2)} ${String(hit).padStart(3)}/${String(times.length).padStart(3)}`);
}
if (ambiguos.length) fail(`nomes ambiguos (precisam de entrada em RNC_NM): ${ambiguos.join(', ')}`);
console.log(`  ambiguos: ${ambiguos.length}`);
console.log(`  sem entrada no RNC (esperado: clubes sem competicao nacional em 2021-2025): ${orfaos.length}`);
console.log('    ' + orfaos.join(', '));

// ---------- 5. RNC_CB26_PRE ----------
let cbOk = 0;
for (const k of Object.keys(E.RNC_CB26_PRE)) {
  const [n, u] = k.split('|');
  if (vistos.has(n + '|' + u)) cbOk++; else fail(`RNC_CB26_PRE aponta para clube inexistente: ${k}`);
}
console.log(`RNC_CB26_PRE: ${Object.keys(E.RNC_CB26_PRE).length} clubes, ${cbOk} resolvem no RNC_2026`);

console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
