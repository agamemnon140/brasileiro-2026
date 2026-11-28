// TESTE LIMPO da configuracao candidata de setembro.
//
// eval/candidato.cjs mede a candidata (pesoCasa 0,58 nas ligas + semente da Serie A
// encolhida para k=0,40) nos mesmos jogos de que ela foi derivada, e avisa: "o teste limpo e
// dezembro, com as rodadas que nenhum ajuste viu". Este arquivo e esse teste. A fronteira e
// eval/data/holdout_ago19.json: os jogos que o app conhecia em 19/08/2026, data do
// results.json que gerou o REPORT.md de setembro. Tudo que veio depois e fora da amostra.
//
// O walk-forward roda sobre a temporada inteira (os ratings precisam do passado); so a
// PONTUACAO e separada em "dentro" e "fora". As duas configuracoes veem os mesmos jogos na
// mesma ordem, entao o bootstrap pareado vale nos dois recortes.
//
// Leitura obrigatoria do resultado: 100 a 200 jogos nao arbitram parametro. Um ganho dentro
// da amostra que vira perda fora dela nao prova que o ajuste estava errado; prova que uma
// temporada nao decide. Ver eval/REVISAO.md.
//
//   node eval/holdout.cjs        # imprime e grava eval/out/holdout.json
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const M = require('./lib/metrics.cjs');
const W = require('./lib/walkforward.cjs');
const S = require('./lib/seeds.cjs');
const { contextos } = require('./poder.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'ufOfTeam', 'simMC',
  'parseTab', 'calcClassif',
  'SA_NM', 'SA_RANKING', 'SA_TAB', 'SA_DATES', 'SB_NM', 'SB_RANKING', 'SB_TAB', 'SB_DATES',
  'SC_NM', 'SC_RANKING', 'SC_TAB', 'SC_DATES',
  'SD_TIMES', 'SD_INFO', 'CB_TEAMS', 'CB_R32', 'CB_RES_IDA', 'CB_RES_VOLTA', 'CB_ELOS'];

// Os mesmos dois numeros de eval/candidato.cjs. Duplicados de proposito: se a candidata
// mudar la, este teste continua medindo a que foi anunciada em setembro.
const PESO_LIGAS = 0.58;
const K_SERIE_A = 0.40;
const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;

function seedEncolhida(times, ranking, k) {
  const v = {};
  times.forEach(t => v[t] = ranking[t] ? ranking[t].elo : 1500);
  const vs = Object.values(v);
  const mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx === mn) return t => v[t];
  return t => CENTRO + k * ((S.ELO_MIN + (S.ELO_MAX - S.ELO_MIN) * (v[t] - mn) / (mx - mn)) - CENTRO);
}

// Vies marginal de casa e de empate, com o mesmo z aproximado do relatorio.
function vies(ps) {
  let sH = 0, oH = 0, vH = 0, sD = 0, oD = 0, vD = 0;
  for (const p of ps) {
    sH += p.pH; oH += p.oH; vH += p.pH * (1 - p.pH);
    sD += p.pD; oD += p.oD; vD += p.pD * (1 - p.pD);
  }
  const n = ps.length;
  return {
    prevCasa: sH / n, obsCasa: oH / n, zCasa: (oH - sH) / Math.sqrt(vH),
    prevEmpate: sD / n, obsEmpate: oD / n, zEmpate: (oD - sD) / Math.sqrt(vD),
  };
}

function medir(ps, ref) {
  if (!ps.length) return null;
  const v = vies(ps);
  const out = { n: ps.length, brier: M.score(ps).brier, ece: M.ece(ps), ...v };
  if (ref) {
    const b = M.bootstrapDelta(ps, ref);
    out.delta = b.delta; out.ic95 = b.ic95; out.significativo = b.significativo;
  }
  return out;
}

