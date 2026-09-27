// CONTRAFACTUAL: se 2026 tivesse rodado com os principais ajustes, quao melhor teria ido?
//
// A "configuracao candidata" aplica so os achados SOLIDOS (medidos com significancia ou
// consistencia entre competicoes):
//   1. pesoCasa unico 0,58 nas quatro ligas (Copa mantem o dela, ~0,65, que ja e o otimo);
//   2. amplitude da semente da Serie A encolhida para k=0,40 (roda em ~1,06; otimo medido
//      0,35-0,50). B e C ja estao perto do proprio otimo e a D quer amplitude cheia — ficam.
// Uma variante "com tentativos" adiciona o preset `base` no lugar de `conservador`.
//
// HONESTIDADE OBRIGATORIA: esses ajustes foram derivados DESTES dados. Medi-los aqui e
// in-sample, e o ganho e um TETO, nao uma expectativa para 2027. Dois atenuantes, ambos
// declarados em vez de escondidos:
//   - os valores sao redondos e vem de curvas suaves (0,58; k=0,40), nao de ajuste fino —
//     a capacidade de overfit de dois numeros escolhidos assim e pequena;
//   - o placar tambem e computado SO na segunda metade dos jogos (r > 12), onde o
//     walk-forward chega com ratings ja aquecidos; se o ganho fosse casca de ajuste fino,
//     tenderia a encolher ai.
// O teste limpo e dezembro, com as rodadas que nenhum ajuste viu.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const S = require('./lib/seeds.cjs');
const L = require('./lib/longterm.cjs');
const { contextos } = require('./poder.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'ufOfTeam', 'simMC',
  'parseTab', 'calcClassif',
  'SA_NM', 'SA_RANKING', 'SA_TAB', 'SA_DATES', 'SB_NM', 'SB_RANKING', 'SB_TAB', 'SB_DATES',
  'SC_NM', 'SC_RANKING', 'SC_TAB', 'SC_DATES',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

const PESO_LIGAS = 0.58;
const K_SERIE_A = 0.40;
const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;

function cfgCandidata(cfg0, comTentativos) {
  const c = structuredClone(cfg0);
  for (const sk of ['A', 'B', 'C', 'D']) c.lambdas[sk].pesoCasa = PESO_LIGAS;
  if (comTentativos) c.defaultAlpha = 'base';
  return c;
}

// Semente da Serie A com amplitude corrigida: normaliza a vigente para [ELO_MIN, ELO_MAX]
// e encolhe para k em direcao ao centro. Mesma ORDENACAO, so a confianca muda.
function seedCorrigida(times, ranking, k) {
  const v = {};
  times.forEach(t => v[t] = ranking[t] ? ranking[t].elo : 1500);
  const vs = Object.values(v);
  const mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx === mn) return t => v[t];
  return t => CENTRO + k * ((S.ELO_MIN + (S.ELO_MAX - S.ELO_MIN) * (v[t] - mn) / (mx - mn)) - CENTRO);
}

function curtoPrazo(E, ctxs, cfg0, comTentativos) {
  const cand = cfgCandidata(cfg0, comTentativos);
  const linhas = [];
  const paresAtual = [], paresCand = [];
  for (const ctx of ctxs) {
    const geAtual = t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);
    const geCand = ctx.sk === 'A' ? seedCorrigida(ctx.times, ctx.ranking, K_SERIE_A) : geAtual;
    const pAtual = W.aPreds(W.walkForward(E, ctx.times, geAtual, ctx.res, cfg0, ctx.sk, cfg0.defaultAlpha, false), 0);
    const pCand = W.aPreds(W.walkForward(E, ctx.times, geCand, ctx.res, cand, ctx.sk, cand.defaultAlpha, false), 0);
    paresAtual.push(...pAtual); paresCand.push(...pCand);
    const bs = M.bootstrapDelta(pCand, pAtual);
    // segunda metade: pontua so os jogos de rodada > 12 (mesmos indices nas duas listas,
    // porque o walk-forward preserva a ordem cronologica dos mesmos jogos)
    const rods = [...ctx.res].sort((a, b) => (a.r || 0) - (b.r || 0)).map(x => x.r || 0);
    const tardios = i => rods[i] > 12;
    const pA2 = pAtual.filter((_, i) => tardios(i)), pC2 = pCand.filter((_, i) => tardios(i));
    linhas.push({
      competicao: ctx.sk, n: pAtual.length,
      brierAtual: M.score(pAtual).brier, brierCand: M.score(pCand).brier,
      eceAtual: M.ece(pAtual), eceCand: M.ece(pCand),
      viesCasaAtual: M.score(pAtual).obsH - M.score(pAtual).prevH,
      viesCasaCand: M.score(pCand).obsH - M.score(pCand).prevH,
      delta: bs.delta, ic95: bs.ic95, significativo: bs.significativo,
      segundaMetade: pA2.length >= 30 ? {
        n: pA2.length, brierAtual: M.score(pA2).brier, brierCand: M.score(pC2).brier,
        delta: M.bootstrapDelta(pC2, pA2).delta,
      } : null,
    });
  }
  const bsTot = M.bootstrapDelta(paresCand, paresAtual);
  return {
    linhas,
    agregado: {
      n: paresAtual.length,
      brierAtual: M.score(paresAtual).brier, brierCand: M.score(paresCand).brier,
      eceAtual: M.ece(paresAtual), eceCand: M.ece(paresCand),
      delta: bsTot.delta, ic95: bsTot.ic95, significativo: bsTot.significativo,
    },
  };
}

