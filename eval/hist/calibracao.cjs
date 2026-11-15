// CALIBRACAO DAS ZONAS EM 2022-2025, e o que o drift e o preset fazem com ela.
//
// eval/zonas2026.cjs mostrou, em 2026, probabilidades honestas com uma timidez entre 70% e
// 90% (o que o modelo dava com 85% aconteceu em 92%). Uma temporada nao decide se isso e
// defeito ou acaso. Aqui a mesma medida roda nas 16 celulas de 2022 a 2025, com a config
// vigente e com variantes dos dois parametros que mexem na largura da projecao: o drift
// (ruido estrutural por rodada simulada) e o preset de aprendizado.
//
// Semente "todos iguais": as temporadas passadas nao tem a nota a mao. Zonas e regua iguais
// as de sementes.cjs. Cortes: toda rodada na C e na D, rodadas pares na A e na B.
//
//   node eval/hist/calibracao.cjs                      # vigente
//   node eval/hist/calibracao.cjs --drift 0 --nome drift0
//   node eval/hist/calibracao.cjs --preset base --nome base
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../../scripts/engine.cjs');
const L = require('../lib/longterm.cjs');
const { carregar } = require('./parametros.cjs');
const { calibrar } = require('../zonas2026.cjs');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const NSIMS = Number(arg('sims')) || 2000;
const EVENTOS = {
  A: [['1o', 1, 1], ['top4', 1, 4], ['top6', 1, 6], ['z4', 17, 20]],
  B: [['1o', 1, 1], ['top4', 1, 4], ['z4', 17, 20]],
  C: [['1o', 1, 1], ['top8', 1, 8], ['z4', 17, 20]],
  D: [['1o', 1, 1], ['top4', 1, 4]],
};

function rodar({ drift, preset }) {
  const E = loadEngine(['DEFAULT_CFG', 'simMC', 'calcClassif']);
  const cfg0 = E.DEFAULT_CFG, recs = [];
  const ak = preset || cfg0.defaultAlpha;
  for (const cel of carregar()) {
    const { ano, serie } = cel, passo = (serie === 'A' || serie === 'B') ? 2 : 1;
    const cfg = structuredClone(cfg0); cfg.lambdas.A = { ...cfg0.lambdas[serie] };
    if (drift !== null) cfg.drift = drift;
    cel.ligas.forEach((l, gi) => {
      const real = {}; E.calcClassif(l.times, l.res).forEach(c => real[c.time] = c.pos);
      const ranking = {}; l.times.forEach(t => ranking[t] = { elo: 1575 });
      for (let corte = 0; corte < l.H; corte += passo) {
        const { dist } = L.preverEm(E, { times: l.times, ranking, fixture: l.fixture, res: l.res, cfg, sk: 'A', H: l.H, corte, nSims: NSIMS, ak, seed: ano * 1000 + gi * 37 + corte * 7 + serie.charCodeAt(0) });
        for (const [evento, de, ate0] of EVENTOS[serie]) { const ate = Math.min(ate0, l.times.length); for (const t of l.times) {
          recs.push({ serie, time: ano + ':' + t, evento, corte, H: l.H, k: ate - de + 1, n: l.times.length, p: L.soma(dist[t], de - 1, ate), o: real[t] >= de && real[t] <= ate ? 1 : 0 });
        } }
      }
    });
    process.stderr.write(`  ${ano} ${serie}\n`);
  }
  const brier = rs => rs.reduce((a, r) => a + (r.p - r.o) ** 2, 0) / rs.length;
  const out = { nSims: NSIMS, drift: drift === null ? cfg0.drift : drift, preset: ak, previsoes: recs.length, series: {}, geral: null };
  for (const s of ['A', 'B', 'C', 'D']) { const rs = recs.filter(r => r.serie === s); out.series[s] = { brier: brier(rs), calibracao: calibrar(rs) }; }
  out.geral = { brier: brier(recs), calibracao: calibrar(recs), primeiraMetade: calibrar(recs.filter(r => r.corte < r.H / 2)), segundaMetade: calibrar(recs.filter(r => r.corte >= r.H / 2)) };
  return out;
}

if (require.main === module) {
  const drift = arg('drift') === null ? null : Number(arg('drift')), preset = arg('preset'), nome = arg('nome') || 'vigente';
  const out = rodar({ drift, preset });
  const pc = x => (x * 100).toFixed(0) + '%', pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
  console.log(`== ${nome}: drift ${out.drift}, preset ${out.preset}, ${out.previsoes} previsoes | Brier geral ${out.geral.brier.toFixed(4)} | por serie ${Object.entries(out.series).map(([s, v]) => s + ' ' + v.brier.toFixed(4)).join(' ')} | ECE ${(out.geral.calibracao.ece * 100).toFixed(2)} pp`);
  for (const f of out.geral.calibracao.faixas) if (f.n) console.log(`  ${f.faixa.padEnd(10)} | ${String(f.n).padStart(6)} | ${String(f.casos).padStart(5)} | ${pc(f.previsto).padStart(5)} | ${pc(f.observado).padStart(5)} | ${pp(f.diferenca)} [${pp(f.ic95[0])}; ${pp(f.ic95[1])}]${f.compativel ? '' : '  <- fora'}`);
  fs.writeFileSync(path.join(__dirname, '..', 'out', `hist_calibracao_${nome}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`-> eval/out/hist_calibracao_${nome}.json`);
}
module.exports = { rodar };
