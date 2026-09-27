// ELO PURO vs ATK/DEF, e conservador vs base vs agressivo.
//
// Duas escolhas que o app expoe na configuracao e que nunca tinham sido medidas:
//
// 1. MODO. `eo=false` (ATK/DEF, o padrao explicito da UI) deriva lambda de atk/def; `eo=true`
//    (ELO PURO) deriva do gap de Elo com a vantagem de casa, modulado por c0Log. Sao dois
//    modelos diferentes, nao dois ajustes do mesmo.
//
// 2. PRESET DE EVOLUCAO. conservador {atk .05, def .08, kElo 16}, base {.10, .16, 32},
//    agressivo {.20, .32, 48} — quao rapido os ratings reagem a cada resultado.
//
// Os dois se cruzam: kElo so faz sentido em ELO PURO, porque em ATK/DEF o Elo corrente nunca
// volta para lambda. Entao a comparacao de presets precisa ser feita DENTRO de cada modo, e
// o teste de inercia de homeAdv/kElo e refeito em ELO PURO — onde a expectativa e que deixem
// de ser inertes. Um achado de inercia sem dizer em qual modo vale e meia verdade.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const P = require('./lib/pool.cjs');
const { contextos } = require('./poder.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'ufOfTeam',
  'SA_NM', 'SA_RANKING', 'SB_NM', 'SB_RANKING', 'SC_NM', 'SC_RANKING',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const ctxs = contextos(E, dados);
  const PRESETS = Object.keys(cfg0.alphas);

  const preds = (ctx, cfg, ak, eo) => W.aPreds(
    W.walkForward(E, ctx.times, t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500), ctx.res, cfg, ctx.sk, ak, eo), 0);

  // --- grade modo x preset, por competicao ---
  const grade = {};
  for (const ctx of ctxs) {
    grade[ctx.sk] = {};
    for (const eo of [false, true]) {
      for (const ak of PRESETS) {
        const p = preds(ctx, cfg0, ak, eo);
        const s = M.score(p);
        grade[ctx.sk][`${eo ? 'elo' : 'atkdef'}/${ak}`] = {
          brier: s.brier, logloss: s.logloss, acc: s.acc, ece: M.ece(p),
          viesCasa: s.obsH - s.prevH,
        };
      }
    }
  }

  // --- ELO PURO vs ATK/DEF, agrupado, com o preset vigente em ambos ---
  const ak0 = cfg0.defaultAlpha;
  const modoAgrupado = P.agrupar(ctxs.map(ctx => ({
    competicao: ctx.sk,
    predsVariante: preds(ctx, cfg0, ak0, true),
    predsBase: preds(ctx, cfg0, ak0, false),
  })));

  // --- preset, dentro de cada modo, agrupado ---
  const presetAgrupado = {};
  for (const eo of [false, true]) {
    for (const ak of PRESETS) {
      if (ak === ak0) continue;
      presetAgrupado[`${eo ? 'elo' : 'atkdef'}: ${ak} vs ${ak0}`] = P.agrupar(ctxs.map(ctx => ({
        competicao: ctx.sk,
        predsVariante: preds(ctx, cfg0, ak, eo),
        predsBase: preds(ctx, cfg0, ak0, eo),
      })));
    }
  }

  // --- inercia refeita em ELO PURO: homeAdv e kElo ainda nao fazem nada? ---
  const inerciaPorModo = {};
  for (const eo of [false, true]) {
    const rot = eo ? 'elo' : 'atkdef';
    const cHa = structuredClone(cfg0); cHa.homeAdv = 400;
    const cKe = structuredClone(cfg0); cKe.alphas[ak0].kElo = 64;
    const cC0 = structuredClone(cfg0); cC0.c0Log = { ...cfg0.c0Log, on: true };
    for (const [nome, cfg] of [['homeAdv 100->400', cHa], ['kElo 16->64', cKe], ['c0Log ligado', cC0]]) {
      inerciaPorModo[`${rot}: ${nome}`] = ctxs.map(ctx => {
        const d = P.difs(preds(ctx, cfg, ak0, eo), preds(ctx, cfg0, ak0, eo));
        return { competicao: ctx.sk, delta: P.media(d), inerte: d.every(x => x === 0) };
      });
    }
  }

  return { grade, modoAgrupado, presetAgrupado, inerciaPorModo, presets: cfg0.alphas, padrao: ak0 };
}

if (require.main === module) {
  const r = rodar();
  const cols = Object.keys(r.grade[Object.keys(r.grade)[0]]);
  console.log('=== Brier por modo/preset ===');
  console.log('comp  | ' + cols.map(c => c.padStart(18)).join(' | '));
  for (const [sk, g] of Object.entries(r.grade)) {
    const melhor = Math.min(...cols.map(c => g[c].brier));
    console.log(sk.padEnd(5) + ' | ' + cols.map(c =>
      (g[c].brier.toFixed(4) + (g[c].brier === melhor ? ' *' : '  ')).padStart(18)).join(' | '));
  }
  console.log('(* = melhor da linha)');

  const m = r.modoAgrupado;
  console.log(`\n=== ELO PURO vs ATK/DEF (preset ${r.padrao}), agrupado ===`);
  console.log('  por competicao: ' + m.porCompeticao.map(c => `${c.competicao}:${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(4)}`).join('  '));
  console.log(`  delta=${m.meta.delta >= 0 ? '+' : ''}${m.meta.delta.toFixed(4)} (${m.meta.delta < 0 ? 'ELO PURO melhor' : 'ATK/DEF melhor'})  ` +
    `z=${Math.abs(m.meta.z).toFixed(2)}  I2=${(m.heterogeneidade.I2 * 100).toFixed(0)}%  -> ${m.meta.significativo ? 'SIGNIFICATIVO' : 'nao'}`);

  console.log('\n=== Preset de evolucao (agrupado, dentro de cada modo) ===');
  for (const [nome, x] of Object.entries(r.presetAgrupado)) {
    if (!x.meta) { console.log(`  ${nome.padEnd(30)} sem variacao`); continue; }
    console.log(`  ${nome.padEnd(30)} delta=${x.meta.delta >= 0 ? '+' : ''}${x.meta.delta.toFixed(4)} ` +
      `(${x.meta.delta < 0 ? 'MELHORA' : 'PIORA'})  z=${Math.abs(x.meta.z).toFixed(2)}  ` +
      `I2=${(x.heterogeneidade.I2 * 100).toFixed(0)}%  ${x.meta.significativo ? 'SIGNIFICATIVO' : ''}`);
  }

  console.log('\n=== Inercia, agora por modo (delta de Brier por competicao) ===');
  for (const [nome, linhas] of Object.entries(r.inerciaPorModo)) {
    console.log(`  ${nome.padEnd(28)} ` + linhas.map(l => `${l.competicao}:${l.inerte ? 'INERTE' : (l.delta >= 0 ? '+' : '') + l.delta.toFixed(4)}`).join('  '));
  }

  const dst = path.join(__dirname, 'out', 'modos.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(r, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar };
