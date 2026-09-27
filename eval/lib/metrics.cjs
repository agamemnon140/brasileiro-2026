// Métricas de curto prazo. O metricsOf do app já dá Brier/logloss/acurácia, mas os
// baselines dele são IN-SAMPLE: brierBase usa as frequências observadas nos próprios
// jogos que pontua, o que lhe dá o gabarito da temporada de graça. Aqui esse baseline é
// refeito walk-forward (só o passado de cada jogo), que é a comparação honesta.
//
// Convenção: pred = {pH,pD,pA,oH,oD,oA} com p em [0,1] e o em {0,1}, na ordem cronológica
// (rodada crescente) — a mesma ordem que backtestSeries devolve.

const EPS = 1e-9;

function brierOf(p) {
  return (p.pH - p.oH) ** 2 + (p.pD - p.oD) ** 2 + (p.pA - p.oA) ** 2;
}

function loglossOf(p) {
  const po = p.oH ? p.pH : p.oD ? p.pD : p.pA;
  return -Math.log(Math.max(EPS, po));
}

// Baseline honesto: para o jogo i, prevê a frequência observada nos jogos 0..i-1.
// Antes de haver histórico suficiente usa o prior uniforme, suavizado por Laplace para
// não emitir probabilidade zero (que estouraria o logloss).
function baselineWalkForward(preds, prior = 1 / 3, alpha = 3) {
  const out = [];
  let nH = 0, nD = 0, nA = 0, n = 0;
  for (const p of preds) {
    const den = n + 3 * alpha;
    out.push({
      pH: (nH + alpha * 3 * prior) / den,
      pD: (nD + alpha * 3 * prior) / den,
      pA: (nA + alpha * 3 * prior) / den,
      oH: p.oH, oD: p.oD, oA: p.oA,
    });
    nH += p.oH; nD += p.oD; nA += p.oA; n++;
  }
  return out;
}

function baselineUniforme(preds) {
  return preds.map(p => ({ pH: 1 / 3, pD: 1 / 3, pA: 1 / 3, oH: p.oH, oD: p.oD, oA: p.oA }));
}

function score(preds) {
  const n = preds.length;
  if (!n) return { n: 0 };
  let brier = 0, logloss = 0, acc = 0;
  let sPH = 0, sPD = 0, sPA = 0, oH = 0, oD = 0, oA = 0;
  for (const p of preds) {
    brier += brierOf(p);
    logloss += loglossOf(p);
    const fav = p.pH >= p.pD && p.pH >= p.pA ? 'H' : p.pD >= p.pA ? 'D' : 'A';
    const out = p.oH ? 'H' : p.oD ? 'D' : 'A';
    if (fav === out) acc++;
    sPH += p.pH; sPD += p.pD; sPA += p.pA;
    oH += p.oH; oD += p.oD; oA += p.oA;
  }
  return {
    n,
    brier: brier / n,
    logloss: logloss / n,
    acc: acc / n,
    // Viés: quanto o modelo prevê em média vs. o que aconteceu. Diagnóstico direto de
    // homeAdv (viés em H) e da forma da Poisson (viés em D).
    prevH: sPH / n, obsH: oH / n,
    prevD: sPD / n, obsD: oD / n,
    prevA: sPA / n, obsA: oA / n,
  };
}

// Curva de confiabilidade: agrupa TODAS as probabilidades emitidas (H, D e A juntas, são
// 3n pontos) em faixas e compara previsto vs. observado. É o que mostra se "70%" quer
// mesmo dizer 70%.
function calibracao(preds, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ somaP: 0, somaO: 0, n: 0 }));
  for (const p of preds) {
    for (const [pr, ob] of [[p.pH, p.oH], [p.pD, p.oD], [p.pA, p.oA]]) {
      const k = Math.min(nBins - 1, Math.floor(pr * nBins));
      bins[k].somaP += pr; bins[k].somaO += ob; bins[k].n++;
    }
  }
  return bins.map((b, k) => ({
    faixa: `${(k / nBins * 100).toFixed(0)}-${((k + 1) / nBins * 100).toFixed(0)}%`,
    n: b.n,
    previsto: b.n ? b.somaP / b.n : null,
    observado: b.n ? b.somaO / b.n : null,
    desvio: b.n ? b.somaO / b.n - b.somaP / b.n : null,
  }));
}

// Erro de calibração esperado: desvio médio ponderado pelo tamanho da faixa. Um número
// só para ranquear configs pela honestidade das probabilidades.
function ece(preds, nBins = 10) {
  const bins = calibracao(preds, nBins);
  let tot = 0, num = 0;
  for (const b of bins) {
    if (!b.n) continue;
    num += b.n * Math.abs(b.desvio);
    tot += b.n;
  }
  return tot ? num / tot : null;
}

// Poder de discriminação: separa os jogos por quão desequilibrado o modelo os julga.
// Responde "o modelo só acerta o óbvio, ou ele sabe algo nos jogos parelhos?".
function porFavoritismo(preds, cortes = [0.40, 0.50, 0.60]) {
  const faixas = [];
  const lim = [0, ...cortes, 1];
  for (let i = 0; i < lim.length - 1; i++) {
    const sel = preds.filter(p => {
      const mx = Math.max(p.pH, p.pD, p.pA);
      return mx >= lim[i] && mx < lim[i + 1];
    });
    faixas.push({ faixa: `favorito ${(lim[i] * 100).toFixed(0)}-${(lim[i + 1] * 100).toFixed(0)}%`, ...score(sel) });
  }
  return faixas.filter(f => f.n > 0);
}

// Bootstrap sobre os jogos: IC da diferença de Brier entre dois conjuntos de previsões
// sobre os MESMOS jogos (pareado). Se o IC cruza zero, a diferença é ruído.
function bootstrapDelta(predsA, predsB, B = 1000, seed = 12345) {
  if (predsA.length !== predsB.length) throw new Error('bootstrapDelta: tamanhos diferentes');
  const n = predsA.length;
  const dif = predsA.map((p, i) => brierOf(p) - brierOf(predsB[i]));
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const meds = [];
  for (let b = 0; b < B; b++) {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += dif[(rnd() * n) | 0];
    meds.push(acc / n);
  }
  meds.sort((x, y) => x - y);
  const obs = dif.reduce((a, b) => a + b, 0) / n;
  return {
    delta: obs,                       // negativo = predsA melhor
    ic95: [meds[Math.floor(0.025 * B)], meds[Math.floor(0.975 * B)]],
    significativo: meds[Math.floor(0.025 * B)] * meds[Math.floor(0.975 * B)] > 0,
  };
}

module.exports = { brierOf, loglossOf, score, calibracao, ece, porFavoritismo, baselineWalkForward, baselineUniforme, bootstrapDelta };
