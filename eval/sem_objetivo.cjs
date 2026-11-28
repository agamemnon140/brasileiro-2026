// "TIME SEM OBJETIVO" (v4.98): nas rodadas finais, o time que ja nao tem nada em jogo rende
// menos contra quem ainda briga por algo. O app desconta isso desde a v4.98 (cfg.semObj). Este
// script mede, em 2026, o que o ajuste faz — ligado contra desligado, no MOTOR QUE ESTA NO AR.
//
// De onde vem a hipotese (escolhida em anos anteriores, fora destes dados):
//   Serie A 2006-25  : -0,23 ponto/jogo vs o esperado (razao de chances 0,68; IC95 0,58-0,79);
//                      com o criterio matematico usado aqui, -0,33 a -0,39 em ~11 jogos/temporada
//   Serie B 2012-21  : -0,19 (0,69); criterio matematico -0,18
//   5 ligas europeias: -0,14 (0,78), 4.341 jogos em 95 temporadas
//   Serie C 1a fase  : inconclusivo (n = 46) -> o app NAO ajusta a C, e ela nao entra aqui
// 2026 e a confirmacao, e sozinho NAO decide: sao poucas dezenas de jogos por serie. O m = 1,15
// do app foi fixado pelos anos anteriores, nao por esta temporada.
//
// REGRA DE OURO do eval/ mantida: o app so e LIDO. Nada aqui emenda o motor — a regra
// (semObjFlags), os cortes (semObjCortes) e o ajuste vivem no index.html; o script so liga e
// desliga cfg.semObj numa copia do DEFAULT_CFG.
//
// A regra: antes de cada rodada, um time esta DECIDIDO no corte k se ja garantiu o top-k ou ja
// nao o alcanca (so aritmetica de pontos; quem pode empatar em pontos conta como ameaca, entao
// a regra erra para o lado de NAO marcar). Sem objetivo = decidido em TODOS os cortes. O ajuste
// so vale no confronto assimetrico: lambda do sem-objetivo / m, lambda do adversario * m.
//
// CORTE INCERTO: perto do fim a linha da Libertadores ainda depende das copas. Dois tratamentos:
//   base = so os cortes do regulamento (G4, G5, Sula ate o 11o, Z4);
//   app  = o que o app usa: todo corte que ainda e plausivel hoje (semObjCortes le VAGAS_INT e
//          a final da Copa do Brasil). O time so e marcado se decidido em todos.
// Limite honesto do "app" no curto prazo: os cortes sao os de HOJE aplicados a rodadas passadas
// (a final da Sul-Americana ja decidida tira um corte que em outubro ainda existia). A diferenca
// e de um corte e erra para o lado de marcar um pouco mais.
//
//   node eval/sem_objetivo.cjs            # tudo (10k sims, 5 sementes)
//   node eval/sem_objetivo.cjs --curto    # so os jogos ja disputados — segundos
//   node eval/sem_objetivo.cjs --nsims 2000 --seeds 3
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const W = require('./lib/walkforward.cjs');
const L = require('./lib/longterm.cjs');
const M = require('./lib/metrics.cjs');

const SIMBOLOS = ['DEFAULT_CFG', 'initLeague', 'getML', 'calcL', 'updR', 'simMC', 'parseTab', 'calcClassif',
  'applyCbAuto', 'semObjFlags', 'semObjCortes', 'vagasIntCtx', 'VAGAS_INT',
  'SA_NM', 'SA_RANKING', 'SA_TAB', 'SA_DATES', 'SB_NM', 'SB_RANKING', 'SB_TAB', 'SB_DATES'];
const SERIES = ['A', 'B'];
const BASE = { A: [1, 4, 5, 11, 16], B: [1, 2, 6, 16] };
const MS = [1.09, 1.15, 1.20, 1.25];

