// Estágio de CURTO PRAZO: o modelo acerta jogo a jogo?
//
// Walk-forward honesto — cada jogo é previsto com ratings treinados só nos jogos
// anteriores. Não usa Monte Carlo (é uma passada sequencial), então roda em milissegundos
// e comporta varredura ampla de parâmetros.
//
// Aviso de leitura, aprendido medindo: o Brier é dominado pela variância irredutível do
// resultado. Com ~220 jogos por série, diferenças de Brier da ordem de 0,005-0,015 não se
// distinguem de ruído (o IC do bootstrap pareado cruza zero). Já o VIÉS MARGINAL — quanto
// o modelo prevê de vitórias em casa vs. quantas aconteceram — é estimável com precisão
// muito maior. Por isso o veredito de uma temporada só deve sair da calibração, não do
// Brier. As duas coisas estão no relatório, com essa hierarquia explícita.

const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const S = require('./lib/seeds.cjs');

const KS_AMPLITUDE = [1.0, 0.75, 0.5, 0.35, 0.25, 0.15, 0.05];
const PESO_CASA = [0.50, 0.53, 0.55, 0.57, 0.59, 0.61, 0.63, 0.65];

// z do viés marginal: sob o próprio modelo, Var(Σ O) = Σ p(1-p).
function viesMarginal(preds) {
  const out = {};
  for (const [rot, kp, ko] of [['casa', 'pH', 'oH'], ['empate', 'pD', 'oD'], ['fora', 'pA', 'oA']]) {
    const n = preds.length;
    const sp = preds.reduce((a, x) => a + x[kp], 0);
    const so = preds.reduce((a, x) => a + x[ko], 0);
    const v = preds.reduce((a, x) => a + x[kp] * (1 - x[kp]), 0);
    const z = v > 0 ? (so - sp) / Math.sqrt(v) : 0;
    out[rot] = {
      previsto: sp / n, observado: so / n, gap: (so - sp) / n,
      z, significativo: Math.abs(z) > 1.96,
    };
  }
  return out;
}

function avaliarSerie(E, ctx, cfg, getElo, rho = 0) {
  const lams = W.walkForward(E, ctx.times, getElo, ctx.res, cfg, ctx.sk, cfg.defaultAlpha);
  const preds = W.aPreds(lams, rho);
  return {
    // Gols que o modelo de fato espera por jogo. Nao e igual a cfg.lambdas[sk].total: lambda
    // sai de mc x atk x def, e a media do produto nao e o produto das medias.
    golsPrevistos: lams.reduce((a, x) => a + x.lC + x.lF, 0) / (lams.length || 1),
    preds,
    score: M.score(preds),
    ece: M.ece(preds),
    calibracao: M.calibracao(preds),
    vies: viesMarginal(preds),
    porFavoritismo: M.porFavoritismo(preds),
  };
}

// Compara variantes contra a config/semente vigente, sempre com bootstrap pareado.
// Uma variante só é "melhor" se o IC95 do delta não cruza zero.
function comparar(E, ctx, base, variantes) {
  const ref = avaliarSerie(E, ctx, base.cfg, base.getElo, base.rho || 0);
  const linhas = [{ nome: 'atual', brier: ref.score.brier, ece: ref.ece, acc: ref.score.acc, delta: 0, ic95: null, significativo: false }];
  for (const v of variantes) {
    const a = avaliarSerie(E, ctx, v.cfg || base.cfg, v.getElo || base.getElo, v.rho ?? base.rho ?? 0);
    const b = M.bootstrapDelta(a.preds, ref.preds);
    linhas.push({
      nome: v.nome, brier: a.score.brier, ece: a.ece, acc: a.score.acc,
      delta: b.delta, ic95: b.ic95, significativo: b.significativo,
    });
  }
  return { ref, linhas };
}

// Estatísticas observadas da série — servem de alvo para os λ e entram no relatório
// como "o que a temporada realmente foi".
function observado(res) {
  const n = res.length;
  const gc = res.reduce((a, x) => a + x.gc, 0) / n;
  const gf = res.reduce((a, x) => a + x.gf, 0) / n;
  return { n, golsPorJogo: gc + gf, pesoCasa: gc / (gc + gf), lamCasa: gc, lamFora: gf };
}

