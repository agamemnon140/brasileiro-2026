// PREVISOES DE ZONA DE 2026, RODADA A RODADA: precisao e calibracao.
//
// Pergunta: ao longo do ano, o que o app dizia sobre quem terminaria em cada zona se
// confirmou? Um evento anunciado com 50% aconteceu em metade das vezes?
//
// Para cada serie e cada rodada r (0 = pre-temporada, ate a penultima), o motor de hoje roda
// o Monte Carlo sabendo so os resultados ate r, com a config e a semente do app, e a
// probabilidade de cada clube terminar em cada zona e comparada com a tabela final da fase
// de liga. eval/paridade.cjs mostra que, para as tabelas de A, B e C, esse replay equivale
// ao que o app publicou desde 05/06.
//
// ZONAS (as do app, lidas de S*_META): A titulo, G4, G6, Z4 | B 1o, acesso direto (top-2),
// G6, Z4 | C 1o, G8, Z2 | D 1o do grupo e top-4 do grupo (16 grupos de 6).
//
// SERIE A: a temporada nao acabou. O desfecho usado e a tabela na ultima rodada completa,
// e o Monte Carlo trata essa rodada como o fim (horizonte encurtado, como em
// eval/lib/longterm.cjs). E uma previa; o numero definitivo sai em dezembro.
// SERIE B: os sete placares da rodada 38 que faltam no results.json de 13/11 vem de
// eval/data/serie_b_r38_imprensa.json, e so enquanto o arquivo oficial nao os trouxer.
// SERIE D: o motor proprio da D (simMC_D) le SD_RES embutido. O replay por rodada corta
// esse array no lugar durante a chamada e o restaura em seguida.
//
// CALIBRACAO: as previsoes de um clube ao longo das rodadas apontam para o mesmo desfecho,
// entao nao sao independentes. O intervalo de cada faixa sai de um bootstrap que reamostra
// CLUBES inteiros, nao previsoes. Quando tudo na faixa aconteceu (ou nada aconteceu) o
// bootstrap degenera, porque toda reamostra da o mesmo 100% ou 0%; ai o intervalo e o
// binomial exato com um ensaio por clube da faixa: com 10 clubes e 10 acertos, o limite
// inferior e 69%, e nao 100%.
//
//   node eval/zonas2026.cjs          # 4000 simulacoes por rodada, ~4 min
//   node eval/zonas2026.cjs 10000
//   node eval/zonas2026.cjs --drift 0 --nome drift0     # variante de config; grava zonas2026_drift0.json
//   node eval/zonas2026.cjs --preset base --nome base
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../scripts/engine.cjs');
const L = require('./lib/longterm.cjs');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const NSIMS = parseInt(process.argv.slice(2).find((a, i, v) => /^\d+$/.test(a) && !/^--/.test(v[i - 1] || ''))) || 4000;
const FAIXAS = [0, 0.005, 0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9, 0.995, 1.0001];
const ROTULO = ['0%', '0,5–10%', '10–20%', '20–30%', '30–40%', '40–60%', '60–70%', '70–80%', '80–90%', '90–99,5%', '100%'];

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Uma "unidade" e uma tabela de pontos corridos: a serie inteira em A/B/C, um grupo na D.
// Devolve registros {serie, unidade, evento, k, n, time, corte, H, p, o, cong}.
function ligaABC(E, sk, dados, extraRes, cfg, ak) {
  const g = n => E[`S${sk}_${n}`];
  const times = Object.keys(g('RANKING')), fixture = E.parseTab(g('TAB'), g('NM'), g('DATES'));
  const res = [...dados.merged[sk]];
  let sobrepostos = 0;
  for (const j of extraRes || []) if (!res.some(x => x.c === j.c && x.f === j.f)) { res.push({ c: j.c, f: j.f, gc: j.gc, gf: j.gf, r: j.r }); sobrepostos++; }
  const maxR = fixture.reduce((m, x) => Math.max(m, x.rodada), 0);
  const porRod = {}; res.forEach(x => porRod[x.r] = (porRod[x.r] || 0) + 1);
  const cheia = fixture.filter(x => x.rodada === 1).length;
  // H = ultima rodada com todos os jogos disputados, tolerando um adiado.
  const H = Math.max(...Object.keys(porRod).map(Number).filter(r => porRod[r] >= cheia - 1));
  const completa = H === maxR && res.filter(x => x.r <= H).length === fixture.length;
  const z = g('META').zonas, N = times.length;
  const eventos = sk === 'A' ? [['título', 1, 1], ['G4', 1, z.g4], ['G6', 1, z.g6], ['Z4', z.z4, N]]
    : sk === 'B' ? [['1º', 1, 1], ['acesso direto (top-2)', 1, z.g4], ['G6', 1, z.g6], ['Z4', z.z4, N]]
      : [['1º', 1, 1], ['G8', 1, z.g4], ['Z2', z.z4, N]];
  const real = {}; E.calcClassif(times, res.filter(x => x.r <= H)).forEach(c => real[c.time] = c.pos);
  const recs = [];
  for (let corte = 0; corte < H; corte++) {
    const { dist } = L.preverEm(E, { times, ranking: g('RANKING'), fixture, res, cfg, sk, H, corte, nSims: NSIMS, ak, seed: 26000 + sk.charCodeAt(0) * 100 + corte });
    const cong = {}; if (corte > 0) E.calcClassif(times, res.filter(x => x.r <= corte)).forEach(c => cong[c.time] = c.pos);
    for (const [evento, de, ate] of eventos) for (const t of times) {
      recs.push({ serie: sk, unidade: sk, evento, k: ate - de + 1, n: N, time: t, corte, H, p: L.soma(dist[t], de - 1, ate),
        o: real[t] >= de && real[t] <= ate ? 1 : 0, cong: corte > 0 ? (cong[t] >= de && cong[t] <= ate ? 1 : 0) : null });
    }
    process.stderr.write(`\r  Serie ${sk}: rodada ${corte + 1}/${H}   `);
  }
  process.stderr.write('\n');
  return { recs, info: { jogos: res.filter(x => x.r <= H).length, H, maxR, completa, sobrepostos, clubes: N } };
}

function ligaD(E, cfg, ak) {
  const todos = E.SD_RES.slice();
  const H = todos.reduce((m, x) => Math.max(m, x.r), 0);
  const rodar = (corte, seed) => {
    const restaurar = L.semear(seed);
    try {
      E.SD_RES.length = 0; todos.filter(x => x.r <= corte).forEach(x => E.SD_RES.push(x));
      const r = E.simMC_D(cfg, corte >= H ? 20 : NSIMS, ak, false, [], { koMask: new Set() });
      const out = {}; r.probs.forEach(p => out[p.time] = p.posGr.map(x => x / 100)); return out;
    } finally { E.SD_RES.length = 0; todos.forEach(x => E.SD_RES.push(x)); restaurar(); }
  };
  const fim = rodar(H, 1), real = {};
  for (const t of E.SD_TIMES) { const i = fim[t].findIndex(x => x > 0.999); if (i < 0) throw new Error('Serie D: posicao final indefinida para ' + t); real[t] = i + 1; }
  // tabela do momento, com o mesmo criterio do motor (P, V, SG, GP)
  const congelada = corte => {
    const st = {}; E.SD_TIMES.forEach(t => st[t] = { P: 0, V: 0, SG: 0, GP: 0 });
    todos.filter(x => x.r <= corte).forEach(x => { const a = st[x.c], b = st[x.f]; a.GP += x.gc; b.GP += x.gf; a.SG += x.gc - x.gf; b.SG += x.gf - x.gc; if (x.gc > x.gf) { a.P += 3; a.V++; } else if (x.gc < x.gf) { b.P += 3; b.V++; } else { a.P++; b.P++; } });
    const pos = {}; E.SD_GRUPOS.forEach(g => [...g].sort((a, b) => st[b].P - st[a].P || st[b].V - st[a].V || st[b].SG - st[a].SG || st[b].GP - st[a].GP).forEach((t, i) => pos[t] = i + 1));
    return pos;
  };
  const eventos = [['1º do grupo', 1, 1], ['top-4 do grupo', 1, 4]], recs = [];
  for (let corte = 0; corte < H; corte++) {
    const d = rodar(corte, 26400 + corte), cong = corte > 0 ? congelada(corte) : null;
    E.SD_GRUPOS.forEach((g, gi) => { for (const [evento, de, ate] of eventos) for (const t of g) {
      recs.push({ serie: 'D', unidade: 'D' + (gi + 1), evento, k: ate - de + 1, n: g.length, time: t, corte, H, p: L.soma(d[t], de - 1, ate),
        o: real[t] >= de && real[t] <= ate ? 1 : 0, cong: cong ? (cong[t] >= de && cong[t] <= ate ? 1 : 0) : null });
    } });
    process.stderr.write(`\r  Serie D: rodada ${corte + 1}/${H}   `);
  }
  process.stderr.write('\n');
  return { recs, info: { jogos: todos.length, H, maxR: H, completa: true, sobrepostos: 0, clubes: E.SD_TIMES.length } };
}

