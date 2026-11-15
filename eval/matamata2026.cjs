// FASES FINAIS DE 2026: o que o app dizia de acesso, final e titulo nas Series C e D.
//
// Complemento de eval/zonas2026.cjs, que cobre so as zonas da fase de liga. Aqui os eventos
// sao os da fase seguinte, previstos desde a pre-temporada ate a ultima fase antes de cada
// um se decidir:
//
//   Serie C: acesso a Serie B (4 clubes), chegar a final (2), campeao (1)
//   Serie D: passar da 2a fase (32), chegar as oitavas (16), as quartas (8), a semifinal (4),
//            a final (2), acesso a Serie C (6: os 4 semifinalistas e os 2 do play-off), campeao (1)
//
// EIXO DO TEMPO. Na fase de liga, cada rodada (resultados truncados). Depois dela, cada
// etapa do mata-mata: na C, a composicao real dos quadrangulares e cada uma das 6 rodadas
// (quad_c do results.json com os placares posteriores apagados) e a ida da final; na D, as
// fases B..F pela mascara koMask do motor, a mesma da aba Evolucao.
//
// SERIE C, ROTULO DA FINAL. A API da CBF entregou a final como "GRUPO D" e o results.json a
// guarda com fase "Q" e grupo "D". applyQuadCAuto so reconhece a final com fase "FINAL",
// entao aqui as duas linhas sao renomeadas antes de entrar no motor. Sem isso o titulo da C
// nao fecha (ver eval/REVISAO.md).
//
// VAZAMENTOS CONHECIDOS, os mesmos da aba Evolucao: os codigos reais de confronto e mando
// da D (SD_KO_CODES) nao sao mascarados, porque sao estrutura do chaveamento.
//
//   node eval/matamata2026.cjs          # 5000 simulacoes por corte
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');
const { calibrar, trajetorias } = require('./zonas2026.cjs');

const NSIMS = parseInt(process.argv.find(a => /^\d+$/.test(a))) || 5000;

function serieC(E, dados, quad) {
  const cfg = E.DEFAULT_CFG, ak = cfg.defaultAlpha;
  const times = Object.keys(E.SC_RANKING), T = E.parseTab(E.SC_TAB, E.SC_NM, E.SC_DATES), res = dados.merged.C;
  const H = T.reduce((m, g) => Math.max(m, g.rodada), 0);
  const linhas = quad.map(r => String(r.grupo || '').toUpperCase() === 'D' ? { ...r, fase: 'FINAL', grupo: null } : r);
  // placares dos quadrangulares ate a rodada q; pernas da final ate f
  const ate = (q, f) => linhas.filter(r => r.fase !== 'FINAL' || Number(r.rodada) <= f).map(r => r.fase === 'FINAL' || Number(r.rodada) <= q ? r : { ...r, gc: null, gf: null });
  const rodar = (resN, rows, seed, n) => {
    E.applyQuadCAuto(rows);
    const rest = L.semear(seed);
    try { const P = {}; E.simMC(times, E.SC_RANKING, T, resN, cfg, 'C', n, ak, false, { ignoreUser: true }).probs.forEach(p => P[p.time] = p); return P; }
    finally { rest(); E.applyQuadCAuto([]); }
  };
  const fim = rodar(res, ate(6, 2), 1, 60);
  const EV = [['acesso à Série B', 'q4', 4, 24], ['chegar à final', 'qFin', 2, 24], ['campeão', 'qChamp', 1, 26]];
  for (const [nome, campo, k] of EV) { const n = times.filter(t => fim[t][campo] > 99.9).length; if (n !== k) throw new Error(`Serie C: ${nome} tem ${n} clubes decididos, esperado ${k}`); }
  const cortes = [];
  for (let r = 0; r < H; r++) cortes.push({ rotulo: 'rodada ' + r, ordem: r, P: () => rodar(res.filter(x => x.r <= r), [], 27000 + r, NSIMS) });
  cortes.push({ rotulo: 'grupos definidos', ordem: H, P: () => rodar(res, ate(0, 0), 27100, NSIMS) });
  for (let q = 1; q <= 5; q++) cortes.push({ rotulo: 'quadrangular, rodada ' + q, ordem: H + q, P: () => rodar(res, ate(q, 0), 27100 + q, NSIMS) });
  cortes.push({ rotulo: 'finalistas definidos', ordem: H + 6, P: () => rodar(res, ate(6, 0), 27106, NSIMS) });
  cortes.push({ rotulo: 'depois da ida da final', ordem: H + 7, P: () => rodar(res, ate(6, 1), 27107, NSIMS) });
  const recs = [];
  for (const c of cortes) {
    const P = c.P();
    for (const [evento, campo, k, ultima] of EV) if (c.ordem <= ultima) for (const t of times)
      recs.push({ serie: 'C', evento, k, time: t, corte: c.ordem, rotulo: c.rotulo, H: 27, p: P[t][campo] / 100, o: fim[t][campo] > 99.9 ? 1 : 0 });
    process.stderr.write(`\r  Serie C: ${c.rotulo}          `);
  }
  process.stderr.write('\n');
  return { recs, rotulos: cortes.map(c => c.rotulo) };
}