// Varredura da AMPLITUDE da semente, mantendo a ORDENACAO fixa.
//
// E a distincao que os dados pedem: reescalando toda semente para o mesmo alcance antes de
// encolher, ordenacoes diferentes convergem para quase o mesmo Brier no otimo — a ordem
// quase nao importa, a amplitude importa muito. E o k otimo cai conforme desce a divisao.
//
// Encolher NAO pode passar por uma renormalizacao: encolher em direcao ao centro e afim, e
// renormalizar desfaz exatamente. O canal pelo qual a amplitude morde e indireto —
// initLeague usa rawSpread = log(targetRatio)/log(max/min) capado em maxSpread, entao mexer
// no alcance move rawSpread contra esse teto.
function varrerAmplitude(E, ctx, cfg, getElo, ks) {
  const C = (S.ELO_MIN + S.ELO_MAX) / 2;
  const vals = {}; ctx.times.forEach(t => vals[t] = getElo(t));
  const mn = Math.min(...Object.values(vals)), mx = Math.max(...Object.values(vals));
  const nrm = t => (mx === mn ? C : S.ELO_MIN + (S.ELO_MAX - S.ELO_MIN) * (vals[t] - mn) / (mx - mn));
  return ks.map(k => {
    const r = avaliarSerie(E, ctx, cfg, t => C + k * (nrm(t) - C));
    return { k, brier: r.score.brier, ece: r.ece, acc: r.score.acc };
  });
}

// Amplitude que a serie JA tem, expressa na mesma escala k da varredura, para que o otimo
// medido possa ser comparado com o vigente em vez de flutuar solto.
function amplitudeVigente(ctx, cfg) {
  const els = ctx.times.map(t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500));
  const mn = Math.min(...els), mx = Math.max(...els);
  const raw = mx === mn ? Infinity : Math.log(cfg.targetRatio) / Math.log(mx / mn);
  return {
    eloMin: mn, eloMax: mx, razao: mx / mn,
    kEquivalente: (mx - mn) / (S.ELO_MAX - S.ELO_MIN),
    rawSpread: raw,
    spreadEfetivo: Math.min(raw, cfg.maxSpread || 5),
    noTeto: raw >= (cfg.maxSpread || 5),
  };
}

// Varredura do pesoCasa — o UNICO canal de vantagem de casa no modo ATK/DEF, ja que
// homeAdv nao entra em lambda. Vale varrer em vez de so testar "igual ao observado": o
// otimo de Brier nao coincide com a fracao observada de gols (a Serie A observa 0,565 e o
// otimo fica em 0,59), porque pesoCasa move tambem a forma da grade de Poisson, nao so a
// media. E o otimo de ECE nao coincide com o de Brier — a mesma tensao entre nitidez e
// honestidade que aparece no drift.
function varrerPesoCasa(E, ctx, cfg0, getElo, valores) {
  return valores.map(pc => {
    const cfg = structuredClone(cfg0);
    cfg.lambdas[ctx.sk].pesoCasa = pc;
    const r = avaliarSerie(E, ctx, cfg, getElo);
    return { pesoCasa: pc, brier: r.score.brier, ece: r.ece, viesCasa: r.vies.casa.gap };
  });
}