const contexto = (E, sk) => {
  const g = n => E[`S${sk}_${n}`];
  return { sk, times: Object.keys(g('RANKING')), ranking: g('RANKING'), fixture: E.parseTab(g('TAB'), g('NM'), g('DATES')) };
};
const cfgCom = (E, on, m) => {
  const c = structuredClone(E.DEFAULT_CFG);
  c.semObj = { ...c.semObj, on, ...(m ? { m } : {}) };
  return c;
};
const rodarMC = (E, ctx, res, cfg, nSims, seed) => {
  const restaurar = L.semear(seed);
  try { return E.simMC(ctx.times, ctx.ranking, ctx.fixture, res, cfg, ctx.sk, nSims, cfg.defaultAlpha, false); }
  finally { restaurar(); }
};
const media = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const dp = a => { const m = media(a); return Math.sqrt(media(a.map(x => (x - m) ** 2)) * a.length / Math.max(1, a.length - 1)); };
const tabelaDe = (times, res) => {
  const st = {}; times.forEach(t => st[t] = { P: 0, J: 0 });
  res.forEach(g => { st[g.c].J++; st[g.f].J++; if (g.gc > g.gf) st[g.c].P += 3; else if (g.gc === g.gf) { st[g.c].P++; st[g.f].P++; } else st[g.f].P += 3; });
  return st;
};

// ---------- 0. autoteste ----------
// A suite do app (scripts/vagas_int.cjs) ja prova a regra e o m = 1 == desligado. Aqui fica o
// que este script precisa para valer: (a) o motor carregado TEM o ajuste e ele vem ligado;
// (b) desligar pela chave == nao ter a chave (o "desligado" deste relatorio e o motor de antes);
// (c) ligado difere de desligado onde ha jogo assimetrico a simular — senao mediriamos zero.
function autoteste(E, dados) {
  const so = E.DEFAULT_CFG.semObj;
  if (!so || so.on !== true || !(so.m > 1)) throw new Error('autoteste: DEFAULT_CFG.semObj ausente ou desligado — este script avalia o motor da v4.98+');
  const ctx = contexto(E, 'B');
  const res = dados.merged.B.filter(x => x.r <= 36);
  const semChave = structuredClone(E.DEFAULT_CFG); delete semChave.semObj;
  const a = JSON.stringify(rodarMC(E, ctx, res, cfgCom(E, false), 300, 777).probs);
  const b = JSON.stringify(rodarMC(E, ctx, res, semChave, 300, 777).probs);
  const c = JSON.stringify(rodarMC(E, ctx, res, cfgCom(E, true), 300, 777).probs);
  if (a !== b) throw new Error('autoteste: semObj.on = false diverge de cfg sem a chave');
  if (a === c) throw new Error('autoteste: ligado == desligado na Serie B truncada na 36a — o ajuste nao esta agindo');
  return true;
}

