// Quais parametros por competicao deveriam, na verdade, ser COMPARTILHADOS?
//
// O DEFAULT_CFG carrega um `lambdas` separado para cada competicao — cinco `total` e cinco
// `pesoCasa`. Isso e uma escolha de modelagem, nao um fato: manter valores distintos so se
// justifica se as competicoes de fato diferirem mais do que o ruido amostral.
//
// O teste e direto. Para cada agrupamento candidato:
//   1. varre o parametro e acha o valor unico que minimiza o Brier agrupado (ponderado pelo
//      numero de jogos de cada competicao);
//   2. mede o CUSTO de impor esse valor unico, competicao por competicao, contra o otimo
//      livre de cada uma;
//   3. compara o valor unico com os valores VIGENTES.
//
// O criterio de decisao nao e "o custo e zero" — sera sempre positivo, porque o otimo livre
// e otimo por construcao. E se o custo cabe dentro do intervalo de confianca: quando o otimo
// livre de uma competicao nao e significativamente melhor que o valor compartilhado, manter
// numeros separados e ajustar ruido, e ajustar ruido custa generalizacao.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const { contextos } = require('./poder.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'ufOfTeam',
  'SA_NM', 'SA_RANKING', 'SB_NM', 'SB_RANKING', 'SC_NM', 'SC_RANKING',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

const faixa = (lo, hi, passo) => {
  const v = [];
  for (let x = lo; x <= hi + 1e-9; x += passo) v.push(Math.round(x / passo) * passo);
  return v;
};

function analisar(E, ctxs, { campo, valores, grupos }) {
  const cfg0 = E.DEFAULT_CFG;
  const preds = (ctx, valor) => {
    const cfg = structuredClone(cfg0);
    cfg.lambdas[ctx.sk][campo] = valor;
    return W.aPreds(W.walkForward(E, ctx.times,
      t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500), ctx.res, cfg, ctx.sk, cfg.defaultAlpha, false), 0);
  };

  // Uma passada so: preve cada competicao em cada valor da grade.
  const grade = {};
  for (const ctx of ctxs) grade[ctx.sk] = valores.map(v => preds(ctx, v));
  const brier = (sk, i) => M.score(grade[sk][i]).brier;
  const nDe = sk => grade[sk][0].length;

  const livre = {};
  for (const ctx of ctxs) {
    const bs = valores.map((_, i) => brier(ctx.sk, i));
    const iMin = bs.indexOf(Math.min(...bs));
    livre[ctx.sk] = { valor: valores[iMin], brier: bs[iMin], i: iMin, vigente: cfg0.lambdas[ctx.sk][campo] };
  }

  // Otimo na borda = a grade nao cobre o minimo. Sinalizado no JSON e impresso, para que
  // nunca vire numero de relatorio sem ressalva.
  for (const sk of Object.keys(livre)) {
    livre[sk].naBorda = livre[sk].i === 0 || livre[sk].i === valores.length - 1;
  }
  const saida = { campo, valores, livre, grupos: {} };
  for (const [nome, membros] of Object.entries(grupos)) {
    const sel = ctxs.filter(c => membros.includes(c.sk));
    if (sel.length < 2) continue;
    const nTot = sel.reduce((a, c) => a + nDe(c.sk), 0);
    const agr = valores.map((_, i) => sel.reduce((a, c) => a + brier(c.sk, i) * nDe(c.sk), 0) / nTot);
    const iMin = agr.indexOf(Math.min(...agr));

    // Brier agrupado com os valores vigentes, para saber se compartilhar sequer piora.
    const iVig = c => {
      const alvo = cfg0.lambdas[c.sk][campo];
      let melhor = 0;
      valores.forEach((v, i) => { if (Math.abs(v - alvo) < Math.abs(valores[melhor] - alvo)) melhor = i; });
      return melhor;
    };
    const agrVigente = sel.reduce((a, c) => a + brier(c.sk, iVig(c)) * nDe(c.sk), 0) / nTot;

    saida.grupos[nome] = {
      membros, valorCompartilhado: valores[iMin], brierAgrupado: agr[iMin],
      brierComVigentes: agrVigente,
      ganhoSobreVigentes: agrVigente - agr[iMin],
      custos: sel.map(c => {
        // O otimo livre e melhor que o compartilhado de forma significativa?
        const r = M.bootstrapDelta(grade[c.sk][livre[c.sk].i], grade[c.sk][iMin]);
        return {
          competicao: c.sk, otimoLivre: livre[c.sk].valor, vigente: cfg0.lambdas[c.sk][campo],
          custo: brier(c.sk, iMin) - livre[c.sk].brier,
          delta: r.delta, ic95: r.ic95, significativo: r.significativo,
        };
      }),
    };
  }
  return saida;
}

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const dados = require('./lib/appdata.cjs').load();
  const ctxs = contextos(E, dados);
  return {
    pesoCasa: analisar(E, ctxs, {
      campo: 'pesoCasa', valores: faixa(0.50, 0.68, 0.01),
      grupos: { 'ligas A-D': ['A', 'B', 'C', 'D'], 'B-D': ['B', 'C', 'D'], 'todas': ['A', 'B', 'C', 'D', 'CB'] },
    }),
    // Faixa larga de proposito: com 2,0-3,0 o otimo caiu EXATAMENTE em 2,00 em quatro
    // competicoes, ou seja, na borda — o que significa grade mal escolhida, nao otimo
    // encontrado. Um minimo na extremidade da varredura nunca deve ser reportado como
    // resposta.
    total: analisar(E, ctxs, {
      campo: 'total', valores: faixa(1.2, 3.2, 0.05),
      grupos: { 'ligas A-D': ['A', 'B', 'C', 'D'], 'todas': ['A', 'B', 'C', 'D', 'CB'] },
    }),
  };
}

if (require.main === module) {
  const r = rodar();
  for (const [campo, x] of Object.entries(r)) {
    console.log(`\n=== ${campo} ===`);
    console.log('otimo livre por competicao: ' + Object.entries(x.livre)
      .map(([sk, l]) => `${sk} ${l.valor.toFixed(2)}${l.naBorda ? ' [NA BORDA]' : ''} (vigente ${l.vigente.toFixed(3)})`).join('  |  '));
    for (const [nome, g] of Object.entries(x.grupos)) {
      console.log(`\n  ${nome}: valor compartilhado ${g.valorCompartilhado.toFixed(2)}`);
      console.log(`    Brier agrupado ${g.brierAgrupado.toFixed(5)} vs. vigentes ${g.brierComVigentes.toFixed(5)} ` +
        `(${g.ganhoSobreVigentes >= 0 ? 'ganho' : 'perda'} ${Math.abs(g.ganhoSobreVigentes).toFixed(5)})`);
      for (const c of g.custos) {
        console.log(`    ${c.competicao.padEnd(3)} otimo livre ${c.otimoLivre.toFixed(2)}  custo +${c.custo.toFixed(5)}  ` +
          `IC [${c.ic95[0].toFixed(5)}, ${c.ic95[1].toFixed(5)}] ${c.significativo ? 'SEPARAR SE JUSTIFICA' : 'compartilhar cabe no ruido'}`);
      }
    }
  }
  const dst = path.join(__dirname, 'out', 'compartilhado.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(r, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, analisar };