function serieD(E, KO) {
  const cfg = E.DEFAULT_CFG, ak = cfg.defaultAlpha, todos = E.SD_RES.slice();
  const H = todos.reduce((m, x) => Math.max(m, x.r), 0);
  E.applySdKoAuto(KO);
  const rodar = (corte, mask, seed, n) => {
    const rest = L.semear(seed);
    try {
      E.SD_RES.length = 0; todos.filter(x => x.r <= corte).forEach(x => E.SD_RES.push(x));
      const P = {}; E.simMC_D(cfg, n, ak, false, undefined, { koMask: mask }).probs.forEach(p => P[p.time] = p); return P;
    } finally { E.SD_RES.length = 0; todos.forEach(x => E.SD_RES.push(x)); rest(); }
  };
  const fim = rodar(H, null, 1, 60);
  // [nome, campo, vagas, ultima etapa em que o evento ainda esta aberto]
  const EV = [['passar da 2ª fase', 'f3', 32, H], ['chegar às oitavas', 'oit', 16, H + 1], ['chegar às quartas', 'qf', 8, H + 2],
    ['chegar à semifinal', 'sf', 4, H + 3], ['chegar à final', 'fin', 2, H + 4], ['acesso à Série C', 'ac', 6, H + 4], ['campeão', 'ch', 1, H + 5]];
  for (const [nome, campo, k] of EV) { const n = E.SD_TIMES.filter(t => fim[t][campo] > 99.9).length; if (n !== k) throw new Error(`Serie D: ${nome} tem ${n} clubes decididos, esperado ${k}`); }
  const cortes = [];
  for (let r = 0; r < H; r++) cortes.push({ rotulo: 'rodada ' + r, ordem: r, P: () => rodar(r, new Set(), 27300 + r, NSIMS) });
  const fases = [['grupos encerrados', []], ['depois da 2ª fase', ['B']], ['depois da 3ª fase', ['B', 'C']], ['depois das oitavas', ['B', 'C', 'D']],
    ['depois das quartas', ['B', 'C', 'D', 'E']], ['depois das semifinais', ['B', 'C', 'D', 'E', 'F']]];
  fases.forEach(([rotulo, m], i) => cortes.push({ rotulo, ordem: H + i, P: () => rodar(H, new Set(m), 27400 + i, NSIMS) }));
  const recs = [];
  for (const c of cortes) {
    const P = c.P();
    for (const [evento, campo, k, ultima] of EV) {
      if (c.ordem > ultima) continue;
      const soma = E.SD_TIMES.reduce((a, t) => a + P[t][campo], 0) / 100;
      if (Math.abs(soma - k) > 1e-6) throw new Error(`Serie D, ${c.rotulo}: ${evento} soma ${soma}, esperado ${k}`);
      for (const t of E.SD_TIMES) recs.push({ serie: 'D', evento, k, time: t, corte: c.ordem, rotulo: c.rotulo, H: H + 6, p: P[t][campo] / 100, o: fim[t][campo] > 99.9 ? 1 : 0 });
    }
    process.stderr.write(`\r  Serie D: ${c.rotulo}          `);
  }
  process.stderr.write('\n');
  return { recs, rotulos: cortes.map(c => c.rotulo) };
}

