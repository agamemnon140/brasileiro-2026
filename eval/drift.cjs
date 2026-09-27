// O `drift` (sigmaElo, padrao 15) e o unico parametro que NENHUM teste de curto prazo deste
// harness consegue ver.
//
// Por que: applyDrift so e chamado dentro do Monte Carlo, uma vez por rodada SIMULADA, e so
// para rodadas alem da ultima disputada (`rd > maxRR && cfg.drift > 0`). O walk-forward
// caminha apenas sobre jogos reais, entao nunca o invoca. Todo o estagio de curto prazo e
// cego a ele.
//
// E ele nao e decorativo em ATK/DEF: applyDrift perturba atk/def junto com o Elo
// (sigma_ad = drift x 0.008), e atk/def e o que alimenta lambda. Como o ruido se ACUMULA a
// cada rodada simulada, o efeito cresce com o alcance — este e, na pratica, o botao que
// regula a largura das distribuicoes de longo prazo.
//
// Daqui sai a hipotese a testar: drift de menos produz probabilidades confiantes demais
// (o campeao "certo" cedo demais), drift de mais produz probabilidades lavadas. O RPS e
// pouco sensivel a isso; a CALIBRACAO dos eventos binarios e o instrumento certo.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');
const M = require('./lib/metrics.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'simMC', 'parseTab', 'calcClassif',
  'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING',
  'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING'];

const soma = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0);

function rodar({ series = ['A', 'B', 'C'], drifts = [0, 5, 15, 30, 60], nSims = 4000, nSeeds = 2, passoR = 3 } = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const saida = { drifts, nSims, nSeeds, driftVigente: cfg0.drift, series: {}, agregado: {} };

  // Acumula, por valor de drift, todos os pares (probabilidade prevista, desfecho) dos
  // eventos binarios, em todas as series e cortes.
  const eventos = {};
  drifts.forEach(d => eventos[d] = []);

  for (const sk of series) {
    const ranking = E[`S${sk}_RANKING`];
    const times = Object.keys(ranking);
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const res = dados.merged[sk];
    const porRodada = fixture.filter(g => g.rodada === 1).length;
    const cont = {};
    res.forEach(x => cont[x.r] = (cont[x.r] || 0) + 1);
    const H = Math.max(...Object.keys(cont).map(Number).filter(r => cont[r] >= porRodada / 2));
    const verdade = E.calcClassif(times, res.filter(x => x.r <= H));
    const posDe = {};
    verdade.forEach(c => posDe[c.time] = c.pos);

    const linhas = {};
    for (const drift of drifts) {
      const cfg = structuredClone(cfg0);
      cfg.drift = drift;
      let somaRps = 0, n = 0;
      for (let r = passoR; r < H; r += passoR) {
        for (let s = 0; s < nSeeds; s++) {
          const { dist } = L.preverEm(E, {
            times, ranking, fixture, res, cfg, sk, H, corte: r,
            nSims, ak: cfg.defaultAlpha, seed: 51000 + s * 173 + r * 11 + drift,
          });
          somaRps += L.pontuar(dist, verdade, times.length).rps;
          n++;
          // eventos binarios: lider, top-4, 4 ultimos
          for (const [time, d] of Object.entries(dist)) {
            const pos = posDe[time];
            if (!pos) continue;
            eventos[drift].push(
              { p: d[0], o: pos === 1 ? 1 : 0 },
              { p: soma(d, 0, 4), o: pos <= 4 ? 1 : 0 },
              { p: soma(d, times.length - 4, times.length), o: pos > times.length - 4 ? 1 : 0 });
          }
        }
      }
      linhas[drift] = { rps: somaRps / n, execucoes: n };
      process.stderr.write(`  [${sk}] drift ${drift}: RPS ${(somaRps / n).toFixed(5)}\n`);
    }
    saida.series[sk] = { H, linhas };
  }

  // Calibracao agregada por drift: Brier dos eventos, viés (previsto - observado) e ECE.
  for (const d of drifts) {
    const ev = eventos[d];
    const n = ev.length;
    const brier = ev.reduce((a, x) => a + (x.p - x.o) ** 2, 0) / n;
    const prev = ev.reduce((a, x) => a + x.p, 0) / n;
    const obs = ev.reduce((a, x) => a + x.o, 0) / n;
    // Confianca: quanto a previsao se afasta da indecisao. Drift alto encolhe isso.
    const confianca = ev.reduce((a, x) => a + Math.abs(x.p - 0.5), 0) / n;
    // ECE em 10 faixas sobre os eventos binarios.
    const bins = Array.from({ length: 10 }, () => ({ p: 0, o: 0, n: 0 }));
    ev.forEach(x => { const k = Math.min(9, Math.floor(x.p * 10)); bins[k].p += x.p; bins[k].o += x.o; bins[k].n++; });
    const ece = bins.filter(b => b.n).reduce((a, b) => a + b.n * Math.abs(b.o / b.n - b.p / b.n), 0) / n;
    saida.agregado[d] = { n, brier, previsto: prev, observado: obs, ece, confianca, bins };
  }
  return saida;
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = rodar({
    series: (arg('--series') || 'A,B,C').split(','),
    nSims: parseInt(arg('--sims') || '4000'),
    nSeeds: parseInt(arg('--seeds') || '2'),
  });
  console.log('\n=== RPS por serie e drift (menor e melhor) ===');
  const ds = out.drifts;
  console.log('serie | ' + ds.map(d => ('drift ' + d).padStart(11)).join(' |'));
  for (const [sk, s] of Object.entries(out.series)) {
    const melhor = Math.min(...ds.map(d => s.linhas[d].rps));
    console.log(sk.padEnd(5) + ' | ' + ds.map(d =>
      (s.linhas[d].rps.toFixed(5) + (s.linhas[d].rps === melhor ? '*' : ' ')).padStart(11)).join(' |'));
  }
  console.log('\n=== Calibracao dos eventos binarios (lider / top-4 / 4 ultimos), agregada ===');
  console.log('drift | Brier    | previsto | observado | vies    | ECE     | confianca');
  for (const d of ds) {
    const a = out.agregado[d];
    console.log(`${String(d).padStart(5)} | ${a.brier.toFixed(5)}  | ${(a.previsto * 100).toFixed(2)}%   | ` +
      `${(a.observado * 100).toFixed(2)}%    | ${((a.previsto - a.observado) * 100 >= 0 ? '+' : '')}` +
      `${((a.previsto - a.observado) * 100).toFixed(2)}pp | ${(a.ece * 100).toFixed(3)}% | ${(a.confianca * 100).toFixed(2)}%`);
  }
  const dst = path.join(__dirname, 'out', 'drift.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar };
