// PARAMETROS QUE NAO SAO SEMENTE, na base multi-temporada: mando (pesoCasa), preset de
// aprendizado, Dixon-Coles e total de gols.
//
// As recomendacoes 2, 7, 9 e 11 do REPORT.md sairam de uma temporada so (2026, jogos ate
// 19/08). Aqui o motor de hoje roda as Series A, B, C e D de 2022 a 2025 (fase de liga; na D,
// os oito grupos) e cada recomendacao e posta contra a config vigente em 16 celulas
// temporada x serie. Clube e o id da CBF. Nenhum numero testado foi ajustado nestes jogos:
// os vigentes sao os do app e os candidatos vieram de 2026.
//
// Tres estagios:
//
//   node eval/hist/parametros.cjs          # jogo a jogo (walk-forward, Brier 1X2), segundos
//   node eval/hist/parametros.cjs --zona   # eventos de zona por Monte Carlo, minutos
//   node eval/hist/parametros.cjs --2026   # a candidata do historico nos jogos de 2026
//
// CANDIDATA DO HISTORICO, sempre fora da amostra: para cada ano, o pesoCasa unico que
// minimiza o Brier agrupado das quatro series nos OUTROS tres anos ("pesoHist") e o total de
// gols observado na mesma serie nos outros tres anos ("totalHist"). "candidata" junta os dois.
// No estagio --2026 os dois numeros saem dos quatro anos e sao aplicados a 2026.
//
// O estagio jogo a jogo tem poder (5,6 mil jogos) e cobre o que o Monte Carlo do app nao
// expoe (Dixon-Coles). O estagio --zona e a regua combinada para o veredito: Brier dos
// eventos de zona em quatro cortes, 12 de 16 celulas (4 de 4 para licao de uma serie so).
//
// SEMENTE. As temporadas passadas nao tem a nota dada a mao, entao tudo roda com "todos
// iguais" e, como checagem de robustez, com a tabela do ano anterior em amplitude 0,25 (a
// melhor semente por regra, ver sementes.cjs). Isso importa para o preset: sem semente o
// modelo precisa aprender tudo dos jogos, o que favorece o preset mais rapido.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../../scripts/engine.cjs');
const M = require('../lib/metrics.cjs');
const W = require('../lib/walkforward.cjs');
const L = require('../lib/longterm.cjs');
const S = require('../lib/seeds.cjs');
const { lerCsv } = require('./ingerir.cjs');
const { ligas, piramide, eloPorPosto, aliases } = require('./sementes.cjs');

const ANOS = [2022, 2023, 2024, 2025], SERIES = ['A', 'B', 'C', 'D'];
const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;
const PESOS = [0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 0.62, 0.64, 0.66, 0.68, 0.70];
const RHOS = [-0.20, -0.15, -0.10, -0.05];
const PRESETS = ['conservador', 'base', 'agressivo'];
const PESO_UNICO = 0.58;          // recomendacao 2 de setembro
const EVENTOS = {
  A: [['1o', 1, 1], ['top4', 1, 4], ['top6', 1, 6], ['z4', 17, 20]],
  B: [['1o', 1, 1], ['top4', 1, 4], ['z4', 17, 20]],
  C: [['1o', 1, 1], ['top8', 1, 8], ['z4', 17, 20]],
  D: [['1o', 1, 1], ['top4', 1, 4]],
};
const NSIMS = parseInt(process.argv.find(a => /^\d+$/.test(a))) || 2000;

function carregar() {
  const jogos = lerCsv();
  const LG = ligas(jogos);
  const al = aliases(jogos).mapa;
  const celulas = [];
  for (const ano of ANOS) {
    const posto = piramide(LG, ano - 1);
    for (const serie of SERIES) {
      const ls = LG[`${ano}|${serie}`];
      const elo = eloPorPosto(ls.flatMap(l => l.times), posto, al);
      celulas.push({
        ano, serie,
        ligas: ls.map(l => ({
          times: l.times, H: l.jogos.reduce((m, g) => Math.max(m, g.rodada), 0),
          fixture: l.jogos.map(g => ({ casa: g.id_m, fora: g.id_v, rodada: g.rodada, data: g.data })),
          res: l.jogos.filter(g => g.gm != null).map(g => ({ c: g.id_m, f: g.id_v, gc: g.gm, gf: g.gv, r: g.rodada })),
        })),
        sementes: { iguais: () => CENTRO, 'anterior@0.25': t => CENTRO + 0.25 * (elo[t] - CENTRO) },
      });
    }
  }
  return celulas;
}

