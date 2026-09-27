// "A qualificacao usada para semear os Elos se justificou?"
//
// A pergunta e diferente de "qual semente e a melhor", e exige dois cuidados que a primeira
// versao deste harness nao tinha:
//
// 1. DECOMPOR AS CAMADAS. A Serie D e semeada por SD_UF[estado] + SD_ADJ[origem], com
//    SD_OVR sobrescrevendo 38 clubes a mao. Testar so "SD_INFO vs todos iguais" mede as tres
//    camadas juntas e nao diz qual delas trabalha. Aqui cada camada e ligada e desligada.
//
// 2. COMPARAR NO OTIMO DE AMPLITUDE. A amplitude da semente domina a ordenacao (ver
//    shortterm.cjs). Duas qualificacoes com alcances naturais diferentes — SD_UF vai de 1125
//    a 1235, SD_UF+SD_ADJ vai mais longe — seriam comparadas pela amplitude, nao pelo
//    conteudo. Cada variante e avaliada no k que lhe e otimo antes de qualquer comparacao.
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const S = require('./lib/seeds.cjs');

const KS = [1, 0.75, 0.5, 0.35, 0.25, 0.15, 0.05];
const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;

function preds(E, ctx, cfg, getElo) {
  return W.aPreds(W.walkForward(E, ctx.times, getElo, ctx.res, cfg, ctx.sk, cfg.defaultAlpha), 0);
}

// Avalia uma ordenacao no seu proprio otimo de amplitude.
function noOtimo(E, ctx, cfg, getElo) {
  const vals = {};
  ctx.times.forEach(t => vals[t] = getElo(t));
  const vs = Object.values(vals);
  const mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx === mn) {
    const P = preds(E, ctx, cfg, getElo);
    return { P, brier: M.score(P).brier, k: null };
  }
  const nrm = t => S.ELO_MIN + (S.ELO_MAX - S.ELO_MIN) * (vals[t] - mn) / (mx - mn);
  let best = { brier: Infinity };
  for (const k of KS) {
    const P = preds(E, ctx, cfg, t => CENTRO + k * (nrm(t) - CENTRO));
    const b = M.score(P).brier;
    if (b < best.brier) best = { P, brier: b, k };
  }
  return best;
}

// Correlacao de posto entre a semente vigente e a classificacao de 2025 — mede se a
// qualificacao declarada ("baseada nos anos anteriores") e de fato o que esta no codigo.
function spearmanCom2025(ctx, resolver25) {
  if (!resolver25) return null;
  const pares = ctx.times
    .map(t => ({ t, elo: ctx.ranking[t] ? ctx.ranking[t].elo : null, h: resolver25(t) }))
    .filter(x => x.elo !== null && x.h);
  const n = pares.length;
  if (n < 5) return null;
  const posto = (arr, val) => {
    const ord = [...arr].sort((a, b) => val(b) - val(a));
    const m = new Map();
    ord.forEach((o, i) => m.set(o.t, i + 1));
    return m;
  };
  const rElo = posto(pares, x => x.elo);
  const r25 = posto(pares, x => -(S.DEGRAU[x.h.serie] + x.h.pos));
  let d2 = 0;
  pares.forEach(x => d2 += (rElo.get(x.t) - r25.get(x.t)) ** 2);
  return { rho: 1 - 6 * d2 / (n * (n * n - 1)), n };
}

// Camadas da Serie D. `alt` traz uma UF derivada do RNC, para responder se a tabela feita
// a mao vale mais que uma construida de dado objetivo.
function camadasSerieD(E, ctx, cfg, resolver) {
  if (ctx.sk !== 'D' || !E.SD_UF || !E.SD_INFO) return null;
  const I = E.SD_INFO;
  const porUf = {};
  (E.RNC_2026 || []).forEach(r => { (porUf[r.u] = porUf[r.u] || []).push(r.p); });
  const ufRnc = {};
  Object.entries(porUf).forEach(([u, v]) => ufRnc[u] = Math.log(v.reduce((a, b) => a + b, 0) / v.length));

  const variantes = {
    iguais: () => 1200,
    so_UF: t => E.SD_UF[I[t].uf],
    so_origem: t => 1200 + (E.SD_ADJ[I[t].origem] || 0),
    UF_mais_origem: t => E.SD_UF[I[t].uf] + (E.SD_ADJ[I[t].origem] || 0),
    completo_com_overrides: t => I[t].elo,
    UF_derivada_do_RNC: t => 1200 + 40 * (ufRnc[I[t].uf] || 8),
    RNC_do_clube: t => { const h = resolver(t); return h ? Math.log(Math.max(1, h.p)) : Math.log(51); },
  };

  const av = {};
  for (const [nome, ge] of Object.entries(variantes)) av[nome] = noOtimo(E, ctx, cfg, ge);

  // Comparacoes que isolam a contribuicao de cada camada.
  const par = (a, b) => {
    const r = M.bootstrapDelta(av[a].P, av[b].P);
    return { de: a, contra: b, delta: r.delta, ic95: r.ic95, significativo: r.significativo };
  };
  return {
    variantes: Object.fromEntries(Object.entries(av).map(([k, v]) => [k, { brier: v.brier, k: v.k }])),
    comparacoes: [
      par('so_UF', 'iguais'),
      par('so_origem', 'iguais'),
      par('UF_mais_origem', 'so_UF'),
      par('completo_com_overrides', 'UF_mais_origem'),
      par('so_UF', 'UF_derivada_do_RNC'),
      par('completo_com_overrides', 'iguais'),
    ],
  };
}

function rodar(E, ctxs, opts = {}) {
  const cfg = E.DEFAULT_CFG;
  const saida = {};
  for (const ctx of ctxs) {
    const seeds = S.construir(ctx.times, ctx.ranking, opts.resolver, opts.resolver25);
    const ordenacoes = ['atual', 'iguais', 'ano_anterior', 'rnc_log']
      .filter(k => seeds[k])
      .map(k => ({ nome: k, ...noOtimo(E, ctx, cfg, seeds[k]) }));
    const ref = ordenacoes.find(o => o.nome === 'iguais');
    saida[ctx.sk] = {
      spearmanCom2025: spearmanCom2025(ctx, opts.resolver25),
      // Cada ordenacao no seu otimo, contra "todos iguais" tambem no dele. E o teste que
      // responde "a qualificacao vale alguma coisa?" sem confundir com amplitude.
      ordenacoes: ordenacoes.map(o => {
        const r = ref && o.nome !== 'iguais' ? M.bootstrapDelta(o.P, ref.P) : null;
        return { nome: o.nome, brier: o.brier, kOtimo: o.k, delta: r && r.delta, ic95: r && r.ic95, significativo: r ? r.significativo : null };
      }),
      camadas: camadasSerieD(E, ctx, cfg, opts.resolver),
    };
  }
  return saida;
}

module.exports = { rodar, noOtimo, spearmanCom2025, camadasSerieD, KS };
