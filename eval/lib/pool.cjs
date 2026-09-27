// Agrupamento de competicoes para ganhar poder estatistico.
//
// A pergunta nao e "juntar ajuda?" e sim "juntar ajuda PARA QUAL HIPOTESE?". Somar n so
// vira poder quando o efeito aponta na mesma direcao em todas as competicoes. Quando os
// sinais se opoem — e isso foi medido: o RNC melhora a Serie A e piora a C — o agrupamento
// cancela e detecta MENOS que a melhor competicao sozinha.
//
// Por isso todo resultado agrupado sai acompanhado de:
//   - o efeito por competicao, para inspecionar a consistencia de sinal;
//   - I2, a fracao da variacao entre competicoes que nao e explicavel por ruido amostral.
//     I2 alto significa que as competicoes estao medindo coisas diferentes e o valor
//     agrupado e uma media sem referente.
//
// Duas formas de agrupar, ambas relatadas porque respondem a perguntas diferentes:
//   - AGRUPADO (bootstrap pareado estratificado): "qual o efeito medio por jogo?" Reamostra
//     dentro de cada competicao, preservando o n de cada uma — reamostrar o conjunto todo
//     de uma vez deixaria a composicao variar e inflaria o intervalo.
//   - META (efeito fixo, ponderado por inverso da variancia): "qual o efeito comum?" Da
//     mais peso a competicao que estima com mais precisao, que nem sempre e a maior.
//
// Aplicabilidade: so vale agrupar quando a variante testada e a MESMA em todas as
// competicoes — um parametro global (targetRatio, alphas, rho, fator de amplitude) ou uma
// regra de semente. Parametros por serie (lambdas[serie]) nao sao agrupaveis: nao existe
// hipotese comum a testar.

const M = require('./metrics.cjs');

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const media = a => a.reduce((x, y) => x + y, 0) / a.length;

// Diferencas de Brier jogo a jogo, pareadas, de uma competicao.
function difs(predsA, predsB) {
  if (predsA.length !== predsB.length) throw new Error('pool: n difere entre variante e base');
  return predsA.map((p, i) => M.brierOf(p) - M.brierOf(predsB[i]));
}

// Erro padrao do efeito medio de uma competicao (delta method sobre as diferencas pareadas).
function ep(d) {
  const n = d.length;
  if (n < 2) return Infinity;
  const m = media(d);
  const v = d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v / n);
}

// blocos: [{ competicao, predsVariante, predsBase }]
function agrupar(blocos, { B = 2000, seed = 20260819 } = {}) {
  const porComp = blocos.map(b => {
    const d = difs(b.predsVariante, b.predsBase);
    const m = media(d), e = ep(d);
    return {
      competicao: b.competicao, n: d.length, delta: m, ep: e,
      ic95: [m - 1.96 * e, m + 1.96 * e],
      significativo: Math.abs(m) > 1.96 * e,
      _d: d,
    };
  });

  // --- agrupado: bootstrap pareado ESTRATIFICADO (reamostra dentro de cada competicao) ---
  const rnd = mulberry(seed);
  const nTot = porComp.reduce((a, c) => a + c.n, 0);
  const amostras = [];
  for (let b = 0; b < B; b++) {
    let acc = 0;
    for (const c of porComp) {
      let s = 0;
      for (let i = 0; i < c.n; i++) s += c._d[(rnd() * c.n) | 0];
      acc += s;                    // soma, nao media: pondera pelo n de cada competicao
    }
    amostras.push(acc / nTot);
  }
  amostras.sort((x, y) => x - y);
  const deltaAgrupado = porComp.reduce((a, c) => a + c.delta * c.n, 0) / nTot;
  const icAgrupado = [amostras[Math.floor(0.025 * B)], amostras[Math.floor(0.975 * B)]];

  // --- meta de efeito fixo: ponderacao por inverso da variancia ---
  //
  // Competicao com variancia ZERO fica de fora. Isso acontece de verdade: um parametro
  // inerte (targetRatio nas series B e C, onde o teto maxSpread morde antes) produz
  // diferenca exatamente zero em todos os jogos, o peso 1/0 vira infinito e o agrupamento
  // inteiro sai NaN. Um bloco sem variacao nao carrega informacao sobre o efeito — nao e
  // evidencia de efeito nulo, e sim ausencia de experimento.
  const informativos = porComp.filter(c => isFinite(c.ep) && c.ep > 0);
  const inertes = porComp.filter(c => !(isFinite(c.ep) && c.ep > 0)).map(c => c.competicao);
  if (!informativos.length) {
    return {
      porCompeticao: porComp.map(({ _d, ...r }) => r),
      agrupado: { n: nTot, delta: deltaAgrupado, ic95: icAgrupado, significativo: false },
      meta: null, heterogeneidade: null, inertes,
      poder: { zAgrupado: 0, zMelhorIndividual: 0, ganho: null, sinaisConsistentes: true },
    };
  }
  const w = informativos.map(c => 1 / (c.ep * c.ep));
  const somaW = w.reduce((a, x) => a + x, 0);
  const deltaMeta = informativos.reduce((a, c, i) => a + w[i] * c.delta, 0) / somaW;
  const epMeta = Math.sqrt(1 / somaW);

  // --- heterogeneidade (Q de Cochran e I2) ---
  const Q = informativos.reduce((a, c, i) => a + w[i] * (c.delta - deltaMeta) ** 2, 0);
  const gl = informativos.length - 1;
  const I2 = gl > 0 ? Math.max(0, (Q - gl) / Q) : 0;

  // --- ganho real de poder: |z| agrupado contra o melhor |z| individual ---
  const zMeta = deltaMeta / epMeta;
  // Comparar com o MAIOR z individual e um teto pessimista de proposito: o maximo sobre
  // cinco competicoes e otimista por selecao (maldicao do vencedor), entao um ganho > 1
  // contra ele e evidencia forte de que agrupar valeu.
  const zMelhorIndividual = Math.max(...informativos.map(c => Math.abs(c.delta / c.ep)));
  const sinais = new Set(informativos.filter(c => c.delta !== 0).map(c => Math.sign(c.delta)));

  return {
    porCompeticao: porComp.map(({ _d, ...r }) => r),
    agrupado: {
      n: nTot, delta: deltaAgrupado, ic95: icAgrupado,
      significativo: icAgrupado[0] * icAgrupado[1] > 0,
    },
    meta: {
      delta: deltaMeta, ep: epMeta, z: zMeta,
      ic95: [deltaMeta - 1.96 * epMeta, deltaMeta + 1.96 * epMeta],
      significativo: Math.abs(zMeta) > 1.96,
    },
    heterogeneidade: { Q, gl, I2 },
    inertes,
    poder: {
      zAgrupado: Math.abs(zMeta),
      zMelhorIndividual,
      ganho: zMelhorIndividual > 0 ? Math.abs(zMeta) / zMelhorIndividual : null,
      sinaisConsistentes: sinais.size === 1,
    },
  };
}

module.exports = { agrupar, difs, ep, media };