const comCfg = (cfg0, serie, m) => { const c = structuredClone(cfg0); Object.assign(c.lambdas[serie], m); return c; };
const comPeso = (cfg0, serie, p) => comCfg(cfg0, serie, { pesoCasa: p });

// Walk-forward de uma celula inteira (na D, os oito grupos em sequencia).
function lams(E, cel, cfg, preset, ge) {
  return cel.ligas.flatMap(l => W.walkForward(E, l.times, ge, l.res, cfg, cel.serie, preset, false));
}

function vies(ps) {
  let sH = 0, oH = 0, vH = 0, sD = 0, oD = 0, vD = 0;
  for (const p of ps) { sH += p.pH; oH += p.oH; vH += p.pH * (1 - p.pH); sD += p.pD; oD += p.oD; vD += p.pD * (1 - p.pD); }
  const n = ps.length;
  return { casaPrevMenosObs: (sH - oH) / n, zCasa: (sH - oH) / Math.sqrt(vH), empatePrevMenosObs: (sD - oD) / n, zEmpate: (sD - oD) / Math.sqrt(vD) };
}
const delta = (a, b) => { const x = M.bootstrapDelta(a, b); return { delta: x.delta, ic95: x.ic95, significativo: x.significativo }; };

function jogoAJogo() {
  const E = loadEngine(['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR']);
  const cfg0 = E.DEFAULT_CFG, celulas = carregar();
  const out = { celulas: [], porSerie: {}, geral: {}, loyo: {}, pesoHist: {}, totalHist: {}, historico: null, veredito: {} };
  // predicoes guardadas para os agrupados: P[semente][variante][serie] = lista
  const P = {};
  const guarda = (sem, v, serie, ps) => { ((P[sem] = P[sem] || {})[v] = P[sem][v] || {})[serie] = (P[sem][v][serie] || []).concat(ps); };
  const porPeso = {};   // porPeso[semente][serie][ano][peso] = predicoes (para o deixa-um-ano-fora)

  for (const cel of celulas) {
    const { ano, serie } = cel, pesoVig = cfg0.lambdas[serie].pesoCasa;
    const todos = cel.ligas.flatMap(l => l.res);
    const gc = todos.reduce((a, r) => a + r.gc, 0), gf = todos.reduce((a, r) => a + r.gf, 0), n = todos.length;
    const linha = {
      ano, serie, jogos: n,
      observado: {
        mandante: todos.filter(r => r.gc > r.gf).length / n, empate: todos.filter(r => r.gc === r.gf).length / n,
        golsPorJogo: (gc + gf) / n, pesoCasa: gc / (gc + gf),
      },
      config: { total: cfg0.lambdas[serie].total, pesoCasa: pesoVig },
      sementes: {},
    };
    for (const [sem, ge] of Object.entries(cel.sementes)) {
      const lv = lams(E, cel, cfg0, cfg0.defaultAlpha, ge), pv = W.aPreds(lv, 0);
      const r = { brier: { vigente: M.score(pv).brier, taxaBase: M.score(M.baselineWalkForward(pv)).brier }, vies: { vigente: vies(pv) }, mando: {}, preset: {}, dixonColes: {} };
      guarda(sem, 'vigente', serie, pv);
      // mando
      for (const p of PESOS) {
        const ps = W.aPreds(lams(E, cel, comPeso(cfg0, serie, p), cfg0.defaultAlpha, ge), 0);
        r.mando[p.toFixed(2)] = M.score(ps).brier;
        (((porPeso[sem] = porPeso[sem] || {})[serie] = porPeso[sem][serie] || {})[ano] = porPeso[sem][serie][ano] || {})[p.toFixed(2)] = ps;
        if (p === PESO_UNICO) { r.vies.pesoUnico = vies(ps); r.pesoUnicoMenosVigente = delta(ps, pv); guarda(sem, 'pesoUnico', serie, ps); }
      }
      r.mando.otimo = Object.entries(r.mando).sort((a, b) => a[1] - b[1])[0][0];
      // preset
      for (const pr of PRESETS) {
        const ps = pr === cfg0.defaultAlpha ? pv : W.aPreds(lams(E, cel, cfg0, pr, ge), 0);
        r.preset[pr] = M.score(ps).brier;
        if (pr === 'base') { r.baseMenosConservador = delta(ps, pv); guarda(sem, 'base', serie, ps); }
        if (pr === 'agressivo') guarda(sem, 'agressivo', serie, ps);
      }
      // Dixon-Coles sobre os mesmos lambdas
      for (const rho of RHOS) {
        const ps = W.aPreds(lv, rho);
        r.dixonColes[rho.toFixed(2)] = M.score(ps).brier;
        guarda(sem, 'dc' + rho.toFixed(2), serie, ps);
        if (rho === -0.10) r.viesEmpateDC = vies(ps).empatePrevMenosObs;
      }
      linha.sementes[sem] = r;
    }
    out.celulas.push(linha);
  }

  // Candidata do historico, fora da amostra (deixa-um-ano-fora).
  const obsDe = (serie, anos) => { const cs = out.celulas.filter(c => c.serie === serie && anos.includes(c.ano)); const n = cs.reduce((a, c) => a + c.jogos, 0); return cs.reduce((a, c) => a + c.observado.golsPorJogo * c.jogos, 0) / n; };
  const melhorPeso = (sem, anos) => PESOS.map(p => p.toFixed(2)).map(p => [p, M.score(anos.flatMap(a => SERIES.flatMap(sr => porPeso[sem][sr][a][p]))).brier]).sort((a, b) => a[1] - b[1])[0][0];
  for (const sem of Object.keys(porPeso)) {
    out.pesoHist[sem] = {};
    for (const ano of ANOS) out.pesoHist[sem][ano] = melhorPeso(sem, ANOS.filter(a => a !== ano));
  }
  for (const sr of SERIES) { out.totalHist[sr] = {}; for (const ano of ANOS) out.totalHist[sr][ano] = +obsDe(sr, ANOS.filter(a => a !== ano)).toFixed(3); }
  out.historico = { pesoCasa: Number(melhorPeso('iguais', ANOS)), total: Object.fromEntries(SERIES.map(sr => [sr, +obsDe(sr, ANOS).toFixed(2)])) };
  for (const cel of celulas) {
    const { ano, serie } = cel, linha = out.celulas.find(c => c.ano === ano && c.serie === serie);
    for (const [sem, ge] of Object.entries(cel.sementes)) {
      const r = linha.sementes[sem], ph = Number(out.pesoHist[sem][ano]), th = out.totalHist[serie][ano];
      const vs = { pesoHist: { pesoCasa: ph }, totalHist: { total: th }, candidata: { pesoCasa: ph, total: th } };
      r.historico = {}; r.viesHist = {};
      for (const [v, m] of Object.entries(vs)) {
        const ps = W.aPreds(lams(E, cel, comCfg(cfg0, serie, m), cfg0.defaultAlpha, ge), 0);
        r.historico[v] = M.score(ps).brier; r.viesHist[v] = vies(ps); guarda(sem, v, serie, ps);
      }
    }
  }

  // Agrupados: por serie (4 anos) e geral (16 celulas), com bootstrap pareado nos jogos.
  for (const sem of Object.keys(P)) {
    out.porSerie[sem] = {};
    const cat = v => SERIES.flatMap(s => P[sem][v][s]);
    const resumo = (get) => {
      const pv = get('vigente'), o = { jogos: pv.length, brierVigente: M.score(pv).brier, taxaBase: M.score(M.baselineWalkForward(pv)).brier, vies: vies(pv), viesPesoUnico: vies(get('pesoUnico')), viesPesoHist: vies(get('pesoHist')), viesCandidata: vies(get('candidata')) };
      for (const v of Object.keys(P[sem]).filter(v => v !== 'vigente')) o[v + 'MenosVigente'] = delta(get(v), pv);
      return o;
    };
    for (const s of SERIES) out.porSerie[sem][s] = resumo(v => P[sem][v][s]);
    out.geral[sem] = resumo(cat);
  }

  // Deixa-um-ano-fora: o pesoCasa que minimiza o Brier nos outros tres anos, aplicado ao ano
  // de fora e comparado com o vigente. E o que uma regra "ajuste pelo historico" entregaria.
  for (const sem of Object.keys(porPeso)) {
    out.loyo[sem] = {};
    for (const s of SERIES) {
      out.loyo[sem][s] = ANOS.map(ano => {
        const outros = ANOS.filter(a => a !== ano);
        const escolhido = PESOS.map(p => p.toFixed(2)).map(p => [p, M.score(outros.flatMap(a => porPeso[sem][s][a][p])).brier]).sort((a, b) => a[1] - b[1])[0][0];
        const cel = out.celulas.find(c => c.ano === ano && c.serie === s).sementes[sem];
        return { ano, escolhido, brier: cel.mando[escolhido], vigente: cel.brier.vigente, melhora: cel.mando[escolhido] < cel.brier.vigente };
      });
    }
  }

  // Veredito por contagem de celulas (jogo a jogo; a regua combinada e a do estagio --zona).
  for (const sem of Object.keys(P)) {
    const cs = out.celulas.map(c => ({ serie: c.serie, ...c.sementes[sem] }));
    const conta = f => { const g = cs.filter(f); const ps = {}; SERIES.forEach(s => ps[s] = g.filter(c => c.serie === s).length); return { celulas: g.length, de: cs.length, porSerie: ps }; };
    out.veredito[sem] = {
      pesoUnico: conta(c => c.mando[PESO_UNICO.toFixed(2)] < c.brier.vigente),
      pesoHist: conta(c => c.historico.pesoHist < c.brier.vigente),
      totalHist: conta(c => c.historico.totalHist < c.brier.vigente),
      candidata: conta(c => c.historico.candidata < c.brier.vigente),
      base: conta(c => c.preset.base < c.brier.vigente),
      agressivo: conta(c => c.preset.agressivo < c.brier.vigente),
      loyoPesoCasa: (() => { const ps = {}; let t = 0; SERIES.forEach(s => { ps[s] = out.loyo[sem][s].filter(x => x.melhora).length; t += ps[s]; }); return { celulas: t, de: 16, porSerie: ps }; })(),
    };
    RHOS.forEach(rho => out.veredito[sem]['dc' + rho.toFixed(2)] = conta(c => c.dixonColes[rho.toFixed(2)] < c.brier.vigente));
  }
  return out;
}