function rodar() {
  const E = loadEngine(SIMBOLOS);
  const cfg0 = E.DEFAULT_CFG;
  const dados = require('./lib/appdata.cjs').load();
  const fronteira = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'holdout_ago19.json'), 'utf8'));
  const comPeso = () => { const c = structuredClone(cfg0); for (const sk of ['A', 'B', 'C', 'D']) c.lambdas[sk].pesoCasa = PESO_LIGAS; return c; };

  const series = {};
  const acum = { vigente: [], candidata: [], base: [] };
  for (const ctx of contextos(E, dados)) {
    if (!fronteira[ctx.sk]) continue;       // D e Copa: nenhum jogo de liga novo depois de 19/08
    const antigos = new Set(fronteira[ctx.sk]);
    const geVig = t => (ctx.ranking[t] ? ctx.ranking[t].elo : 1500);
    const geK = ctx.sk === 'A' ? seedEncolhida(ctx.times, ctx.ranking, K_SERIE_A) : geVig;
    const variantes = {
      vigente: [cfg0, geVig],
      candidata: [comPeso(), geK],
      so_pesoCasa: [comPeso(), geVig],
      so_amplitude: [cfg0, geK],
    };
    const lams = W.walkForward(E, ctx.times, geVig, ctx.res, cfg0, ctx.sk, cfg0.defaultAlpha, false);
    const fora = lams.map(g => !antigos.has(g.c + '|' + g.f));
    const corta = (ps, f) => ps.filter((_, i) => fora[i] === f);
    const pVig = W.aPreds(lams, 0);
    const base = M.baselineWalkForward(pVig);
    const rods = lams.filter((_, i) => fora[i]).map(g => g.r);

    const linha = {
      jogos: pVig.length, dentro: corta(pVig, false).length, fora: corta(pVig, true).length,
      rodadasFora: rods.length ? [Math.min(...rods), Math.max(...rods)] : null,
      taxaBase: { dentro: M.score(corta(base, false)).brier, fora: rods.length ? M.score(corta(base, true)).brier : null },
      variantes: {},
    };
    for (const [nome, [cfg, ge]] of Object.entries(variantes)) {
      const ps = nome === 'vigente' ? pVig
        : W.aPreds(W.walkForward(E, ctx.times, ge, ctx.res, cfg, ctx.sk, cfg.defaultAlpha, false), 0);
      const ehRef = nome === 'vigente';
      linha.variantes[nome] = {
        dentro: medir(corta(ps, false), ehRef ? null : corta(pVig, false)),
        fora: medir(corta(ps, true), ehRef ? null : corta(pVig, true)),
      };
      if (nome === 'vigente') { acum.vigente.push(...corta(ps, true)); acum.base.push(...corta(base, true)); }
      if (nome === 'candidata') acum.candidata.push(...corta(ps, true));
    }
    series[ctx.sk] = linha;
  }

  const agregado = acum.vigente.length ? {
    n: acum.vigente.length,
    taxaBase: M.score(acum.base).brier,
    vigente: M.score(acum.vigente).brier,
    candidata: M.score(acum.candidata).brier,
    candidataMenosVigente: M.bootstrapDelta(acum.candidata, acum.vigente),
    vigenteMenosTaxaBase: M.bootstrapDelta(acum.vigente, acum.base),
  } : null;

  return {
    results_json: dados.updated_at,
    fronteira: fronteira.origem,
    candidata: { pesoCasaLigas: PESO_LIGAS, amplitudeSerieA: K_SERIE_A },
    series, agregado,
  };
}

if (require.main === module) {
  const out = rodar();
  const f = x => x.toFixed(4);
  const s = x => (x >= 0 ? '+' : '') + x.toFixed(4);
  const pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' pp';
  console.log(`results.json de ${out.results_json}; fronteira em ${out.fronteira.updated_at}`);
  for (const [sk, l] of Object.entries(out.series)) {
    console.log(`\n== Serie ${sk}: ${l.jogos} jogos | dentro ${l.dentro} | FORA ${l.fora}` +
      (l.rodadasFora ? ` (rodadas ${l.rodadasFora[0]}-${l.rodadasFora[1]})` : ''));
    if (!l.fora) { console.log('   sem jogos fora da amostra'); continue; }
    console.log(`   taxa-base: dentro ${f(l.taxaBase.dentro)} | fora ${f(l.taxaBase.fora)}`);
    const v = l.variantes.vigente;
    console.log(`   mandante venceu: dentro ${(v.dentro.obsCasa * 100).toFixed(1)}% | fora ${(v.fora.obsCasa * 100).toFixed(1)}%`);
    for (const [nome, r] of Object.entries(l.variantes)) {
      const d = r.fora.delta === undefined ? '' :
        ` | delta fora ${s(r.fora.delta)} [${f(r.fora.ic95[0])}, ${f(r.fora.ic95[1])}]${r.fora.significativo ? ' SIG' : ''}` +
        ` (dentro ${s(r.dentro.delta)})`;
      console.log(`   ${nome.padEnd(13)} Brier dentro ${f(r.dentro.brier)} fora ${f(r.fora.brier)}` +
        ` | vies de casa dentro ${pp(r.dentro.obsCasa - r.dentro.prevCasa)} fora ${pp(r.fora.obsCasa - r.fora.prevCasa)} (z ${r.fora.zCasa.toFixed(2)})${d}`);
    }
  }
  const a = out.agregado;
  if (a) {
    console.log(`\n== FORA DA AMOSTRA, agregado (n=${a.n}): taxa-base ${f(a.taxaBase)} | vigente ${f(a.vigente)} | candidata ${f(a.candidata)}`);
    console.log(`   candidata - vigente: ${s(a.candidataMenosVigente.delta)} [${f(a.candidataMenosVigente.ic95[0])}, ${f(a.candidataMenosVigente.ic95[1])}]${a.candidataMenosVigente.significativo ? ' SIG' : ''}`);
    console.log(`   vigente - taxa-base: ${s(a.vigenteMenosTaxaBase.delta)} [${f(a.vigenteMenosTaxaBase.ic95[0])}, ${f(a.vigenteMenosTaxaBase.ic95[1])}]${a.vigenteMenosTaxaBase.significativo ? ' SIG' : ''}`);
  }
  const destino = path.join(__dirname, 'out', 'holdout.json');
  fs.writeFileSync(destino, JSON.stringify(out, null, 2) + '\n');
  console.log('\n-> eval/out/holdout.json');
}

module.exports = { rodar };
