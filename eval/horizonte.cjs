// Longo prazo com os dados que JA temos: a grade de horizontes.
//
// O estagio de longo prazo original fixa um H (a ultima rodada disputada) e varia so o corte
// r. Isso da uma unica tabela realizada por competicao — tres desfechos no total — e nenhuma
// resposta sobre ATE QUANDO o modelo enxerga.
//
// Mas todo par (r, H) com r < H e uma previsao legitima com desfecho observado: "sabendo ate
// a rodada r, como estara a tabela na rodada H?". Varrendo a grade, as mesmas 615 partidas
// ja disputadas rendem centenas de pares previsao-desfecho, e o resultado pode ser
// decomposto pelo que de fato interessa: o ALCANCE (H − r).
//
// Os pares nao sao independentes — compartilham jogos e times — entao isto nao multiplica o
// tamanho efetivo da amostra. O que a grade da e RESOLUCAO: a curva de habilidade contra o
// alcance, e o ponto onde ela cruza a referencia ingenua. Uma unica temporada nunca dara um
// intervalo de confianca honesto sobre "quem sera campeao"; ela da, sim, a forma dessa curva.
//
// Duas referencias, ambas necessarias:
//   - TABELA CONGELADA: previsao pontual de que a colocacao de r se mantem em H. Forte em
//     alcance curto e o teto a bater; e o que qualquer leitor faz de graca olhando a tabela.
//   - SEMENTE NEUTRA: mesmo motor, todos os clubes com o mesmo Elo inicial. Isola quanto a
//     forca a priori agrega alem dos resultados ja disputados.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');
const S = require('./lib/seeds.cjs');
const J = require('./lib/rncjoin.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'simMC', 'parseTab', 'calcClassif', 'RNC_2026', 'ufOfTeam',
  'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING',
  'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING'];

// RPS de uma previsao pontual: toda a massa na colocacao que o time ocupa no corte.
function rpsCongelada(tabelaEm_r, tabelaEm_H, nTimes) {
  const posH = {};
  tabelaEm_H.forEach(c => posH[c.time] = c.pos);
  let soma = 0, n = 0;
  for (const c of tabelaEm_r) {
    const real = posH[c.time];
    if (!real) continue;
    const d = new Array(nTimes).fill(0);
    d[c.pos - 1] = 1;
    soma += L.rps(d, real);
    n++;
  }
  return n ? soma / n : null;
}

function rodar({ series = ['A', 'B', 'C'], nSims = 3000, nSeeds = 2, passoR = 3, alcances = [2, 4, 8, 16] } = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const resolver = J.construir(E.RNC_2026, E.ufOfTeam);
  const saida = { nSims, nSeeds, series: {} };

  for (const sk of series) {
    const ranking = E[`S${sk}_RANKING`];
    const times = Object.keys(ranking);
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const res = dados.merged[sk];
    const porRodada = fixture.filter(g => g.rodada === 1).length;
    const contagem = {};
    res.forEach(x => contagem[x.r] = (contagem[x.r] || 0) + 1);
    const hMax = Math.max(...Object.keys(contagem).map(Number).filter(r => contagem[r] >= porRodada / 2));

    const seeds = S.construir(times, ranking, resolver);
    const rkDe = ge => { const o = {}; times.forEach(t => o[t] = { elo: ge(t) }); return o; };
    const rkModelo = rkDe(seeds.atual);
    const rkNeutro = rkDe(seeds.iguais);

    const pontos = [];
    for (let r = passoR; r < hMax; r += passoR) {
      const tabEmR = E.calcClassif(times, res.filter(x => x.r <= r));
      for (const alc of alcances) {
        const H = r + alc;
        if (H > hMax) continue;
        const tabEmH = E.calcClassif(times, res.filter(x => x.r <= H));
        const medir = rk => {
          let acc = 0;
          for (let s = 0; s < nSeeds; s++) {
            const { dist } = L.preverEm(E, {
              times, ranking: rk, fixture, res, cfg, sk, H, corte: r,
              nSims, ak: cfg.defaultAlpha, seed: 31000 + s * 131 + r * 7 + alc,
            });
            acc += L.pontuar(dist, tabEmH, times.length).rps;
          }
          return acc / nSeeds;
        };
        pontos.push({
          r, H, alcance: alc,
          modelo: medir(rkModelo),
          neutro: medir(rkNeutro),
          congelada: rpsCongelada(tabEmR, tabEmH, times.length),
        });
      }
      process.stderr.write(`  [${sk}] corte ${r} de ${hMax}\n`);
    }

    // Agregacao por alcance: e aqui que a grade paga.
    const porAlcance = {};
    for (const alc of alcances) {
      const g = pontos.filter(p => p.alcance === alc);
      if (!g.length) continue;
      const m = k => g.reduce((a, b) => a + b[k], 0) / g.length;
      porAlcance[alc] = {
        n: g.length, modelo: m('modelo'), neutro: m('neutro'), congelada: m('congelada'),
        // Habilidade: 1 − RPS_modelo/RPS_referencia. Positivo = o modelo ganha.
        habilidadeVsCongelada: 1 - m('modelo') / m('congelada'),
        habilidadeVsNeutro: 1 - m('modelo') / m('neutro'),
        venceCongeladaEm: g.filter(p => p.modelo < p.congelada).length,
      };
    }
    saida.series[sk] = { hMax, alcances, pontos, porAlcance };
  }
  return saida;
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = rodar({
    series: (arg('--series') || 'A,B,C').split(','),
    nSims: parseInt(arg('--sims') || '3000'),
    nSeeds: parseInt(arg('--seeds') || '2'),
    passoR: parseInt(arg('--passo') || '3'),
  });
  for (const [sk, s] of Object.entries(out.series)) {
    console.log(`\n=== Série ${sk} (H máx ${s.hMax}) ===`);
    console.log('alcance | pares | RPS modelo | congelada | neutro | habilidade vs congelada | vence em');
    for (const [alc, x] of Object.entries(s.porAlcance)) {
      console.log(
        `${String(alc).padStart(7)} | ${String(x.n).padStart(5)} | ${x.modelo.toFixed(4).padStart(10)} | ` +
        `${x.congelada.toFixed(4).padStart(9)} | ${x.neutro.toFixed(4).padStart(6)} | ` +
        `${(x.habilidadeVsCongelada * 100).toFixed(1).padStart(22)}% | ${x.venceCongeladaEm}/${x.n}`);
    }
  }
  const dst = path.join(__dirname, 'out', 'horizonte.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, rpsCongelada };
