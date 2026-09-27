// Avaliação de longo prazo: o modelo, sabendo só até a rodada r, acerta a TABELA da
// rodada H?
//
// Duas decisões de desenho que valem explicação:
//
// 1. HORIZONTE. simMC não tem parâmetro de horizonte — simula sempre até o fim da lista de
//    jogos que recebe. O horizonte encurtado sai de filtrar a fixture por rodada <= H: o MC
//    passa a tratar H como o fim do campeonato. Com H = 38 (dezembro) isso é a temporada
//    inteira e nada muda no comportamento.
//
// 2. EVENTOS DERIVADOS DE posF. Os campos titulo/g4/z4 do simMC embutem a regra de zona de
//    cada série (nReb, vagas de acesso, quadrangular). Em horizonte encurtado essas zonas
//    não existem — "rebaixado na rodada 22" não é coisa. Então todo evento é derivado da
//    distribuição de posição posF, que é bem definida em qualquer H e comparável entre
//    séries. Isso também neutraliza as fases finais de B e C: elas continuam rodando dentro
//    do simMC, mas não entram na pontuação.

// Ranked Probability Score sobre a distribuição de colocação. É a métrica certa para
// classificação porque penaliza errar por muitas posições mais que errar por uma — o que
// Brier por posição, tratando as posições como categorias sem ordem, não faz.
function rps(distrib, posReal) {
  const K = distrib.length;
  let acc = 0, cp = 0, co = 0;
  for (let k = 0; k < K - 1; k++) {
    cp += distrib[k];
    co += (k === posReal - 1 ? 1 : 0);
    acc += (cp - co) ** 2;
  }
  return acc / (K - 1);
}

const soma = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0);

// PRNG semeado: simMC usa Math.random, então reprodutibilidade exige trocar o global.
// Devolve uma função de restauração — sempre chamar, senão o resto do processo fica preso
// à sequência semeada.
function semear(seed) {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = orig; };
}

// Roda o MC num corte e devolve, por time, a distribuição de colocação normalizada.
function preverEm(E, { times, ranking, fixture, res, cfg, sk, H, corte, nSims, ak, seed }) {
  const tab = fixture.filter(g => g.rodada <= H);
  const conhecidos = res.filter(x => x.r <= corte);
  const restaurar = semear(seed);
  let r;
  try {
    r = E.simMC(times, ranking, tab, conhecidos, cfg, sk, nSims, ak, false);
  } finally {
    restaurar();
  }
  const out = {};
  for (const p of r.probs) {
    const d = p.posF.map(x => x / 100);
    const s = d.reduce((a, b) => a + b, 0) || 1;
    out[p.time] = d.map(x => x / s);
  }
  return { dist: out, nJogosConhecidos: conhecidos.length };
}

// Pontua um corte contra a tabela real em H.
function pontuar(dist, tabelaReal, nTimes) {
  const posDe = {};
  tabelaReal.forEach(c => posDe[c.time] = c.pos);
  const nTop = 4, nBot = 4;
  let sRps = 0, sB1 = 0, sBtop = 0, sBbot = 0, n = 0;
  const porTime = [];
  for (const [time, d] of Object.entries(dist)) {
    const pos = posDe[time];
    if (!pos) continue;
    const p1 = d[0];
    const pTop = soma(d, 0, nTop);
    const pBot = soma(d, nTimes - nBot, nTimes);
    const o1 = pos === 1 ? 1 : 0;
    const oTop = pos <= nTop ? 1 : 0;
    const oBot = pos > nTimes - nBot ? 1 : 0;
    const r = rps(d, pos);
    sRps += r; sB1 += (p1 - o1) ** 2; sBtop += (pTop - oTop) ** 2; sBbot += (pBot - oBot) ** 2;
    n++;
    porTime.push({ time, posReal: pos, rps: r, p1, pTop, pBot, o1, oTop, oBot });
  }
  return {
    n,
    rps: sRps / n,
    brierLider: sB1 / n,
    brierTop4: sBtop / n,
    brierUlt4: sBbot / n,
    porTime,
  };
}

module.exports = { rps, preverEm, pontuar, semear, soma };
