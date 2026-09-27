// Runner do estágio de CURTO PRAZO. Ver eval/shortterm.cjs para o desenho e para a
// hierarquia entre calibração (estimável) e Brier (dominado por variância irredutível).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const ST = require('./shortterm.cjs');
const QUAL = require('./qualificacao.cjs');
const J = require('./lib/rncjoin.cjs');
const J25 = require('./lib/join2025.cjs');
const CB = require('./lib/copabr.cjs');
const W = require('./lib/walkforward.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'backtestSeries', 'initLeague', 'getML', 'calcL', 'updR',
  'calcProbs', 'RNC_2026', 'ufOfTeam', 'SA_NM', 'SA_RANKING', 'SB_NM', 'SB_RANKING',
  'SC_NM', 'SC_RANKING', 'SD_TIMES', 'SD_INFO', 'SD_ADJ', 'SD_UF',
  'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS', 'CB_R16_PAIRS'];

// O harness reimplementa o laço walk-forward para poder guardar os λ (o backtestSeries do
// app só devolve probabilidades). Esta checagem prova que a reimplementação é o mesmo
// modelo, não um primo: qualquer divergência acima de 1e-12 aborta.
function autoteste(E, ctxs) {
  const cfg = E.DEFAULT_CFG;
  const relatorio = [];
  for (const ctx of ctxs) {
    const ge = t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);
    const ref = E.backtestSeries(ctx.times, ge, ctx.res, cfg, ctx.sk, cfg.defaultAlpha);
    const meu = W.aPreds(W.walkForward(E, ctx.times, ge, ctx.res, cfg, ctx.sk, cfg.defaultAlpha), 0);
    if (ref.length !== meu.length) throw new Error(`autoteste ${ctx.sk}: n difere (${ref.length} vs ${meu.length})`);
    let mx = 0;
    for (let i = 0; i < ref.length; i++) {
      mx = Math.max(mx, Math.abs(ref[i].pH - meu[i].pH), Math.abs(ref[i].pD - meu[i].pD), Math.abs(ref[i].pA - meu[i].pA));
    }
    if (mx > 1e-12) throw new Error(`autoteste ${ctx.sk}: walkForward divergiu do backtestSeries do app (max ${mx})`);
    relatorio.push({ serie: ctx.sk, n: ref.length, desvioMaximo: mx });
  }
  return relatorio;
}

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const dados = require('./lib/appdata.cjs').load();
  const resolver = J.construir(E.RNC_2026, E.ufOfTeam);
  const ctxs = ['A', 'B', 'C'].map(sk => ({
    sk,
    times: [...new Set(Object.values(E[`S${sk}_NM`]))],
    ranking: E[`S${sk}_RANKING`],
    res: dados.merged[sk],
  }));
  // Serie D entra pelo mesmo caminho: SD_INFO ja tem a forma {time: {elo, ...}} que o
  // harness espera de um ranking. E a competicao com mais jogos (480) e, por isso, a unica
  // com poder estatistico real para diferencas de Brier de tamanho realista.
  ctxs.push({ sk: 'D', times: E.SD_TIMES, ranking: E.SD_INFO, res: dados.merged.D });

  // Copa do Brasil: a R32 esta guardada POSICIONALMENTE no app ({ga, gb} + CB_TEAMS/CB_R32)
  // e as oitavas vem nomeadas do results.json. lib/copabr.cjs remonta as 48 pernas com nome
  // de time, respeitando a inversao de mando na volta. Sao poucos jogos para inferencia
  // (todo IC e largo), mas e a competicao onde o modelo mais discrimina — ela cruza clubes
  // de divisoes diferentes — e por isso vale medir em vez de omitir.
  const jogosCB = CB.montar(E, dados.resultsJson);
  if (jogosCB.length) {
    ctxs.push({ sk: 'CB', times: Object.keys(E.CB_ELOS), ranking: CB.ranking(E), res: jogosCB });
  }
  const auto = autoteste(E, ctxs);
  const resolver25 = J25.construir(E.ufOfTeam);
  const r = ST.rodar(E, ctxs, { resolver, resolver25 });
  r.qualificacao = QUAL.rodar(E, ctxs, { resolver, resolver25 });
  r.autoteste = auto;
  r.fonte = { updated_at: dados.updated_at, embutidos: dados.embutidos, buscados: dados.buscados };
  return r;
}

if (require.main === module) {
  const out = rodar();
  const dst = path.join(__dirname, 'out', 'curto.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  for (const [sk, s] of Object.entries(out.series)) {
    const v = s.base.vies;
    console.log(`[${sk}] n=${s.base.score.n} Brier=${s.base.score.brier.toFixed(4)} ECE=${(s.base.ece * 100).toFixed(2)}% | vies casa ${(v.casa.gap * 100).toFixed(1)}pp (z=${v.casa.z.toFixed(2)}${v.casa.significativo ? ' SIGNIFICATIVO' : ''})`);
  }
  console.log('-> ' + dst);
}

module.exports = { rodar, autoteste };