// ---------- 1. curto prazo: os jogos de 2026 que a regra marca ----------
function curto(E, dados, cortesDe, ultimas) {
  const out = {};
  for (const sk of SERIES) {
    const ctx = contexto(E, sk), cfg = E.DEFAULT_CFG, res = dados.merged[sk];
    const nR = ctx.fixture.reduce((a, g) => Math.max(a, g.rodada), 0);
    const lams = W.walkForward(E, ctx.times, t => ctx.ranking[t].elo, res, cfg, sk, cfg.defaultAlpha);
    const st = {}; ctx.times.forEach(t => st[t] = { P: 0, J: 0 });
    const porRod = {}; lams.forEach(g => (porRod[g.r] = porRod[g.r] || []).push(g));
    const jogos = [];
    for (const r of Object.keys(porRod).map(Number).sort((a, b) => a - b)) {
      const fl = nR - r < ultimas ? E.semObjFlags(st, cortesDe[sk], nR) : null;
      for (const g of porRod[r]) if (fl && fl[g.c] !== fl[g.f]) jogos.push({ ...g, semObj: fl[g.c] ? 'casa' : 'fora' });
      for (const g of porRod[r]) {            // a rodada so entra na tabela depois de prevista inteira
        st[g.c].J++; st[g.f].J++;
        if (g.gc > g.gf) st[g.c].P += 3; else if (g.gc === g.gf) { st[g.c].P++; st[g.f].P++; } else st[g.f].P += 3;
      }
    }
    const pred = (g, m) => {                  // mesmo grampo do motor (simMC_single)
      const k = g.semObj === 'casa' ? 1 / m : m;
      const p = W.probs(Math.max(0.2, Math.min(4.5, g.lC * k)), Math.max(0.15, Math.min(4.0, g.lF / k)));
      return { ...p, oH: g.oH, oD: g.oD, oA: g.oA };
    };
    const ptsSemObj = (g, p) => g.semObj === 'casa' ? 3 * p.pH + p.pD : 3 * p.pA + p.pD;
    const real = g => { const c = g.oH ? 3 : g.oD ? 1 : 0, f = g.oA ? 3 : g.oD ? 1 : 0; return g.semObj === 'casa' ? c : f; };
    const base = jogos.map(g => pred(g, 1));
    const linha = { n: jogos.length, cortes: cortesDe[sk], jogos: jogos.map(g => ({ r: g.r, c: g.c, f: g.f, placar: `${g.gc}x${g.gf}`, semObj: g.semObj })) };
    if (jogos.length) {
      linha.ptsReal = media(jogos.map(real));
      linha.ptsEsperado = media(jogos.map((g, i) => ptsSemObj(g, base[i])));
      linha.dif = linha.ptsReal - linha.ptsEsperado;
      linha.brierBase = media(base.map(M.brierOf));
      linha.porM = MS.map(m => {
        const a = jogos.map(g => pred(g, m));
        const b = jogos.length >= 5 ? M.bootstrapDelta(a, base) : { delta: media(a.map((p, i) => M.brierOf(p) - M.brierOf(base[i]))), ic95: null };
        return { m, ptsEsperado: media(jogos.map((g, i) => ptsSemObj(g, a[i]))), brier: media(a.map(M.brierOf)),
          dBrier: b.delta, ic95: b.ic95, dLogloss: media(a.map((p, i) => M.loglossOf(p) - M.loglossOf(base[i]))),
          melhorou: a.filter((p, i) => M.brierOf(p) < M.brierOf(base[i])).length };
      });
    }
    out[sk] = linha;
  }
  return out;
}