function longoPrazo(E, cfg0, dados, { nSims = 3000, nSeeds = 2, passoR = 3 } = {}) {
  const cand = cfgCandidata(cfg0, false);
  const saida = {};
  for (const sk of ['A', 'B', 'C']) {
    const ranking = E[`S${sk}_RANKING`];
    const times = Object.keys(ranking);
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const res = dados.merged[sk];
    const porRod = fixture.filter(g => g.rodada === 1).length;
    const cont = {};
    res.forEach(x => cont[x.r] = (cont[x.r] || 0) + 1);
    const H = Math.max(...Object.keys(cont).map(Number).filter(r => cont[r] >= porRod / 2));
    const verdade = E.calcClassif(times, res.filter(x => x.r <= H));

    const rkAtual = ranking;
    const rkCand = (() => {
      if (sk !== 'A') return ranking;
      const ge = seedCorrigida(times, ranking, K_SERIE_A);
      const o = {}; times.forEach(t => o[t] = { elo: ge(t) }); return o;
    })();

    const medir = (rk, cfg) => {
      let acc = 0, n = 0;
      for (let r = passoR; r < H; r += passoR) {
        for (let s = 0; s < nSeeds; s++) {
          const { dist } = L.preverEm(E, {
            times, ranking: rk, fixture, res, cfg, sk, H, corte: r,
            nSims, ak: cfg.defaultAlpha, seed: 61000 + s * 149 + r * 19,
          });
          acc += L.pontuar(dist, verdade, times.length).rps; n++;
        }
      }
      return acc / n;
    };
    saida[sk] = { H, rpsAtual: medir(rkAtual, cfg0), rpsCand: medir(rkCand, cand) };
    process.stderr.write(`  [${sk}] atual ${saida[sk].rpsAtual.toFixed(5)} -> candidata ${saida[sk].rpsCand.toFixed(5)}\n`);
  }
  return saida;
}

function rodar(opts = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const ctxs = contextos(E, dados);
  return {
    ajustes: { pesoCasaLigas: PESO_LIGAS, amplitudeSerieA: K_SERIE_A },
    solida: curtoPrazo(E, ctxs, cfg0, false),
    comTentativos: curtoPrazo(E, ctxs, cfg0, true),
    longo: opts.semLongo ? null : longoPrazo(E, cfg0, dados, opts),
  };
}

if (require.main === module) {
  const out = rodar();
  const f = x => x.toFixed(4);
  console.log('=== CURTO PRAZO: configuracao candidata (solida) vs vigente ===');
  console.log('comp |   n  | Brier atual -> cand |  ECE atual -> cand | vies casa atual -> cand | delta (IC95)');
  for (const l of out.solida.linhas) {
    console.log(`${l.competicao.padEnd(4)} | ${String(l.n).padStart(4)} | ${f(l.brierAtual)} -> ${f(l.brierCand)} | ` +
      `${(l.eceAtual * 100).toFixed(1)}% -> ${(l.eceCand * 100).toFixed(1)}% | ` +
      `${(l.viesCasaAtual * 100).toFixed(1)}pp -> ${(l.viesCasaCand * 100).toFixed(1)}pp | ` +
      `${l.delta >= 0 ? '+' : ''}${f(l.delta)} [${f(l.ic95[0])}, ${f(l.ic95[1])}]${l.significativo ? ' SIGNIF' : ''}`);
  }
  const a = out.solida.agregado;
  console.log(`AGREGADO (n=${a.n}): Brier ${f(a.brierAtual)} -> ${f(a.brierCand)} | ECE ${(a.eceAtual * 100).toFixed(2)}% -> ${(a.eceCand * 100).toFixed(2)}% | ` +
    `delta ${a.delta >= 0 ? '+' : ''}${f(a.delta)} [${f(a.ic95[0])}, ${f(a.ic95[1])}]${a.significativo ? ' SIGNIFICATIVO' : ''}`);
  console.log('\n-- segunda metade (r > 12), onde o ajuste fino teria menos folego --');
  for (const l of out.solida.linhas) {
    if (!l.segundaMetade) continue;
    const s2 = l.segundaMetade;
    console.log(`${l.competicao.padEnd(4)} | n=${s2.n} | ${f(s2.brierAtual)} -> ${f(s2.brierCand)} (delta ${s2.delta >= 0 ? '+' : ''}${f(s2.delta)})`);
  }
  const at = out.comTentativos.agregado;
  console.log(`\n=== com tentativos (+ preset base): agregado ${f(at.brierAtual)} -> ${f(at.brierCand)} | delta ${at.delta >= 0 ? '+' : ''}${f(at.delta)}${at.significativo ? ' SIGNIF' : ''} ===`);
  if (out.longo) {
    console.log('\n=== LONGO PRAZO (RPS medio sobre os cortes) ===');
    for (const [sk, x] of Object.entries(out.longo)) {
      console.log(`${sk}: ${x.rpsAtual.toFixed(5)} -> ${x.rpsCand.toFixed(5)}  (${((1 - x.rpsCand / x.rpsAtual) * 100).toFixed(1)}% melhor)`);
    }
  }
  const dst = path.join(__dirname, 'out', 'candidato.json');
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, cfgCandidata, seedCorrigida };
