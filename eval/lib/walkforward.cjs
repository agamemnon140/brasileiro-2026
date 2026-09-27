// Walk-forward que replica backtestSeries do app, MAS guarda os λ de cada jogo.
//
// backtestSeries devolve só {pH,pD,pA,o*}, o que impede testar mapeamentos alternativos
// de λ -> probabilidade (Dixon-Coles, inflação de empate) sem reevoluir os ratings. Aqui
// os λ ficam disponíveis e a evolução dos ratings é idêntica — verificado contra o
// backtestSeries original (ver --selftest).
// `eo` seleciona o modo: false = ATK/DEF (o padrao do app), true = ELO PURO. A diferenca
// nao e cosmetica — em ELO PURO calcL deriva lambda do gap de Elo COM a vantagem de casa e
// do c0Log, entao homeAdv e kElo deixam de ser inertes. Todo achado de inercia deste harness
// vale para o modo que o app roda, e so para ele.
function walkForward(E, times, getElo, res, cfg, sk, ak, eo = false) {
  const lg = E.initLeague(times, getElo, cfg);
  const { mc, mf } = E.getML(cfg, sk);
  const elos = {}, atk = {}, def = {};
  times.forEach(t => {
    elos[t] = getElo(t);
    const i = lg.initAD(elos[t]);
    atk[t] = i.atk; def[t] = i.def;
  });
  const sorted = [...res].sort((a, b) => (a.r || 0) - (b.r || 0));
  const out = [];
  for (const r of sorted) {
    if (elos[r.c] === undefined || elos[r.f] === undefined) continue;
    const { lC, lF } = E.calcL(atk[r.c], def[r.c], atk[r.f], def[r.f], elos[r.c], elos[r.f], mc, mf, cfg.homeAdv, eo, cfg.c0Log);
    out.push({
      lC, lF, r: r.r, c: r.c, f: r.f, gc: r.gc, gf: r.gf,
      oH: r.gc > r.gf ? 1 : 0, oD: r.gc === r.gf ? 1 : 0, oA: r.gc < r.gf ? 1 : 0,
    });
    E.updR(elos, atk, def, r.c, r.f, r.gc, r.gf, lC, lF, cfg, ak, eo);
  }
  return out;
}

const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p = p * l / i; return p; };

// Correção de Dixon-Coles: a Poisson bivariada independente erra sistematicamente os
// placares baixos, e é daí que vem o déficit de empates. rho<0 infla 0-0 e 1-1 e desinfla
// 1-0 e 0-1, sem mexer no resto da grade.
function tau(x, y, lC, lF, rho) {
  if (x === 0 && y === 0) return 1 - lC * lF * rho;
  if (x === 0 && y === 1) return 1 + lC * rho;
  if (x === 1 && y === 0) return 1 + lF * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Mapeia (lC,lF) -> {pH,pD,pA}. rho=0 reproduz o calcProbs do app.
function probs(lC, lF, rho = 0, maxG = 8) {
  let pH = 0, pD = 0, pA = 0;
  for (let x = 0; x < maxG; x++) for (let y = 0; y < maxG; y++) {
    let p = pois(lC, x) * pois(lF, y);
    if (rho !== 0) p *= Math.max(1e-9, tau(x, y, lC, lF, rho));
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
  }
  const t = pH + pD + pA;
  return { pH: pH / t, pD: pD / t, pA: pA / t };
}

function aPreds(lams, rho = 0) {
  return lams.map(g => ({ ...probs(g.lC, g.lF, rho), oH: g.oH, oD: g.oD, oA: g.oA }));
}

module.exports = { walkForward, probs, aPreds, tau };
