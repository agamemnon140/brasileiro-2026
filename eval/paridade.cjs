// O REPLAY E O QUE O APP PUBLICOU?
//
// O eval/ mede o motor de HOJE aplicado ao passado. Isso so equivale ao que o app mostrava
// em cada data se o nucleo de previsao nao mudou no caminho. Este arquivo confere as duas
// coisas que sustentam a equivalencia, usando o proprio git como arquivo:
//
//   1. TEXTO. Para cada versao do index.html no historico, recorta DEFAULT_CFG, calcL, updR,
//      initLeague, applyDrift e as sementes S{A,B,C}_RANKING e compara com a versao anterior.
//      Lista toda mudanca, com data e commit.
//   2. NUMERO. Carrega o motor de versoes antigas (por padrao a primeira do repo e a de
//      19/08, base do REPORT de setembro) e o de hoje, da a todos os mesmos resultados e a
//      mesma semente de Monte Carlo, e compara P(1o), P(top-4) e P(4 ultimos).
//
// O que isto NAO cobre: o periodo anterior ao repo (jan-mai/2026), o mata-mata da Serie D e
// a Copa do Brasil (o simMC_single e o chaveamento mudaram varias vezes) e qualquer config
// alterada no navegador de quem usava o app.
//
// Precisa do historico completo: num clone raso, `git fetch --depth=1000 origin main` antes.
//
//   node eval/paridade.cjs                 # versoes padrao
//   node eval/paridade.cjs <commit> ...    # compara estas versoes com a de hoje
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const NUCLEO = {
  DEFAULT_CFG: 'const DEFAULT_CFG = {',
  calcL: 'const calcL = ',
  updR: 'const updR = ',
  initLeague: 'const initLeague = ',
  applyDrift: 'const applyDrift = ',
  SA_RANKING: 'const SA_RANKING = {',
  SB_RANKING: 'const SB_RANKING = {',
  SC_RANKING: 'const SC_RANKING = {',
};

// Recorta do marcador ate a chave que fecha o primeiro bloco aberto depois dele. Marcador
// textual, nunca numero de linha — a mesma disciplina do scripts/engine.cjs.
function bloco(html, marcador) {
  const i = html.indexOf(marcador);
  if (i < 0) return null;
  let k = html.indexOf('{', i), prof = 0;
  for (; k >= 0 && k < html.length; k++) {
    if (html[k] === '{') prof++;
    else if (html[k] === '}' && --prof === 0) return html.slice(i, k + 1).replace(/\s+/g, '');
  }
  return null;
}
const hash = s => (s === null ? null : crypto.createHash('md5').update(s).digest('hex').slice(0, 8));

function texto() {
  const commits = git('log', '--reverse', '--format=%H|%ad|%s', '--date=short', '--', 'index.html')
    .trim().split('\n').map(l => { const [h, d, ...m] = l.split('|'); return { h, d, msg: m.join('|') }; });
  let ant = null;
  const mudancas = [];
  for (const c of commits) {
    const html = git('show', `${c.h}:index.html`);
    const cur = {};
    for (const [k, m] of Object.entries(NUCLEO)) cur[k] = hash(bloco(html, m));
    if (ant) {
      const dif = Object.keys(NUCLEO).filter(k => cur[k] !== ant[k]);
      if (dif.length) mudancas.push({ data: c.d, commit: c.h.slice(0, 7), blocos: dif, msg: c.msg });
    } else {
      const faltam = Object.keys(NUCLEO).filter(k => cur[k] === null);
      if (faltam.length) throw new Error(`primeira versao (${c.h.slice(0, 7)}) sem os blocos: ${faltam.join(', ')}`);
    }
    ant = cur;
  }
  return { versoes: commits.length, primeira: commits[0].d, ultima: commits[commits.length - 1].d, mudancas };
}

// Carrega o motor de uma versao antiga: escreve o index.html daquele commit num diretorio
// temporario, ao lado de uma copia do engine.cjs de hoje, que resolve o HTML por caminho
// relativo.
function motorDe(commit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paridade-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'index.html'), git('show', `${commit}:index.html`));
  fs.copyFileSync(path.join(RAIZ, 'scripts', 'engine.cjs'), path.join(dir, 'scripts', 'engine.cjs'));
  return require(path.join(dir, 'scripts', 'engine.cjs'));
}

