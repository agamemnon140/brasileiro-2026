// "Juntar as competicoes nos mesmos testes melhora o poder estatistico?"
//
// Resposta curta: depende da hipotese, e da para medir. Somar n so vira poder quando o
// efeito aponta na mesma direcao em todas as competicoes. Este modulo roda a MESMA variante
// nas cinco competicoes, agrupa (ver lib/pool.cjs) e reporta, por hipotese:
//
//   - o efeito por competicao, para ver o sinal;
//   - I2, a heterogeneidade: quanto da variacao entre competicoes nao e ruido amostral;
//   - o ganho de poder = |z| agrupado / maior |z| individual. Acima de 1, agrupar valeu.
//
// O denominador desse ganho e deliberadamente severo: o maior z entre cinco competicoes ja
// e otimista por selecao (maldicao do vencedor), entao passar dele e evidencia forte.
//
// So entram hipoteses GLOBAIS — a mesma mudanca aplicada a todas as competicoes. Ajustar
// lambdas[serie] nao e agrupavel: nao existe hipotese comum a testar.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const W = require('./lib/walkforward.cjs');
const S = require('./lib/seeds.cjs');
const P = require('./lib/pool.cjs');
const CBm = require('./lib/copabr.cjs');
const J = require('./lib/rncjoin.cjs');
const J25 = require('./lib/join2025.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'RNC_2026', 'ufOfTeam',
  'SA_NM', 'SA_RANKING', 'SB_NM', 'SB_RANKING', 'SC_NM', 'SC_RANKING',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;

function contextos(E, dados) {
  return [
    { sk: 'A', times: [...new Set(Object.values(E.SA_NM))], ranking: E.SA_RANKING, res: dados.merged.A },
    { sk: 'B', times: [...new Set(Object.values(E.SB_NM))], ranking: E.SB_RANKING, res: dados.merged.B },
    { sk: 'C', times: [...new Set(Object.values(E.SC_NM))], ranking: E.SC_RANKING, res: dados.merged.C },
    { sk: 'D', times: E.SD_TIMES, ranking: E.SD_INFO, res: dados.merged.D },
    { sk: 'CB', times: Object.keys(E.CB_ELOS), ranking: CBm.ranking(E), res: CBm.montar(E, dados.resultsJson) },
  ].filter(c => c.res && c.res.length);
}

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const resolver = J.construir(E.RNC_2026, E.ufOfTeam);
  const resolver25 = J25.construir(E.ufOfTeam);
  const ctxs = contextos(E, dados);

  const preds = (ctx, cfg, getElo, rho) =>
    W.aPreds(W.walkForward(E, ctx.times, getElo, ctx.res, cfg, ctx.sk, cfg.defaultAlpha), rho || 0);
  const eloVigente = ctx => t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);

  // Reescala a semente para um alcance comum e encolhe por k — e assim que a AMPLITUDE
  // vira uma hipotese global, comparavel entre competicoes de Elo inicial muito diferente.
  const encolher = (ctx, getElo, k) => {
    const v = {};
    ctx.times.forEach(t => v[t] = getElo(t));
    const vs = Object.values(v);
    const mn = Math.min(...vs), mx = Math.max(...vs);
    if (mx === mn) return getElo;
    return t => CENTRO + k * ((S.ELO_MIN + (S.ELO_MAX - S.ELO_MIN) * (v[t] - mn) / (mx - mn)) - CENTRO);
  };

  const comAlphas = f => { const c = structuredClone(cfg0); f(c.alphas[c.defaultAlpha]); return c; };

  const hipoteses = {
    'targetRatio 3 -> 1.5': ctx => {
      const c = structuredClone(cfg0); c.targetRatio = 1.5;
      return [preds(ctx, c, eloVigente(ctx)), preds(ctx, cfg0, eloVigente(ctx))];
    },
    'dixon-coles rho = -0.11': ctx =>
      [preds(ctx, cfg0, eloVigente(ctx), -0.11), preds(ctx, cfg0, eloVigente(ctx))],
    'alphas atk/def x0.5': ctx => {
      const c = comAlphas(a => { a.atk *= 0.5; a.def *= 0.5; });
      return [preds(ctx, c, eloVigente(ctx)), preds(ctx, cfg0, eloVigente(ctx))];
    },
    'amplitude da semente k=0.35': ctx =>
      [preds(ctx, cfg0, encolher(ctx, eloVigente(ctx), 0.35)), preds(ctx, cfg0, eloVigente(ctx))],
    'semente RNC (log) no lugar da vigente': ctx => {
      const s = S.construir(ctx.times, ctx.ranking, resolver, resolver25);
      return [preds(ctx, cfg0, s.rnc_log), preds(ctx, cfg0, eloVigente(ctx))];
    },
  };

  const saida = {};
  for (const [nome, fn] of Object.entries(hipoteses)) {
    const blocos = ctxs.map(ctx => {
      const [variante, base] = fn(ctx);
      return { competicao: ctx.sk, predsVariante: variante, predsBase: base };
    });
    saida[nome] = P.agrupar(blocos);
  }
  return saida;
}

if (require.main === module) {
  const r = rodar();
  for (const [nome, x] of Object.entries(r)) {
    console.log('### ' + nome);
    console.log('    por competicao: ' + x.porCompeticao
      .map(c => `${c.competicao}:${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(4)}`).join('  ') +
      (x.inertes && x.inertes.length ? `   [sem variacao: ${x.inertes.join(',')}]` : ''));
    if (!x.meta) { console.log('    nenhuma competicao informativa.'); continue; }
    // Reportar significancia sem direcao esconde metade do resultado: um agrupado
    // significativo POSITIVO diz que a variante e pior, nao melhor.
    const dir = x.meta.delta < 0 ? 'MELHORA' : 'PIORA';
    console.log(`    agrupado delta=${x.meta.delta >= 0 ? '+' : ''}${x.meta.delta.toFixed(4)} (${dir})  ` +
      `z=${x.poder.zAgrupado.toFixed(2)}  melhor individual z=${x.poder.zMelhorIndividual.toFixed(2)}  ` +
      `ganho=${x.poder.ganho.toFixed(2)}x  I2=${(x.heterogeneidade.I2 * 100).toFixed(0)}%  ` +
      `-> ${x.meta.significativo ? 'SIGNIFICATIVO' : 'nao'}`);
  }
  const dst = path.join(__dirname, 'out', 'poder.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(r, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, contextos };