// ---------- 2. Monte Carlo: Serie A de hoje, ligado vs desligado ----------
function mcAgora(E, dados, nSims, nSeeds) {
  const ctx = contexto(E, 'A'), res = dados.merged.A, nT = ctx.times.length;
  const variantes = { off: cfgCom(E, false), on: cfgCom(E, true) };
  const ks = [1, 4, 5, 6, 7, 8];
  const acc = {}, vagas = {};
  for (const [nome, cfg] of Object.entries(variantes)) {
    acc[nome] = {};
    for (let s = 0; s < nSeeds; s++) {
      const r = rodarMC(E, ctx, res, cfg, nSims, 9100 + 131 * s);
      for (const p of r.probs) {
        const o = acc[nome][p.time] = acc[nome][p.time] || { z4: [] };
        const d = p.posF.map(x => x / 100), tot = d.reduce((a, b) => a + b, 0) || 1;
        for (const k of ks) (o['top' + k] = o['top' + k] || []).push(L.soma(d, 0, k) / tot);
        o.z4.push(L.soma(d, nT - 4, nT) / tot);
      }
      // vagas continentais por cenario (o painel da v4.98), media das sementes
      for (const c of (r.vagasInt && r.vagasInt.cen) || []) {
        const v = vagas[c.id] = vagas[c.id] || { rot: c.rot, peso: c.peso, on: {}, off: {}, linha: { on: [], off: [] } };
        v.linha[nome].push(c.linha);
        for (const t of c.times) (v[nome][t.time] = v[nome][t.time] || { lib: [], sul: [] }, v[nome][t.time].lib.push(t.lib), v[nome][t.time].sul.push(t.sul));
      }
    }
  }
  const linhas = ctx.times.map(t => {
    const l = { time: t };
    for (const campo of [...ks.map(k => 'top' + k), 'z4']) {
      const off = acc.off[t][campo], on = acc.on[t][campo];
      l[campo] = { off: media(off), on: media(on), d: media(on) - media(off),
        ep: Math.sqrt((dp(on) ** 2 + dp(off) ** 2) / nSeeds) };          // erro-padrao de MC da diferenca
    }
    return l;
  });
  const cenarios = Object.entries(vagas).map(([id, v]) => ({
    id, rot: v.rot, peso: v.peso,                                         // peso = chance assumida da final (VAGAS_INT.<final>.p)
    linha: { off: v.linha.off[0], on: v.linha.on[0] },                  // 1a semente: distribuicao da linha (G-n)
    times: ctx.times.map(t => ({ time: t,
      lib: { off: media(v.off[t].lib), on: media(v.on[t].lib) }, sul: { off: media(v.off[t].sul), on: media(v.on[t].sul) } }))
      .filter(x => x.lib.on > 0.05 || x.sul.on > 0.05),
  }));
  // a tabela unica do painel: media dos cenarios ponderada pelo peso
  const mistura = (t, campo, modo) => Object.values(vagas).reduce((a, v) => a + v.peso * media(v[modo][t][campo]), 0);
  const unica = ctx.times.map(t => ({ time: t,
    lib: { off: mistura(t, 'lib', 'off'), on: mistura(t, 'lib', 'on') }, sul: { off: mistura(t, 'sul', 'off'), on: mistura(t, 'sul', 'on') } }))
    .filter(x => x.lib.on > 0.05 || x.sul.on > 0.05);
  const st = tabelaDe(ctx.times, res);
  const cortes = E.semObjCortes('A', nT, 4);
  const fl = E.semObjFlags(st, cortes, 38);
  const flBase = E.semObjFlags(st, BASE.A, 38);
  const jogados = new Set(res.map(g => g.c + '|' + g.f));
  const restam = ctx.fixture.filter(g => !jogados.has(g.casa + '|' + g.fora))
    .map(g => ({ r: g.rodada, c: g.casa, f: g.fora, ajuste: fl[g.casa] !== fl[g.fora] ? (fl[g.casa] ? 'casa' : 'fora') : null }));
  return { nSims, nSeeds, cortes, marcados: ctx.times.filter(t => fl[t]), marcadosBase: ctx.times.filter(t => flBase[t]), restam, linhas, cenarios, unica };
}

// ---------- 3. Monte Carlo retroativo: Serie B de 2026 (liga encerrada) ----------
function mcRetro(E, dados, nSims, nSeeds) {
  const ctx = contexto(E, 'B'), res = dados.merged.B;
  const H = ctx.fixture.reduce((a, g) => Math.max(a, g.rodada), 0);
  const truth = E.calcClassif(ctx.times, res);
  const linhas = [];
  for (const corte of [31, 32, 33, 34, 35, 36, 37]) {
    const l = { corte };
    for (const [nome, cfg] of [['off', cfgCom(E, false)], ['on', cfgCom(E, true)]]) {
      const rs = [], bt = [], bu = [];
      for (let s = 0; s < nSeeds; s++) {
        const { dist } = L.preverEm(E, { times: ctx.times, ranking: ctx.ranking, fixture: ctx.fixture, res, cfg, sk: 'B', H, corte, nSims, ak: cfg.defaultAlpha, seed: 5200 + 97 * s + corte });
        const p = L.pontuar(dist, truth, ctx.times.length);
        rs.push(p.rps); bt.push(p.brierTop4); bu.push(p.brierUlt4);
      }
      l[nome] = { rps: media(rs), brierTop4: media(bt), brierUlt4: media(bu), epRps: dp(rs) / Math.sqrt(nSeeds) };
    }
    l.dRps = l.on.rps - l.off.rps;
    linhas.push(l);
  }
  return linhas;
}