const media = (xs, f) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : null);

// CONJUNTOS DE RODADAS. As mesmas medidas, separadas pelo momento em que a previsao foi
// feita: metades (m1, m2) e quartos (q1..q4) da fase de liga. O corte c e a previsao feita
// antes da rodada c+1, entao o 1o quarto de 38 rodadas sao as previsoes feitas antes das
// rodadas 1 a 10. Nas fases finais (matamata2026.cjs) existe tambem "finais": tudo o que
// foi previsto depois de encerrada a fase de liga.
const BLOCOS = ['m1', 'm2', 'q1', 'q2', 'q3', 'q4', 'finais'];
function noBloco(r, id) {
  const H = r.Hliga || r.H;
  if (r.corte >= H) return id === 'finais';
  if (id === 'm1') return r.corte < H / 2;
  if (id === 'm2') return r.corte >= H / 2;
  if (id[0] === 'q') return Math.min(3, Math.floor(4 * r.corte / H)) === Number(id[1]) - 1;
  return false;
}
function rodadasDoBloco(id, H) {
  if (id === 'm1') return [1, Math.ceil(H / 2)];
  if (id === 'm2') return [Math.ceil(H / 2) + 1, H];
  const q = Number(id[1]) - 1;
  return [Math.ceil(q * H / 4) + 1, Math.ceil((q + 1) * H / 4)];
}

// Acerto dos k mais prováveis: em cada unidade e rodada, os k clubes com maior probabilidade
// do evento; fração deles que terminou na zona. A "tabela do momento" aponta quem ocupa a zona.
function acertos(recs) {
  const grupos = {};
  for (const r of recs) (grupos[`${r.unidade}|${r.evento}|${r.corte}`] = grupos[`${r.unidade}|${r.evento}|${r.corte}`] || []).push(r);
  const linhas = [];
  for (const g of Object.values(grupos)) {
    const k = g[0].k, top = [...g].sort((a, b) => b.p - a.p).slice(0, k);
    const l = { evento: g[0].evento, corte: g[0].corte, H: g[0].H, modelo: top.reduce((a, x) => a + x.o, 0) / k, tabela: null };
    if (g[0].cong !== null) { const oc = g.filter(x => x.cong === 1); l.tabela = oc.length ? oc.reduce((a, x) => a + x.o, 0) / oc.length : null; }
    linhas.push(l);
  }
  return linhas;
}

