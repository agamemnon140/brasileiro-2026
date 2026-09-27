// A visao de longo prazo e CONFIAVEL? Quando o app diz 70% de G4, acontece 70% das vezes?
//
// Este e o teste central do que o app publica, e o que faltava. O RPS mede a qualidade da
// distribuicao de colocacao inteira; a habilidade contra a tabela congelada mede se vale a
// pena simular. Nenhum dos dois responde a pergunta que um leitor faz ao ver "Palmeiras:
// 62% de titulo" — se esse 62% quer dizer 62%.
//
// Metodo: cada trinca (corte, competicao, clube) produz uma previsao para tres eventos
// binarios (lider, top-4, 4 ultimos) e um desfecho observado na rodada H. Agrupando milhares
// dessas, da para montar o diagrama de confiabilidade — previsto contra observado por faixa —
// e decompor o Brier.
//
// DECOMPOSICAO DE MURPHY:  Brier = confiabilidade − resolucao + incerteza
//   confiabilidade  quanto as faixas se desviam da frequencia observada (0 = perfeito)
//   resolucao       quanto as faixas se afastam da taxa-base (alto = o modelo separa casos)
//   incerteza       variancia do proprio desfecho; nao depende do modelo, e o piso
// Um modelo pode ter Brier bom por ser honesto e inutil (resolucao ~0) ou por ser informativo
// e desonesto (resolucao alta, confiabilidade ruim). So o Brier nao distingue os dois.
//
// AGRUPAR POR ALCANCE e obrigatorio: a confiabilidade de uma previsao a 2 rodadas e a de uma
// a 16 sao coisas diferentes, e misturar as duas esconde exatamente onde o modelo quebra.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'simMC', 'parseTab', 'calcClassif',
  'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING',
  'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING'];

const soma = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0);

// Murphy sobre um conjunto de pares {p, o}, com faixas de largura fixa.
function decompor(pares, nBins = 10) {
  const n = pares.length;
  const base = pares.reduce((a, x) => a + x.o, 0) / n;
  const bins = Array.from({ length: nBins }, () => ({ n: 0, somaP: 0, somaO: 0 }));
  for (const x of pares) {
    const k = Math.min(nBins - 1, Math.floor(x.p * nBins));
    bins[k].n++; bins[k].somaP += x.p; bins[k].somaO += x.o;
  }
  let confiabilidade = 0, resolucao = 0;
  const faixas = [];
  for (let k = 0; k < nBins; k++) {
    const b = bins[k];
    if (!b.n) continue;
    const pMed = b.somaP / b.n, oMed = b.somaO / b.n;
    confiabilidade += b.n * (pMed - oMed) ** 2;
    resolucao += b.n * (oMed - base) ** 2;
    faixas.push({
      faixa: `${(k / nBins * 100).toFixed(0)}-${((k + 1) / nBins * 100).toFixed(0)}%`,
      n: b.n, previsto: pMed, observado: oMed, desvio: oMed - pMed,
    });
  }
  const brier = pares.reduce((a, x) => a + (x.p - x.o) ** 2, 0) / n;
  const conf = confiabilidade / n, resol = resolucao / n, incert = base * (1 - base);
  return {
    n, brier, taxaBase: base, nBins,
    confiabilidade: conf,
    resolucao: resol,
    incerteza: incert,
    // A identidade Brier = confiabilidade - resolucao + incerteza so e EXATA quando cada
    // faixa contem um unico valor previsto. Com previsoes continuas sobra um residuo, e ele
    // precisa ser reportado: se o residuo for da ordem da confiabilidade, o numero da
    // confiabilidade nao suporta leitura precisa — apenas um teto.
    residuo: (conf - resol + incert) - brier,
    // Skill de Brier contra prever sempre a taxa-base. Positivo = o modelo informa.
    skill: 1 - brier / (incert || 1),
    faixas,
  };
}

// A confiabilidade medida encolhe conforme as faixas afinam (menos variacao dentro da
// faixa), entao um valor unico de nBins nao e resposta. Reportar a serie inteira mostra se
// o numero e estavel ou se e artefato do agrupamento.
function sensibilidadeFaixas(pares, listaBins = [5, 10, 20, 50]) {
  return listaBins.map(nb => {
    const d = decompor(pares, nb);
    return { nBins: nb, confiabilidade: d.confiabilidade, resolucao: d.resolucao, residuo: d.residuo };
  });
}

