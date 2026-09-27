// "O Brier de 0,63 nao e muito ruim?" — depende inteiramente da escala, e a escala do 1X2
// e COMPRIMIDA. Este modulo calcula as ancoras que situam o numero:
//
//   uniforme (1/3,1/3,1/3)      0,667   o zero de informacao
//   taxa-base walk-forward      ~0,65   so frequencias historicas, sem olhar quem joga
//   modelo (vigente/candidata)  medido
//   auto-esperado               media de (1 - somatorio p^2): o Brier que o proprio modelo
//                               espera de si se suas probabilidades forem a verdade. Se o
//                               realizado ~= auto-esperado, o modelo entrega o que promete e
//                               o nivel do Brier reflete FALTA DE INFORMACAO, nao desonestidade.
//   clarividente                ratings FINAIS da temporada (vazamento deliberado: treina em
//                               todos os jogos, preve todos). Teto do que estimativa de forca
//                               perfeita alcancaria nesta familia de modelo. O que sobra
//                               abaixo dele exige informacao de JOGO (escalacao, desfalque,
//                               descanso), nao de forca.
//
// Alem do Brier multiclasse, calcula o RPS DE PARTIDA 1X2 — RPS_match = 1/2 * [(pH-oH)^2 +
// (pH+pD-oH-oD)^2] — porque e a metrica em que existem benchmarks publicos de casas de
// aposta (odds de fechamento: ~0,18-0,20 nas grandes ligas europeias, 0,20-0,22 nas
// divisoes inferiores; fonte no relatorio). Comparar na metrica dos outros, nao na nossa.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const { contextos } = require('./poder.cjs');
const { cfgCandidata, seedCorrigida } = require('./candidato.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'calcProbs',
  'computeCurrentAD', 'ufOfTeam',
  'SA_NM', 'SA_RANKING', 'SB_NM', 'SB_RANKING', 'SC_NM', 'SC_RANKING',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

const rpsPartida = P => P.reduce((a, x) => {
  const c1 = x.pH - x.oH, c2 = x.pH + x.pD - x.oH - x.oD;
  return a + 0.5 * (c1 * c1 + c2 * c2);
}, 0) / P.length;

const autoEsperado = P => P.reduce((a, x) =>
  a + (1 - (x.pH * x.pH + x.pD * x.pD + x.pA * x.pA)), 0) / P.length;

function medidas(P) {
  return { n: P.length, brier: M.score(P).brier, rpsPartida: rpsPartida(P), autoEsperado: autoEsperado(P) };
}

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const cand = cfgCandidata(cfg0, false);
  const dados = require('./lib/appdata.cjs').load();
  const ctxs = contextos(E, dados);
  const saida = { series: {} };
  const agg = { atual: [], candidata: [], clarividente: [], taxaBase: [] };

  for (const ctx of ctxs) {
    const geAtual = t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);
    const geCand = ctx.sk === 'A' ? seedCorrigida(ctx.times, ctx.ranking, 0.40) : geAtual;

    const pAtual = W.aPreds(W.walkForward(E, ctx.times, geAtual, ctx.res, cfg0, ctx.sk, cfg0.defaultAlpha, false), 0);
    const pCand = W.aPreds(W.walkForward(E, ctx.times, geCand, ctx.res, cand, ctx.sk, cand.defaultAlpha, false), 0);
    const pBase = M.baselineWalkForward(pCand);

    // Clarividente: ratings pos-temporada (computeCurrentAD processa todos os jogos reais),
    // previsao fixa jogo a jogo com esses ratings. Vazamento de informacao DE PROPOSITO.
    const fin = E.computeCurrentAD(ctx.times, geCand, ctx.res, cand, ctx.sk, cand.defaultAlpha, false);
    const { mc, mf } = E.getML(cand, ctx.sk);
    const pClar = ctx.res.map(r => {
      if (fin.elo[r.c] === undefined || fin.elo[r.f] === undefined) return null;
      const { lC, lF } = E.calcL(fin.atk[r.c], fin.def[r.c], fin.atk[r.f], fin.def[r.f],
        fin.elo[r.c], fin.elo[r.f], mc, mf, cand.homeAdv, false);
      const pr = E.calcProbs(lC, lF);
      return { pH: pr.pH / 100, pD: pr.pD / 100, pA: pr.pA / 100, oH: r.gc > r.gf ? 1 : 0, oD: r.gc === r.gf ? 1 : 0, oA: r.gc < r.gf ? 1 : 0 };
    }).filter(Boolean);

    saida.series[ctx.sk] = {
      atual: medidas(pAtual),
      candidata: medidas(pCand),
      clarividente: medidas(pClar),
      taxaBase: medidas(pBase),
    };
    agg.atual.push(...pAtual); agg.candidata.push(...pCand);
    agg.clarividente.push(...pClar); agg.taxaBase.push(...pBase);
  }

  saida.agregado = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, medidas(v)]));
  saida.uniforme = { brier: 2 / 3, rpsPartida: null };
  return saida;
}

if (require.main === module) {
  const r = rodar();
  const linha = (rot, m) => console.log(
    `${rot.padEnd(13)} Brier ${m.brier.toFixed(4)}  RPS/jogo ${m.rpsPartida.toFixed(4)}  auto-esperado ${m.autoEsperado.toFixed(4)}  (n=${m.n})`);
  for (const [sk, s] of Object.entries(r.series)) {
    console.log(`\n=== ${sk} ===`);
    for (const k of ['taxaBase', 'atual', 'candidata', 'clarividente']) linha(k, s[k]);
  }
  console.log('\n=== AGREGADO ===');
  for (const k of ['taxaBase', 'atual', 'candidata', 'clarividente']) linha(k, r.agregado[k]);
  console.log('\nreferencias externas (RPS/jogo de odds de fechamento): grandes ligas europeias');
  console.log('0,18-0,20; divisoes inferiores 0,20-0,22 (pena.lt, temporada 2024/25; Brasil nao coberto).');
  const dst = path.join(__dirname, 'out', 'piso.json');
  fs.writeFileSync(dst, JSON.stringify(r, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, rpsPartida, autoEsperado };