function calibrar(recs, B = 2000) {
  const faixaDe = p => { for (let i = 0; i < FAIXAS.length - 1; i++) if (p >= FAIXAS[i] && p < FAIXAS[i + 1]) return i; return FAIXAS.length - 2; };
  const porClube = {};
  recs.forEach(r => (porClube[r.serie + '|' + r.time] = porClube[r.serie + '|' + r.time] || []).push(r));
  const clubes = Object.keys(porClube);
  // somas por clube e faixa, para o bootstrap nao revisitar os registros
  const S = clubes.map(c => { const s = ROTULO.map(() => [0, 0, 0]); porClube[c].forEach(r => { const i = faixaDe(r.p); s[i][0]++; s[i][1] += r.p; s[i][2] += r.o; }); return s; });
  const tot = ROTULO.map((_, i) => S.reduce((a, s) => [a[0] + s[i][0], a[1] + s[i][1], a[2] + s[i][2]], [0, 0, 0]));
  const casos = ROTULO.map((_, i) => { const set = new Set(); recs.forEach(r => { if (faixaDe(r.p) === i) set.add(r.serie + '|' + r.time + '|' + r.evento); }); return set.size; });
  const clubesNaFaixa = ROTULO.map((_, i) => S.filter(s => s[i][0] > 0).length);
  const rnd = prng(20261115), difs = ROTULO.map(() => []);
  for (let b = 0; b < B; b++) {
    const a = ROTULO.map(() => [0, 0, 0]);
    for (let j = 0; j < clubes.length; j++) { const s = S[Math.floor(rnd() * clubes.length)]; for (let i = 0; i < a.length; i++) { a[i][0] += s[i][0]; a[i][1] += s[i][1]; a[i][2] += s[i][2]; } }
    a.forEach((x, i) => { if (x[0]) difs[i].push((x[2] - x[1]) / x[0]); });
  }
  const n = recs.length; let ece = 0;
  const faixas = ROTULO.map((rot, i) => {
    const [q, sp, so] = tot[i]; if (!q) return { faixa: rot, n: 0 };
    ece += q / n * Math.abs(so / q - sp / q);
    const d = difs[i].sort((x, y) => x - y);
    let lo = d[Math.floor(d.length * 0.025)], hi = d[Math.floor(d.length * 0.975)], metodo = 'bootstrap por clube';
    if (so === 0 || so === q) {
      const lim = Math.pow(0.025, 1 / clubesNaFaixa[i]);
      [lo, hi] = so === q ? [lim - sp / q, 1 - sp / q] : [0 - sp / q, 1 - lim - sp / q];
      metodo = 'binomial exato por clube';
    }
    return { faixa: rot, n: q, casos: casos[i], clubes: clubesNaFaixa[i], previsto: sp / q, observado: so / q, diferenca: so / q - sp / q, ic95: [lo, hi], metodo, compativel: (lo <= 0 && hi >= 0) || Math.abs(so / q - sp / q) < 0.01 };
  });
  return { n, clubes: clubes.length, ece, faixas };
}

function eventosDe(recs, marcos) {
  const eventos = [...new Set(recs.map(r => r.evento))], ac = acertos(recs);
  return eventos.map(ev => {
    const rs = recs.filter(r => r.evento === ev), r1 = rs.filter(r => r.cong !== null), a = ac.filter(x => x.evento === ev);
    const brier = media(rs, r => (r.p - r.o) ** 2), base = media(rs, r => (r.k / r.n - r.o) ** 2);
    const e = {
      evento: ev, vagas: rs[0].k, previsoes: rs.length, brier, brierTaxaBase: base, habilidade: 1 - brier / base, calibracao: calibrar(rs, 1000),
      brierDesdeR1: media(r1, r => (r.p - r.o) ** 2), brierTabelaDoMomento: media(r1, r => (r.cong - r.o) ** 2),
      acertoMedio: media(a, x => x.modelo), acertoTabelaDoMomento: media(a.filter(x => x.tabela !== null), x => x.tabela),
      acertoModeloDesdeR1: media(a.filter(x => x.tabela !== null), x => x.modelo),
    };
    if (marcos) e.acertoPorMarco = marcos.map(m => ({ rodada: m, modelo: media(a.filter(x => x.corte === m), x => x.modelo), tabela: m > 0 ? media(a.filter(x => x.corte === m && x.tabela !== null), x => x.tabela) : null }));
    return e;
  });
}