function rodar({ series = ['A', 'B', 'C'], nSims = 4000, nSeeds = 2, passoR = 2,
                 bandas = [[1, 3], [4, 7], [8, 20]] } = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const saida = { nSims, nSeeds, bandas, porEvento: {}, porBanda: {}, series: {} };

  const todos = [];   // {evento, alcance, p, o, serie}

  for (const sk of series) {
    const ranking = E[`S${sk}_RANKING`];
    const times = Object.keys(ranking);
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const res = dados.merged[sk];
    const porRod = fixture.filter(g => g.rodada === 1).length;
    const cont = {};
    res.forEach(x => cont[x.r] = (cont[x.r] || 0) + 1);
    const hMax = Math.max(...Object.keys(cont).map(Number).filter(r => cont[r] >= porRod / 2));

    for (let r = passoR; r < hMax; r += passoR) {
      for (const H of [r + 2, r + 5, r + 10, hMax].filter((v, i, a) => v <= hMax && a.indexOf(v) === i)) {
        const verdade = E.calcClassif(times, res.filter(x => x.r <= H));
        const pos = {};
        verdade.forEach(c => pos[c.time] = c.pos);
        for (let s = 0; s < nSeeds; s++) {
          const { dist } = L.preverEm(E, {
            times, ranking, fixture, res, cfg, sk, H, corte: r,
            nSims, ak: cfg.defaultAlpha, seed: 77000 + s * 211 + r * 13 + H,
          });
          for (const [time, dd] of Object.entries(dist)) {
            const pReal = pos[time];
            if (!pReal) continue;
            const K = times.length;
            todos.push(
              { evento: 'lider', alcance: H - r, serie: sk, p: dd[0], o: pReal === 1 ? 1 : 0 },
              { evento: 'top4', alcance: H - r, serie: sk, p: soma(dd, 0, 4), o: pReal <= 4 ? 1 : 0 },
              { evento: 'ultimos4', alcance: H - r, serie: sk, p: soma(dd, K - 4, K), o: pReal > K - 4 ? 1 : 0 });
          }
        }
      }
      process.stderr.write(`  [${sk}] corte ${r}/${hMax}\n`);
    }
    saida.series[sk] = { hMax };
  }

  for (const ev of ['lider', 'top4', 'ultimos4']) {
    saida.porEvento[ev] = decompor(todos.filter(x => x.evento === ev));
  }
  for (const [lo, hi] of bandas) {
    const g = todos.filter(x => x.alcance >= lo && x.alcance <= hi);
    if (g.length) saida.porBanda[`${lo}-${hi}`] = decompor(g);
  }
  saida.geral = decompor(todos);
  saida.sensibilidade = sensibilidadeFaixas(todos);
  // Pares brutos, arredondados, para permitir reanalise sem repetir o Monte Carlo (a
  // varredura leva minutos). 4 casas bastam: as previsoes vem de contagens sobre milhares
  // de simulacoes.
  saida.pares = todos.map(x => ({ e: x.evento, a: x.alcance, s: x.serie, p: +x.p.toFixed(4), o: x.o }));
  return saida;
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = rodar({
    series: (arg('--series') || 'A,B,C').split(','),
    nSims: parseInt(arg('--sims') || '4000'),
    nSeeds: parseInt(arg('--seeds') || '2'),
  });
  const linha = (rot, d) => console.log(
    `${rot.padEnd(14)} n=${String(d.n).padStart(6)}  Brier=${d.brier.toFixed(4)}  ` +
    `confiab=${d.confiabilidade.toFixed(5)}  resol=${d.resolucao.toFixed(5)}  ` +
    `incert=${d.incerteza.toFixed(4)}  skill=${(d.skill * 100).toFixed(1)}%`);
  console.log('\n=== Decomposicao de Murphy (menor confiabilidade e melhor; maior resolucao e melhor) ===');
  linha('GERAL', out.geral);
  console.log('-- por evento --');
  for (const [ev, d] of Object.entries(out.porEvento)) linha(ev, d);
  console.log('-- por alcance (rodadas a frente) --');
  for (const [b, d] of Object.entries(out.porBanda)) linha(b, d);
  console.log('\n=== Diagrama de confiabilidade (geral) ===');
  console.log('faixa      |      n | previsto | observado | desvio');
  for (const f of out.geral.faixas) {
    console.log(`${f.faixa.padEnd(10)} | ${String(f.n).padStart(6)} | ${(f.previsto * 100).toFixed(1).padStart(7)}% | ` +
      `${(f.observado * 100).toFixed(1).padStart(8)}% | ${f.desvio >= 0 ? '+' : ''}${(f.desvio * 100).toFixed(1)} pp`);
  }
  console.log('\n=== Estabilidade: a confiabilidade depende do numero de faixas? ===');
  console.log('faixas | confiabilidade | resolucao | residuo da identidade');
  for (const x of out.sensibilidade) {
    console.log(`${String(x.nBins).padStart(6)} | ${x.confiabilidade.toFixed(6).padStart(14)} | ` +
      `${x.resolucao.toFixed(5).padStart(9)} | ${x.residuo.toExponential(2).padStart(21)}`);
  }
  const dst = path.join(__dirname, 'out', 'confianca.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, decompor, sensibilidadeFaixas };