// Estagio --zona: Brier dos eventos de zona por Monte Carlo, quatro cortes, sementes iguais.
// Variantes de config que o simMC aceita (Dixon-Coles nao existe no motor).
function zona(variantesDe) {
  const E = loadEngine(['DEFAULT_CFG', 'simMC', 'calcClassif']);
  const cfg0 = E.DEFAULT_CFG, celulas = carregar(), out = [];
  for (const cel of celulas) {
    const { ano, serie } = cel, vs = variantesDe(cfg0, serie, ano);
    const soma = {}, soma0 = {}; let n = 0, n0 = 0;
    Object.keys(vs).forEach(v => { soma[v] = 0; soma0[v] = 0; });
    cel.ligas.forEach((l, gi) => {
      const real = {}; E.calcClassif(l.times, l.res).forEach(c => real[c.time] = c.pos);
      const ranking = {}; l.times.forEach(t => ranking[t] = { elo: CENTRO });
      for (const corte of [0, Math.round(l.H * 0.25), Math.round(l.H * 0.5), Math.round(l.H * 0.75)]) {
        for (const [v, { total, pesoCasa, preset }] of Object.entries(vs)) {
          // Pontos corridos puros: sk 'A' com os gols e o mando da variante.
          const cfg = structuredClone(cfg0); cfg.lambdas.A = { total, pesoCasa };
          const { dist } = L.preverEm(E, { times: l.times, ranking, fixture: l.fixture, res: l.res, cfg, sk: 'A', H: l.H, corte, nSims: NSIMS, ak: preset, seed: ano * 1000 + gi * 37 + corte * 7 + serie.charCodeAt(0) });
          let b = 0, m = 0;
          for (const [, de, ate0] of EVENTOS[serie]) { const ate = Math.min(ate0, l.times.length); for (const t of l.times) { const p = L.soma(dist[t], de - 1, ate), o = real[t] >= de && real[t] <= ate ? 1 : 0; b += (p - o) ** 2; m++; } }
          soma[v] += b / m; if (corte === 0) soma0[v] += b / m;
        }
        n++; if (corte === 0) n0++;
      }
    });
    const c = { ano, serie, brier: {}, brierPre: {} };
    Object.keys(vs).forEach(v => { c.brier[v] = soma[v] / n; c.brierPre[v] = soma0[v] / n0; });
    out.push(c);
    process.stderr.write(`  ${ano} ${serie}: ` + Object.entries(c.brier).map(([v, x]) => `${v} ${x.toFixed(4)}`).join(' | ') + '\n');
  }
  const veredito = {};
  for (const v of Object.keys(out[0].brier).filter(v => v !== 'vigente')) {
    const g = out.filter(c => c.brier[v] < c.brier.vigente), ps = {};
    SERIES.forEach(s => ps[s] = g.filter(c => c.serie === s).length);
    veredito[v] = { celulas: g.length, de: out.length, porSerie: ps, ganhoMedio: out.reduce((a, c) => a + (1 - c.brier[v] / c.brier.vigente), 0) / out.length,
      ganhoPorSerie: Object.fromEntries(SERIES.map(s => [s, out.filter(c => c.serie === s).reduce((a, c) => a + (1 - c.brier[v] / c.brier.vigente), 0) / 4])), passa: g.length >= 12 };
  }
  return { nSims: NSIMS, celulas: out, veredito };
}

// Estagio --2026: a candidata tirada dos quatro anos, nos jogos de 2026 com a semente do app.
// E a metade "nao piora em 2026" da regra. Jogo a jogo; a versao por eventos de zona fica
// para a corrida de dezembro, com a Serie A encerrada.
function em2026(hist) {
  const SIMB = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'ufOfTeam', 'simMC', 'parseTab', 'calcClassif',
    'SA_NM', 'SA_RANKING', 'SA_TAB', 'SA_DATES', 'SB_NM', 'SB_RANKING', 'SB_TAB', 'SB_DATES', 'SC_NM', 'SC_RANKING', 'SC_TAB', 'SC_DATES',
    'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];
  const E = loadEngine(SIMB), cfg0 = E.DEFAULT_CFG;
  const dados = require('../lib/appdata.cjs').load();
  const { contextos } = require('../poder.cjs');
  const fronteira = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'holdout_ago19.json'), 'utf8'));
  const out = { results_json: dados.updated_at, historico: hist, series: {}, geral: null };
  const acum = {};
  for (const ctx of contextos(E, dados)) {
    if (!SERIES.includes(ctx.sk)) continue;
    const ge = t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);
    const wf = (cfg, preset) => W.walkForward(E, ctx.times, ge, ctx.res, cfg, ctx.sk, preset, false);
    const lv = wf(cfg0, cfg0.defaultAlpha), pv = W.aPreds(lv, 0);
    const antigos = fronteira[ctx.sk] ? new Set(fronteira[ctx.sk]) : null;
    const fora = lv.map(g => antigos ? !antigos.has(g.c + '|' + g.f) : false);
    const vs = {
      pesoHist: W.aPreds(wf(comCfg(cfg0, ctx.sk, { pesoCasa: hist.pesoCasa }), cfg0.defaultAlpha), 0),
      totalHist: W.aPreds(wf(comCfg(cfg0, ctx.sk, { total: hist.total[ctx.sk] }), cfg0.defaultAlpha), 0),
      candidata: W.aPreds(wf(comCfg(cfg0, ctx.sk, { pesoCasa: hist.pesoCasa, total: hist.total[ctx.sk] }), cfg0.defaultAlpha), 0),
      base: W.aPreds(wf(cfg0, 'base'), 0),
      'dc-0.05': W.aPreds(lv, -0.05),
    };
    const todos = ctx.res, gc = todos.reduce((a, r) => a + r.gc, 0), gf = todos.reduce((a, r) => a + r.gf, 0);
    const linha = { jogos: pv.length, fora: fora.filter(Boolean).length,
      observado: { mandante: todos.filter(r => r.gc > r.gf).length / todos.length, empate: todos.filter(r => r.gc === r.gf).length / todos.length, golsPorJogo: (gc + gf) / todos.length, pesoCasa: gc / (gc + gf) },
      config: { ...cfg0.lambdas[ctx.sk] }, brierVigente: M.score(pv).brier, vies: vies(pv), variantes: {} };
    (acum.vigente = acum.vigente || []).push(...pv);
    for (const [v, ps] of Object.entries(vs)) {
      linha.variantes[v] = { brier: M.score(ps).brier, menosVigente: delta(ps, pv), vies: vies(ps) };
      if (linha.fora) linha.variantes[v].foraDaAmostra = delta(ps.filter((_, i) => fora[i]), pv.filter((_, i) => fora[i]));
      (acum[v] = acum[v] || []).push(...ps);
    }
    out.series[ctx.sk] = linha;
  }
  out.geral = { jogos: acum.vigente.length, brierVigente: M.score(acum.vigente).brier, vies: vies(acum.vigente), variantes: {} };
  for (const v of Object.keys(acum).filter(v => v !== 'vigente')) out.geral.variantes[v] = { brier: M.score(acum[v]).brier, menosVigente: delta(acum[v], acum.vigente), vies: vies(acum[v]) };
  return out;
}