function rodar(E, ctxs, opts = {}) {
  const cfg0 = E.DEFAULT_CFG;
  const saida = { series: {} };
  for (const ctx of ctxs) {
    const seeds = S.construir(ctx.times, ctx.ranking, opts.resolver, opts.resolver25);
    const base = { cfg: cfg0, getElo: t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500) };
    const obs = observado(ctx.res);

    const variantesSemente = ['iguais', 'rnc_pontos', 'rnc_log', 'rnc_posicao', 'rnc_recencia',
      'ano_anterior', 'ano_anterior_reg50', 'ano_anterior_reg25']
      .filter(k => seeds[k])
      .map(k => ({ nome: 'semente:' + k, getElo: seeds[k] }));

    const cfgPeso = structuredClone(cfg0); cfgPeso.lambdas[ctx.sk].pesoCasa = obs.pesoCasa;
    const cfgTot = structuredClone(cfg0); cfgTot.lambdas[ctx.sk].total = obs.golsPorJogo;
    const cfgAmbos = structuredClone(cfg0);
    cfgAmbos.lambdas[ctx.sk].pesoCasa = obs.pesoCasa; cfgAmbos.lambdas[ctx.sk].total = obs.golsPorJogo;

    const variantesCfg = [
      { nome: 'lambda:pesoCasa=observado', cfg: cfgPeso },
      { nome: 'lambda:total=observado', cfg: cfgTot },
      { nome: 'lambda:ambos=observado', cfg: cfgAmbos },
      ...[-0.05, -0.11, -0.18].map(r => ({ nome: `dixon-coles rho=${r}`, rho: r })),
      // targetRatio governa a amplitude de atk/def — mas so enquanto rawSpread ficar abaixo
      // de maxSpread. Nas series cujo Elo inicial e estreito o teto morde primeiro e o
      // parametro fica inerte; a tabela `inercia` mostra em quais.
      ...[1.5, 2.0, 4.5].map(tr => {
        const c = structuredClone(cfg0); c.targetRatio = tr;
        return { nome: `targetRatio=${tr}`, cfg: c };
      }),
    ];

    // Prova de inércia: se estes derem delta exatamente 0, o parâmetro não afeta previsão.
    const cfgKelo = structuredClone(cfg0); cfgKelo.alphas[cfg0.defaultAlpha].kElo = 64;
    const cfgHa = structuredClone(cfg0); cfgHa.homeAdv = 400;
    const cfgTr = structuredClone(cfg0); cfgTr.targetRatio = 8.0;
    const variantesInercia = [
      { nome: 'INERCIA kElo=64', cfg: cfgKelo },
      { nome: 'INERCIA homeAdv=400', cfg: cfgHa },
      { nome: 'INERCIA targetRatio=8', cfg: cfgTr },
    ];

    saida.series[ctx.sk] = {
      observado: obs,
      cfgVigente: { total: cfg0.lambdas[ctx.sk].total, pesoCasa: cfg0.lambdas[ctx.sk].pesoCasa, homeAdv: cfg0.homeAdv, alpha: cfg0.defaultAlpha },
      golsPrevistos: avaliarSerie(E, ctx, base.cfg, base.getElo).golsPrevistos,
      base: (() => { const r = avaliarSerie(E, ctx, base.cfg, base.getElo); return { score: r.score, ece: r.ece, vies: r.vies, calibracao: r.calibracao, porFavoritismo: r.porFavoritismo }; })(),
      baselines: (() => {
        const r = avaliarSerie(E, ctx, base.cfg, base.getElo);
        return {
          modelo: M.score(r.preds).brier,
          taxaBaseWalkForward: M.score(M.baselineWalkForward(r.preds)).brier,
          uniforme: M.score(M.baselineUniforme(r.preds)).brier,
          vsTaxaBase: M.bootstrapDelta(r.preds, M.baselineWalkForward(r.preds)),
        };
      })(),
      sementes: comparar(E, ctx, base, variantesSemente).linhas,
      parametros: comparar(E, ctx, base, variantesCfg).linhas,
      inercia: comparar(E, ctx, base, variantesInercia).linhas,
      pesoCasa: {
        vigente: cfg0.lambdas[ctx.sk].pesoCasa,
        observado: obs.pesoCasa,
        varredura: varrerPesoCasa(E, ctx, cfg0, base.getElo, PESO_CASA),
      },
      amplitude: {
        vigente: amplitudeVigente(ctx, cfg0),
        varredura: {
          atual: varrerAmplitude(E, ctx, cfg0, base.getElo, KS_AMPLITUDE),
          rnc_log: varrerAmplitude(E, ctx, cfg0, seeds.rnc_log, KS_AMPLITUDE),
          ...(seeds.ano_anterior ? { ano_anterior: varrerAmplitude(E, ctx, cfg0, seeds.ano_anterior, KS_AMPLITUDE) } : {}),
        },
      },
      semRnc: seeds.__meta.semRnc,
      semAno25: seeds.__meta.semAno25 || [],
    };
  }
  return saida;
}

module.exports = { rodar, avaliarSerie, comparar, viesMarginal, observado, varrerAmplitude, amplitudeVigente, varrerPesoCasa, KS_AMPLITUDE, PESO_CASA };