function main() {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const nSims = arg('nsims', 10000), nSeeds = arg('seeds', 5);
  const E = loadEngine(SIMBOLOS);
  const dados = require('./lib/appdata.cjs').load();
  E.applyCbAuto(dados.resultsJson.cb || []);          // a final da Copa do Brasil entra nos cortes e nas vagas
  autoteste(E, dados);
  const so = E.DEFAULT_CFG.semObj;
  console.log(`autoteste ok: ajuste presente e ligado (m = ${so.m}, ultimas ${so.ultimas}); desligado == motor sem a chave; ligado != desligado`);
  const app = { A: E.semObjCortes('A', 20, 4), B: E.semObjCortes('B', 20, 4) };
  const ctxV = E.vagasIntCtx();
  const saida = { resultados_ate: dados.updated_at, m: so.m, ultimas: so.ultimas, cortes: { base: BASE, app },
    copas: { lib: ctxV.ev.lib.campeao || 'em aberto', sula: ctxV.ev.sula.campeao || 'em aberto', cdb: ctxV.cdb },
    curto: { base: curto(E, dados, BASE, so.ultimas), app: curto(E, dados, app, so.ultimas) } };
  for (const v of ['base', 'app']) {
    let n = 0, real = 0, esp = 0;
    for (const sk of SERIES) {
      const c = saida.curto[v][sk];
      console.log(`curto ${v} ${sk}: n=${c.n}` + (c.n ? `  pts real ${c.ptsReal.toFixed(3)} vs esperado ${c.ptsEsperado.toFixed(3)} (dif ${c.dif >= 0 ? '+' : ''}${c.dif.toFixed(3)})  ` +
        c.porM.map(x => `m=${x.m}: dBrier ${x.dBrier >= 0 ? '+' : ''}${x.dBrier.toFixed(4)}`).join(' | ') : ''));
      if (c.n) { n += c.n; real += c.ptsReal * c.n; esp += c.ptsEsperado * c.n; }
    }
    saida.curto[v].total = { n, ptsReal: n ? real / n : null, ptsEsperado: n ? esp / n : null, dif: n ? (real - esp) / n : null };
    if (n) console.log(`curto ${v} A+B: n=${n}  pts real ${(real / n).toFixed(3)} vs esperado ${(esp / n).toFixed(3)} (dif ${((real - esp) / n).toFixed(3)})`);
  }
  if (!process.argv.includes('--curto')) {
    saida.mcAgora = mcAgora(E, dados, nSims, nSeeds);
    console.log(`Serie A hoje: cortes ${saida.mcAgora.cortes.join(',')} · sem objetivo: ${saida.mcAgora.marcados.join(', ') || '—'} · jogos ajustados que restam: ${saida.mcAgora.restam.filter(g => g.ajuste).length}/${saida.mcAgora.restam.length}`);
    saida.mcRetro = { B: mcRetro(E, dados, Math.min(nSims, 5000), nSeeds) };
    console.log('Serie B retroativa (RPS on − off por corte): ' + saida.mcRetro.B.map(l => `R${l.corte} ${l.dRps >= 0 ? '+' : ''}${l.dRps.toFixed(5)}`).join(' | '));
  }
  const dest = path.join(__dirname, 'out', 'sem_objetivo.json');
  fs.writeFileSync(dest, JSON.stringify(saida, null, 1));
  console.log('gravado', path.relative(process.cwd(), dest));
  return saida;
}

if (require.main === module) main();
module.exports = { main, BASE };