module.exports = { jogoAJogo, zona, em2026, carregar, PESO_UNICO };

if (require.main === module) {
  const f = x => x.toFixed(4), s = x => (x >= 0 ? '+' : '') + x.toFixed(4), pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' pp';
  const ic = d => `${s(d.delta)} [${s(d.ic95[0])}, ${s(d.ic95[1])}]${d.significativo ? ' SIG' : ''}`;
  const arq = path.join(__dirname, '..', 'out', 'hist_parametros.json');
  if (process.argv.includes('--2026')) {
    const jj = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const out = em2026(jj.historico);
    console.log(`candidata do historico (2022-2025): pesoCasa ${out.historico.pesoCasa} nas quatro ligas | total ${JSON.stringify(out.historico.total)}`);
    for (const [sk, l] of Object.entries(out.series)) {
      console.log(`\n== Serie ${sk} 2026: ${l.jogos} jogos (${l.fora} depois de 19/08) | obs: mandante ${(l.observado.mandante * 100).toFixed(1)}%, empate ${(l.observado.empate * 100).toFixed(1)}%, gols ${l.observado.golsPorJogo.toFixed(2)}, pesoCasa ${l.observado.pesoCasa.toFixed(3)} | config ${l.config.total}, ${l.config.pesoCasa}`);
      console.log(`   vigente    Brier ${f(l.brierVigente)} | vies casa ${pp(l.vies.casaPrevMenosObs)} (z ${l.vies.zCasa.toFixed(1)}), empate ${pp(l.vies.empatePrevMenosObs)} (z ${l.vies.zEmpate.toFixed(1)})`);
      for (const [v, r] of Object.entries(l.variantes)) console.log(`   ${v.padEnd(10)} Brier ${f(r.brier)} | menos vigente ${ic(r.menosVigente)}${r.foraDaAmostra ? ' | so depois de 19/08: ' + ic(r.foraDaAmostra) : ''} | vies casa ${pp(r.vies.casaPrevMenosObs)}, empate ${pp(r.vies.empatePrevMenosObs)}`);
    }
    console.log(`\n== 2026, quatro ligas (${out.geral.jogos} jogos): vigente ${f(out.geral.brierVigente)} | vies casa ${pp(out.geral.vies.casaPrevMenosObs)} (z ${out.geral.vies.zCasa.toFixed(1)})`);
    for (const [v, r] of Object.entries(out.geral.variantes)) console.log(`   ${v.padEnd(10)} ${f(r.brier)} | menos vigente ${ic(r.menosVigente)} | vies casa ${pp(r.vies.casaPrevMenosObs)}`);
    jj.em2026 = out; fs.writeFileSync(arq, JSON.stringify(jj, null, 2) + '\n');
    console.log('-> eval/out/hist_parametros.json (campo em2026)');
  } else if (process.argv.includes('--zona')) {
    const jj = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const out = zona((cfg0, serie, ano) => {
      const l = cfg0.lambdas[serie], ph = Number(jj.pesoHist.iguais[ano]), th = jj.totalHist[serie][ano], pr = cfg0.defaultAlpha;
      return {
        vigente: { ...l, preset: pr },
        pesoUnico: { ...l, pesoCasa: PESO_UNICO, preset: pr },
        pesoHist: { ...l, pesoCasa: ph, preset: pr },
        totalHist: { ...l, total: th, preset: pr },
        candidata: { total: th, pesoCasa: ph, preset: pr },
        base: { ...l, preset: 'base' },
      };
    });
    console.log('\nveredito por eventos de zona (contra a config vigente; 12 de 16, ou 4 de 4 numa serie):');
    for (const [v, r] of Object.entries(out.veredito)) console.log(`  ${v}: melhor em ${r.celulas}/${r.de} (A ${r.porSerie.A}, B ${r.porSerie.B}, C ${r.porSerie.C}, D ${r.porSerie.D}) | ganho medio ${(r.ganhoMedio * 100).toFixed(1)}% (A ${(r.ganhoPorSerie.A * 100).toFixed(1)}, B ${(r.ganhoPorSerie.B * 100).toFixed(1)}, C ${(r.ganhoPorSerie.C * 100).toFixed(1)}, D ${(r.ganhoPorSerie.D * 100).toFixed(1)}) | ${r.passa ? 'PASSA' : 'nao passa'}`);
    jj.zona = out; fs.writeFileSync(arq, JSON.stringify(jj, null, 2) + '\n');
    console.log('-> eval/out/hist_parametros.json (campo zona)');
  } else {
    const out = jogoAJogo();
    for (const sem of Object.keys(out.geral)) {
      console.log(`\n=== semente: ${sem} ===`);
      console.log('serie | jogos | obs: mandante, empate, gols/jogo, pesoCasa | config total, pesoCasa | Brier vigente (taxa-base) | vies de casa vigente -> com 0,58');
      for (const sr of SERIES) {
        const cs = out.celulas.filter(c => c.serie === sr), n = cs.reduce((a, c) => a + c.jogos, 0), w = k => cs.reduce((a, c) => a + c.observado[k] * c.jogos, 0) / n, a = out.porSerie[sem][sr];
        console.log(`  ${sr} | ${n} | ${(w('mandante') * 100).toFixed(1)}%, ${(w('empate') * 100).toFixed(1)}%, ${w('golsPorJogo').toFixed(2)}, ${w('pesoCasa').toFixed(3)} | ${cs[0].config.total}, ${cs[0].config.pesoCasa} | ${f(a.brierVigente)} (${f(a.taxaBase)}) | ${pp(a.vies.casaPrevMenosObs)} (z ${a.vies.zCasa.toFixed(1)}) -> ${pp(a.viesPesoUnico.casaPrevMenosObs)} (z ${a.viesPesoUnico.zCasa.toFixed(1)})`);
      }
      console.log('otimo de pesoCasa por celula (2022..2025): ' + SERIES.map(sr => sr + ' ' + out.celulas.filter(c => c.serie === sr).map(c => c.sementes[sem].mando.otimo).join(' ')).join(' | '));
      console.log('deixa-um-ano-fora, pesoCasa escolhido: ' + SERIES.map(sr => sr + ' ' + out.loyo[sem][sr].map(x => x.escolhido + (x.melhora ? '+' : '-')).join(' ')).join(' | '));
      console.log('agrupado por serie, variante menos vigente (negativo = melhor):');
      console.log(`candidata do historico, fora da amostra: pesoCasa unico por ano de fora ${ANOS.map(a => out.pesoHist[sem][a]).join(' ')} | total por serie (2022..2025) ${SERIES.map(sr => sr + ' ' + ANOS.map(a => out.totalHist[sr][a].toFixed(2)).join(' ')).join(' | ')}`);
      console.log('vies da candidata (casa; empate): ' + SERIES.map(sr => { const a = out.porSerie[sem][sr].viesCandidata; return `${sr} ${pp(a.casaPrevMenosObs)} (z ${a.zCasa.toFixed(1)}); ${pp(a.empatePrevMenosObs)} (z ${a.zEmpate.toFixed(1)})`; }).join(' | '));
      for (const v of ['pesoUnico', 'pesoHist', 'totalHist', 'candidata', 'base', 'agressivo', 'dc-0.05', 'dc-0.10', 'dc-0.15', 'dc-0.20']) console.log(`  ${v.padEnd(10)} ` + SERIES.map(sr => `${sr} ${ic(out.porSerie[sem][sr][v + 'MenosVigente'])}`).join(' | ') + ` || geral ${ic(out.geral[sem][v + 'MenosVigente'])}`);
      console.log('contagem de celulas melhores que a vigente:');
      for (const [v, r] of Object.entries(out.veredito[sem])) console.log(`  ${v.padEnd(13)} ${r.celulas}/${r.de} (A ${r.porSerie.A}, B ${r.porSerie.B}, C ${r.porSerie.C}, D ${r.porSerie.D})`);
    }
    const antes = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : {};
    if (antes.zona) out.zona = antes.zona;
    if (antes.em2026) out.em2026 = antes.em2026;
    fs.writeFileSync(arq, JSON.stringify(out, null, 2) + '\n');
    console.log('\n-> eval/out/hist_parametros.json');
  }
}