function blocosDe(recs, H) {
  const o = {};
  for (const id of BLOCOS) {
    const rs = recs.filter(r => noBloco(r, id));
    if (!rs.length) continue;
    o[id] = { rodadas: id === 'finais' ? null : rodadasDoBloco(id, H), previsoes: rs.length, brier: media(rs, r => (r.p - r.o) ** 2), calibracao: calibrar(rs, 1000), porEvento: eventosDe(rs, null) };
  }
  return o;
}

function resumir(recs, info) {
  const H = info.H;
  const porEvento = eventosDe(recs, [0, Math.round(H * 0.25), Math.round(H * 0.5), Math.round(H * 0.75)]);
  // Maiores surpresas: por clube e evento, a previsao mais distante do desfecho e a rodada dela.
  const pior = {};
  for (const r of recs) { const k = r.time + '|' + r.evento, e = Math.abs(r.p - r.o); if (!pior[k] || e > pior[k].erro) pior[k] = { time: r.time, evento: r.evento, rodada: r.corte, previsto: r.p, aconteceu: r.o === 1, erro: e }; }
  const surpresas = Object.values(pior).sort((a, b) => b.erro - a.erro).slice(0, 6);
  return { ...info, brier: media(recs, r => (r.p - r.o) ** 2), porEvento, calibracao: calibrar(recs), surpresas, blocos: blocosDe(recs, H) };
}

function coletar({ drift = null, preset = null } = {}) {
  const E = loadEngine(['DEFAULT_CFG', 'simMC', 'simMC_D', 'parseTab', 'calcClassif',
    'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING', 'SA_META', 'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING', 'SB_META',
    'SC_TAB', 'SC_NM', 'SC_DATES', 'SC_RANKING', 'SC_META', 'SD_RES', 'SD_TIMES', 'SD_INFO', 'SD_GRUPOS']);
  const cfg = structuredClone(E.DEFAULT_CFG); if (drift !== null) cfg.drift = drift;
  const ak = preset || cfg.defaultAlpha;
  const dados = require('./lib/appdata.cjs').load();
  const r38 = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'serie_b_r38_imprensa.json'), 'utf8'));
  const porSerie = {};
  for (const sk of ['A', 'B', 'C', 'D']) porSerie[sk] = sk === 'D' ? ligaD(E, cfg, ak) : ligaABC(E, sk, dados, sk === 'B' ? r38.jogos.map(j => ({ ...j, r: r38.rodada })) : null, cfg, ak);
  return { porSerie, results_json: dados.updated_at, drift: cfg.drift, preset: ak };
}

// Trajetoria de cada clube em cada zona: a probabilidade rodada a rodada e o desfecho.
function trajetorias(recs) {
  const t = {};
  for (const r of recs) { const k = r.time + '|' + r.evento; (t[k] = t[k] || { time: r.time, evento: r.evento, o: r.o, p: [] }).p[r.corte] = +r.p.toFixed(4); }
  return Object.values(t);
}

function rodar(opts) {
  const c = coletar(opts);
  const out = { results_json: c.results_json, nSims: NSIMS, drift: c.drift, preset: c.preset, series: {}, geral: null };
  const traj = {};
  let todos = [];
  for (const sk of ['A', 'B', 'C', 'D']) {
    const { recs, info } = c.porSerie[sk];
    out.series[sk] = resumir(recs, info);
    traj[sk] = trajetorias(recs);
    todos = todos.concat(recs);
  }
  out.geral = { brier: media(todos, r => (r.p - r.o) ** 2), calibracao: calibrar(todos), calibracaoSemA: calibrar(todos.filter(r => r.serie !== 'A')) };
  // meio da temporada em diante x primeira metade
  out.geral.primeiraMetade = calibrar(todos.filter(r => r.corte < r.H / 2));
  out.geral.segundaMetade = calibrar(todos.filter(r => r.corte >= r.H / 2));
  out.geral.blocos = {};
  for (const id of BLOCOS) { const rs = todos.filter(r => noBloco(r, id)); if (rs.length) out.geral.blocos[id] = { previsoes: rs.length, brier: media(rs, r => (r.p - r.o) ** 2), calibracao: calibrar(rs, 1000) }; }
  return { out, traj };
}