function numero(commits) {
  const L = require('./lib/longterm.cjs');
  const dados = require('./lib/appdata.cjs').load();
  const SYM = ['DEFAULT_CFG', 'simMC', 'parseTab', 'SA_TAB', 'SA_NM', 'SA_DATES', 'SA_RANKING',
    'SB_TAB', 'SB_NM', 'SB_DATES', 'SB_RANKING'];
  const CASOS = [['A', 18], ['B', 11]];
  const NSIMS = 4000;
  const prever = (E, sk, corte, seed) => {
    const ranking = E[`S${sk}_RANKING`], times = Object.keys(ranking);
    const fixture = E.parseTab(E[`S${sk}_TAB`], E[`S${sk}_NM`], E[`S${sk}_DATES`]);
    const H = fixture.reduce((m, g) => Math.max(m, g.rodada), 0);
    const { dist } = L.preverEm(E, {
      times, ranking, fixture, res: dados.merged[sk], cfg: E.DEFAULT_CFG, sk, H, corte,
      nSims: NSIMS, ak: E.DEFAULT_CFG.defaultAlpha, seed,
    });
    return { dist, n: times.length };
  };
  const eventos = (d, n) => [d[0], L.soma(d, 0, 4), L.soma(d, n - 4, n)];
  const dif = (a, b) => {
    let mx = 0;
    for (const t of Object.keys(a.dist)) {
      if (!b.dist[t]) return Infinity;
      const x = eventos(a.dist[t], a.n), y = eventos(b.dist[t], b.n);
      for (let i = 0; i < 3; i++) mx = Math.max(mx, Math.abs(x[i] - y[i]));
    }
    return mx;
  };
  const hoje = require('../scripts/engine.cjs').loadEngine(SYM);
  const linhas = [];
  for (const [sk, corte] of CASOS) {
    const ref = prever(hoje, sk, corte, 4242);
    const ruido = dif(ref, prever(hoje, sk, corte, 777));
    const porVersao = {};
    for (const c of commits) porVersao[c] = dif(prever(motorDe(c).loadEngine(SYM), sk, corte, 4242), ref);
    linhas.push({ serie: sk, corte, nSims: NSIMS, ruidoMC: ruido, difMax: porVersao });
  }
  return linhas;
}

if (require.main === module) {
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true' &&
      parseInt(git('rev-list', '--count', 'HEAD')) < 50) {
    console.error('clone raso demais: rode `git fetch --depth=1000 origin main` antes.');
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const t = texto();
  console.log(`== texto: ${t.versoes} versoes do index.html, de ${t.primeira} a ${t.ultima}`);
  if (!t.mudancas.length) console.log('   nucleo de previsao IDENTICO em todas (config, calcL, updR, initLeague, applyDrift, sementes A/B/C)');
  for (const m of t.mudancas) console.log(`   MUDOU em ${m.data} ${m.commit}: ${m.blocos.join(', ')} | ${m.msg.slice(0, 70)}`);

  const primeira = git('log', '--reverse', '--format=%H', '--', 'index.html').trim().split('\n')[0];
  const commits = args.length ? args : [primeira, '4fd574674e7ed59dfd5aa5dc61f0956e061902bf'];
  console.log('\n== numero: mesmos resultados, mesma semente de MC; maior diferenca em P(1o), P(top-4), P(4 ultimos)');
  let igual = true;
  for (const l of numero(commits)) {
    console.log(`   Serie ${l.serie}, sabendo ate a rodada ${l.corte} (${l.nSims} sims; ruido de MC entre duas sementes: ${(l.ruidoMC * 100).toFixed(1)} pp)`);
    for (const [c, d] of Object.entries(l.difMax)) {
      console.log(`      ${c.slice(0, 7)} vs hoje: ${(d * 100).toFixed(2)} pp`);
      if (d > 1e-12) igual = false;
    }
  }
  console.log('\n' + (t.mudancas.length === 0 && igual
    ? 'VEREDITO: para as tabelas de A/B/C, o replay equivale ao que o app publicou desde ' + t.primeira + '.'
    : 'VEREDITO: houve mudanca no nucleo ou nas projecoes; o replay NAO equivale ao publicado em todo o periodo. Ver a lista acima.'));
}

module.exports = { texto, numero };