// Por evento: so as previsoes ABERTAS (0 < p < 1). A referencia divide as vagas que restam
// igualmente entre os clubes ainda em aberto naquele corte.
function resumir(recs) {
  const eventos = [...new Set(recs.map(r => r.evento))];
  return eventos.map(ev => {
    const rs = recs.filter(r => r.evento === ev), porCorte = {};
    rs.forEach(r => (porCorte[r.corte] = porCorte[r.corte] || []).push(r));
    let n = 0, b = 0, bb = 0;
    for (const g of Object.values(porCorte)) {
      const abertos = g.filter(r => r.p > 0 && r.p < 1), garantidos = g.filter(r => r.p >= 1).length;
      if (!abertos.length) continue;
      const ref = (g[0].k - garantidos) / abertos.length;
      for (const r of abertos) { n++; b += (r.p - r.o) ** 2; bb += (ref - r.o) ** 2; }
    }
    return { evento: ev, vagas: rs[0].k, previsoesAbertas: n, brier: b / n, brierReferencia: bb / n, habilidade: 1 - b / bb, calibracao: calibrar(rs.filter(r => r.p > 0 && r.p < 1), 1000) };
  });
}

function rodar() {
  const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'parseTab', 'applyQuadCAuto', 'applySdKoAuto',
    'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING', 'SD_RES', 'SD_TIMES']);
  const dados = require('./lib/appdata.cjs').load();
  const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results.json'), 'utf8'));
  const C = serieC(E, dados, R.quad_c || []), D = serieD(E, R.ko_d || []);
  const abertas = rs => rs.filter(r => r.p > 0 && r.p < 1);
  const out = { results_json: dados.updated_at, nSims: NSIMS,
    series: { C: { porEvento: resumir(C.recs), calibracao: calibrar(abertas(C.recs)), etapas: C.rotulos }, D: { porEvento: resumir(D.recs), calibracao: calibrar(abertas(D.recs)), etapas: D.rotulos } },
    geral: { calibracao: calibrar(abertas([...C.recs, ...D.recs])) } };
  const traj = { C: trajetorias(C.recs), D: trajetorias(D.recs) };
  return { out, traj, etapas: { C: C.rotulos, D: D.rotulos } };
}

module.exports = { rodar };

if (require.main === module) {
  const { out, traj, etapas } = rodar();
  const pc = x => (x * 100).toFixed(0) + '%', pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
  const tabela = (titulo, c) => {
    console.log(`\n${titulo}: ${c.n} previsões abertas de ${c.clubes} clubes | erro médio de calibração ${(c.ece * 100).toFixed(1)} pp`);
    for (const f of c.faixas) if (f.n) console.log(`  ${f.faixa.padEnd(10)} | ${String(f.n).padStart(6)} | ${String(f.casos).padStart(5)} | ${pc(f.previsto).padStart(5)} | ${pc(f.observado).padStart(5)} | ${pp(f.diferenca)} [${pp(f.ic95[0])}; ${pp(f.ic95[1])}]${f.compativel ? '' : '  <- fora'}`);
  };
  for (const [sk, s] of Object.entries(out.series)) {
    console.log(`\n===== Série ${sk}: fases finais`);
    for (const e of s.porEvento) console.log(`  ${e.evento.padEnd(20)} | vagas ${String(e.vagas).padStart(2)} | ${String(e.previsoesAbertas).padStart(5)} previsões abertas | Brier ${e.brier.toFixed(3)} · referência ${e.brierReferencia.toFixed(3)} | habilidade ${pc(e.habilidade)}`);
    tabela(`Calibração, Série ${sk}`, s.calibracao);
  }
  tabela('Calibração, C + D', out.geral.calibracao);
  fs.writeFileSync(path.join(__dirname, 'out', 'matamata2026.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'out', 'matamata2026_trajetorias.json'), JSON.stringify({ results_json: out.results_json, nSims: NSIMS, etapas, series: traj }) + '\n');
  console.log('\n-> eval/out/matamata2026.json');
}