module.exports = { rodar, coletar, calibrar, trajetorias, FAIXAS, ROTULO, BLOCOS, noBloco, rodadasDoBloco };

if (require.main === module) {
  const nome = arg('nome');
  const { out, traj } = rodar({ drift: arg('drift') === null ? null : Number(arg('drift')), preset: arg('preset') });
  if (nome) console.log(`VARIANTE ${nome}: drift ${out.drift}, preset ${out.preset} | Brier geral ${out.geral.brier.toFixed(4)}`);
  const pc = x => (x * 100).toFixed(0) + '%', pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
  const tabela = (titulo, c) => {
    console.log(`\n${titulo}: ${c.n} previsões de ${c.clubes} clubes | erro médio de calibração ${(c.ece * 100).toFixed(1)} pp`);
    console.log('  faixa      | previsões | casos | previsto | aconteceu | diferença (IC95, pp)');
    for (const f of c.faixas) if (f.n) console.log(`  ${f.faixa.padEnd(10)} | ${String(f.n).padStart(9)} | ${String(f.casos).padStart(5)} | ${pc(f.previsto).padStart(8)} | ${pc(f.observado).padStart(9)} | ${pp(f.diferenca)} [${pp(f.ic95[0])}; ${pp(f.ic95[1])}]${f.compativel ? '' : '  <- fora'}`);
  };
  for (const [sk, s] of Object.entries(out.series)) {
    console.log(`\n===== Série ${sk}: ${s.clubes} clubes, ${s.jogos} jogos, desfecho na rodada ${s.H} de ${s.maxR}${s.completa ? '' : ' (PRÉVIA: temporada em andamento)'}${s.sobrepostos ? ` | ${s.sobrepostos} placares da imprensa` : ''}`);
    console.log('  evento | Brier modelo · taxa-base (habilidade) | desde a rodada 1: modelo · tabela do momento | acerto dos mais prováveis: média, e nas rodadas ' + s.porEvento[0].acertoPorMarco.map(m => m.rodada).join('/') + ' [tabela do momento]');
    for (const e of s.porEvento) console.log(`  ${e.evento.padEnd(22)} | ${e.brier.toFixed(3)} · ${e.brierTaxaBase.toFixed(3)} (${pc(e.habilidade)}) | ${e.brierDesdeR1.toFixed(3)} · ${e.brierTabelaDoMomento.toFixed(3)} | ${pc(e.acertoMedio)} [${pc(e.acertoTabelaDoMomento)}; modelo nas mesmas rodadas ${pc(e.acertoModeloDesdeR1)}] | ${e.acertoPorMarco.map(m => pc(m.modelo) + (m.tabela === null ? '' : ' [' + pc(m.tabela) + ']')).join(' / ')}`);
    console.log('  maiores surpresas: ' + s.surpresas.map(x => `${x.time}, ${x.evento}: ${pc(x.previsto)} na rodada ${x.rodada}, ${x.aconteceu ? 'aconteceu' : 'não aconteceu'}`).join(' | '));
    tabela(`Calibração, Série ${sk}`, s.calibracao);
  }
  tabela('Calibração, quatro séries', out.geral.calibracao);
  tabela('Calibração, B + C + D (temporadas encerradas)', out.geral.calibracaoSemA);
  tabela('Calibração, primeira metade de cada campeonato', out.geral.primeiraMetade);
  tabela('Calibração, segunda metade', out.geral.segundaMetade);
  const arq = nome ? `zonas2026_${nome}.json` : 'zonas2026.json';
  fs.writeFileSync(path.join(__dirname, 'out', arq), JSON.stringify(out, null, 2) + '\n');
  if (!nome) fs.writeFileSync(path.join(__dirname, 'out', 'zonas2026_trajetorias.json'), JSON.stringify({ results_json: out.results_json, nSims: NSIMS, series: traj }) + '\n');
  console.log('\n-> eval/out/' + arq);
}
