// COMO DEMONSTRAR que a visao de longo prazo faz sentido?
//
// As metricas agregadas (RPS, Murphy) convencem quem ja acredita em metrica. A demonstracao
// que convence um leitor e outra: **quando o modelo discorda da tabela, quem ganha?**
//
// Se o modelo so repetisse a classificacao corrente, seria inutil por construcao — qualquer
// um le a tabela de graca. O valor dele esta exatamente nos desacordos: o time que esta fora
// do G4 hoje mas que o modelo insiste que termina dentro; o time que esta fora do Z4 mas que
// o modelo condena. Este modulo cata todos esses casos, com nome, rodada e desfecho, e conta
// o placar do duelo modelo x tabela.
//
// Definicao de desacordo: para um evento binario (lider / top-4 / 4 ultimos), a tabela na
// rodada r "preve" 0 ou 1 (o time esta ou nao esta na zona agora). O modelo preve p. Quando
// |p - tabela| > 0.5, os dois apontam para lados opostos. No desfecho (rodada H), quem
// apontou certo leva o ponto.
//
// O placar agregado e a demonstracao; os exemplos nomeados sao o que a torna legivel.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'simMC', 'parseTab', 'calcClassif',
  'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING',
  'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING'];

const soma = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0);

function rodar({ series = ['A', 'B', 'C'], nSims = 5000, nSeeds = 2, passoR = 3, limiar = 0.5 } = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const casos = [];

  for (const sk of series) {
    const ranking = E[`S${sk}_RANKING`];
    const times = Object.keys(ranking);
    const K = times.length;
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const res = dados.merged[sk];
    const porRod = fixture.filter(g => g.rodada === 1).length;
    const cont = {};
    res.forEach(x => cont[x.r] = (cont[x.r] || 0) + 1);
    const H = Math.max(...Object.keys(cont).map(Number).filter(r => cont[r] >= porRod / 2));
    const tabelaH = E.calcClassif(times, res.filter(x => x.r <= H));
    const posH = {};
    tabelaH.forEach(c => posH[c.time] = c.pos);

    for (let r = passoR; r <= H - 2; r += passoR) {
      const tabelaR = E.calcClassif(times, res.filter(x => x.r <= r));
      const posR = {};
      tabelaR.forEach(c => posR[c.time] = c.pos);

      // media de nSeeds sementes, para o caso individual nao depender de uma execucao
      const dists = [];
      for (let s = 0; s < nSeeds; s++) {
        const { dist } = L.preverEm(E, {
          times, ranking, fixture, res, cfg, sk, H, corte: r,
          nSims, ak: cfg.defaultAlpha, seed: 91000 + s * 137 + r * 17,
        });
        dists.push(dist);
      }
      const pMedio = (t, i0, i1) => dists.reduce((a, d) => a + soma(d[t], i0, i1), 0) / dists.length;

      for (const t of times) {
        const pr = posR[t], ph = posH[t];
        if (!pr || !ph) continue;
        for (const [evento, i0, i1, dentroR, dentroH] of [
          ['lider', 0, 1, pr === 1, ph === 1],
          ['top4', 0, 4, pr <= 4, ph <= 4],
          ['ultimos4', K - 4, K, pr > K - 4, ph > K - 4],
        ]) {
          const p = pMedio(t, i0, i1);
          const tab = dentroR ? 1 : 0;
          if (Math.abs(p - tab) <= limiar) continue;   // concordam; sem duelo
          const real = dentroH ? 1 : 0;
          // quem apontou para o lado certo? modelo aponta para round(p), tabela para tab
          const modeloAcertou = (p > 0.5 ? 1 : 0) === real;
          casos.push({
            serie: sk, evento, time: t, corte: r, H,
            posNoCorte: pr, posNoDesfecho: ph,
            pModelo: +p.toFixed(3), tabelaDizia: tab, aconteceu: real,
            vencedor: modeloAcertou ? 'modelo' : 'tabela',
            margem: +Math.abs(p - tab).toFixed(3),
          });
        }
      }
      process.stderr.write(`  [${sk}] corte ${r}/${H}\n`);
    }
  }

  const placar = { modelo: 0, tabela: 0 };
  casos.forEach(c => placar[c.vencedor]++);
  const porEvento = {};
  for (const ev of ['lider', 'top4', 'ultimos4']) {
    const g = casos.filter(c => c.evento === ev);
    porEvento[ev] = { n: g.length, modelo: g.filter(c => c.vencedor === 'modelo').length };
  }
  const porSerie = {};
  for (const sk of series) {
    const g = casos.filter(c => c.serie === sk);
    porSerie[sk] = { n: g.length, modelo: g.filter(c => c.vencedor === 'modelo').length };
  }
  // exemplos mais nitidos: maiores margens, vitorias e derrotas separadas
  const ordenado = [...casos].sort((a, b) => b.margem - a.margem);
  return {
    nSims, nSeeds, limiar,
    placar, nCasos: casos.length,
    taxaModelo: casos.length ? placar.modelo / casos.length : null,
    porEvento, porSerie,
    exemplosVitoria: ordenado.filter(c => c.vencedor === 'modelo').slice(0, 12),
    exemplosDerrota: ordenado.filter(c => c.vencedor === 'tabela').slice(0, 8),
    casos,
  };
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = rodar({
    series: (arg('--series') || 'A,B,C').split(','),
    nSims: parseInt(arg('--sims') || '5000'),
    nSeeds: parseInt(arg('--seeds') || '2'),
  });
  console.log(`\n=== DUELO modelo x tabela (desacordos francos: |p - tabela| > ${out.limiar}) ===`);
  console.log(`placar geral: MODELO ${out.placar.modelo} x ${out.placar.tabela} TABELA  ` +
    `(${(out.taxaModelo * 100).toFixed(1)}% para o modelo, n=${out.nCasos})`);
  for (const [ev, x] of Object.entries(out.porEvento)) {
    console.log(`  ${ev.padEnd(9)} modelo ${x.modelo}/${x.n} (${x.n ? (x.modelo / x.n * 100).toFixed(0) : '-'}%)`);
  }
  for (const [sk, x] of Object.entries(out.porSerie)) {
    console.log(`  serie ${sk}  modelo ${x.modelo}/${x.n} (${x.n ? (x.modelo / x.n * 100).toFixed(0) : '-'}%)`);
  }
  console.log('\n-- vitorias mais nitidas do modelo --');
  for (const c of out.exemplosVitoria.slice(0, 8)) {
    console.log(`  [${c.serie}] r${c.corte}: ${c.time} era ${c.posNoCorte}º; modelo dava ${(c.pModelo * 100).toFixed(0)}% de ${c.evento}; ` +
      `na r${c.H} estava ${c.posNoDesfecho}º -> ${c.aconteceu ? 'DENTRO' : 'FORA'}`);
  }
  console.log('\n-- derrotas mais nitidas do modelo --');
  for (const c of out.exemplosDerrota.slice(0, 5)) {
    console.log(`  [${c.serie}] r${c.corte}: ${c.time} era ${c.posNoCorte}º; modelo dava ${(c.pModelo * 100).toFixed(0)}% de ${c.evento}; ` +
      `na r${c.H} estava ${c.posNoDesfecho}º -> ${c.aconteceu ? 'DENTRO' : 'FORA'}`);
  }
  const dst = path.join(__dirname, 'out', 'demonstracao.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar };
