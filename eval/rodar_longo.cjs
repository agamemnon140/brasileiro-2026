// Runner do estágio de LONGO PRAZO. Ver eval/lib/longterm.cjs para o desenho (horizonte
// por filtro de rodada, eventos derivados de posF).
//
// Cada ponto é a média de `nSeeds` sementes de MC, porque o RPS de uma execução carrega
// ruído de amostragem. O piso de ruído medido (corte 9, série A, H 22) é desvio 0,00059 a
// 3k sims e 0,00017 a 10k — registrado aqui para que qualquer diferença relatada possa ser
// comparada com ele em vez de aceita no olho.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');
const S = require('./lib/seeds.cjs');
const J = require('./lib/rncjoin.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'simMC', 'parseTab', 'calcClassif', 'RNC_2026', 'ufOfTeam',
  'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING',
  'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING'];

function contexto(E, sk) {
  const g = n => E[`S${sk}_${n}`];
  const times = Object.keys(g('RANKING'));
  return { sk, times, ranking: g('RANKING'), fixture: E.parseTab(g('TAB'), g('NM'), g('DATES')) };
}

function rodar({ series = ['A', 'B', 'C'], nSims = 5000, nSeeds = 5, horizonte = null } = {}) {
  const E = loadEngine(SIMBOLOS);
  const cfg = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const resolver = J.construir(E.RNC_2026, E.ufOfTeam);
  const saida = { gerado_em: null, nSims, nSeeds, series: {} };

  for (const sk of series) {
    const ctx = contexto(E, sk);
    const res = dados.merged[sk];
    // H = última rodada com pelo menos metade dos jogos disputados. Em dezembro isso será
    // 38 sozinho; --horizonte força o valor (é assim que a corrida final é ensaiada).
    const porRod = {};
    res.forEach(x => porRod[x.r] = (porRod[x.r] || 0) + 1);
    const jogosPorRodada = ctx.fixture.filter(g => g.rodada === 1).length;
    const H = horizonte || Math.max(...Object.keys(porRod).map(Number).filter(r => porRod[r] >= jogosPorRodada / 2));
    // Completude tem de significar "os jogos ate H foram DISPUTADOS", nao "H e o tamanho da
    // fixture". A primeira versao comparava H com a ultima rodada da tabela, entao
    // --horizonte 38 anunciava TEMPORADA COMPLETA com a serie na rodada 23 e pontuava contra
    // uma classificacao final imaginaria. O caminho de dezembro precisa falhar alto aqui.
    // "Completa" exige DUAS coisas, e as duas ja falharam separadamente aqui:
    //   (a) H e a ultima rodada do campeonato — senao "completa" so diria que H existe;
    //   (b) todos os jogos ate H foram disputados.
    // Checar so (a) fazia --horizonte 38 anunciar temporada completa com a serie na rodada
    // 23. Checar so (b) e pior ainda, porque H e ESCOLHIDO como a ultima rodada disputada:
    // a condicao vira tautologia e a Serie B saiu rotulada como completa na rodada 22 de 38.
    const maxRodada = ctx.fixture.reduce((m, g) => Math.max(m, g.rodada), 0);
    const esperadosAteH = ctx.fixture.filter(g => g.rodada <= H).length;
    const disputadosAteH = res.filter(x => x.r <= H).length;
    const completa = H === maxRodada && disputadosAteH >= esperadosAteH;
    if (horizonte && !completa) {
      throw new Error(
        `--horizonte ${horizonte} pedido para a serie ${sk}, mas a temporada nao acabou: ` +
        `${disputadosAteH} de ${esperadosAteH} jogos ate a rodada ${H}, e o campeonato vai ` +
        `ate a rodada ${maxRodada}. Rode sem --horizonte para usar o horizonte encurtado, ` +
        `ou espere o fim do campeonato.`);
    }
    const truth = E.calcClassif(ctx.times, res.filter(x => x.r <= H));

    const seeds = S.construir(ctx.times, ctx.ranking, resolver);
    const rkDe = ge => { const o = {}; ctx.times.forEach(t => o[t] = { elo: ge(t) }); return o; };
    const variantes = ['atual', 'iguais', 'rnc_pontos', 'rnc_log', 'rnc_posicao', 'rnc_recencia'];

    const cortes = [];
    for (let r = 3; r < H; r += 3) cortes.push(r);

    const tabela = {};
    for (const v of variantes) {
      const rk = rkDe(seeds[v]);
      const pontos = cortes.map(corte => {
        let acc = 0, accL = 0, accT = 0, accU = 0;
        for (let s = 0; s < nSeeds; s++) {
          const { dist } = L.preverEm({ ...E, simMC: E.simMC }, {
            times: ctx.times, ranking: rk, fixture: ctx.fixture, res, cfg,
            sk, H, corte, nSims, ak: cfg.defaultAlpha, seed: 4000 + s * 97 + corte,
          });
          const sc = L.pontuar(dist, truth, ctx.times.length);
          acc += sc.rps; accL += sc.brierLider; accT += sc.brierTop4; accU += sc.brierUlt4;
        }
        return { corte, rps: acc / nSeeds, brierLider: accL / nSeeds, brierTop4: accT / nSeeds, brierUlt4: accU / nSeeds };
      });
      // {pontos, media} e nao um array com .media anexada: JSON.stringify DESCARTA
      // propriedades nao-indexadas de arrays, entao a media sumia silenciosamente na
      // serializacao e so reaparecia como crash no gerador do relatorio.
      const m = k => pontos.reduce((x, y) => x + y[k], 0) / pontos.length;
      tabela[v] = {
        pontos,
        media: { rps: m('rps'), brierLider: m('brierLider'), brierTop4: m('brierTop4'), brierUlt4: m('brierUlt4') },
      };
      process.stderr.write(`  [${sk}] ${v.padEnd(13)} RPS medio ${tabela[v].media.rps.toFixed(5)}\n`);
    }

    // Referência inferior: ignora tudo que foi jogado (só o prior). Se o modelo não bater
    // isso com folga, os resultados reais não estão sendo aproveitados.
    let semJogos = 0;
    for (let s = 0; s < nSeeds; s++) {
      const { dist } = L.preverEm(E, { times: ctx.times, ranking: rkDe(seeds.atual), fixture: ctx.fixture, res, cfg, sk, H, corte: 0, nSims, ak: cfg.defaultAlpha, seed: 8000 + s });
      semJogos += L.pontuar(dist, truth, ctx.times.length).rps;
    }
    semJogos /= nSeeds;

    saida.series[sk] = {
      H, maxRodada, cortes, jogosAteH: disputadosAteH, esperadosAteH, jogosPorRodada, completa,
      tabelaReal: truth.map(c => ({ pos: c.pos, time: c.time, P: c.P })),
      variantes: tabela,
      semJogos,
    };
    process.stderr.write(`  [${sk}] H=${H} (${saida.series[sk].completa ? 'TEMPORADA COMPLETA' : 'horizonte encurtado'}) | semJogos ${semJogos.toFixed(5)}\n`);
  }
  return saida;
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = rodar({
    series: (arg('--series') || 'A,B,C').split(','),
    nSims: parseInt(arg('--sims') || '5000'),
    nSeeds: parseInt(arg('--seeds') || '5'),
    horizonte: arg('--horizonte') ? parseInt(arg('--horizonte')) : null,
  });
  const dst = path.join(__dirname, 'out', 'longo.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out, null, 1));
  console.log('-> ' + dst);
}

module.exports = { rodar };
