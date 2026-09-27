#!/usr/bin/env node
// Ponto de entrada unico da avaliacao retroativa.
//
//   node eval/run.cjs                 # curto + longo, qualidade padrao
//   node eval/run.cjs --curto         # so o estagio de curto prazo (segundos)
//   node eval/run.cjs --selftest      # so as checagens de integridade
//   node eval/run.cjs --full          # 10k simulacoes, 8 sementes (a corrida de dezembro)
//   node eval/run.cjs --horizonte 38  # forca o horizonte; falha limpo se a temporada nao acabou
//   node eval/run.cjs --allow-dirty   # dispensa a checagem de sincronia com origin/main
//
// SINCRONIA E OBRIGATORIA. A Action commita em main no proprio horario, entao um checkout
// local envelhece sozinho — e avaliar uma copia velha mede um modelo que nao esta no ar.
// O CLAUDE.md do repo registra que isso ja causou conclusoes falsas mais de uma vez.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const tem = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

function checarSincronia() {
  const git = c => execSync(c, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('git fetch origin --quiet');
  } catch (e) {
    console.error('AVISO: git fetch falhou (offline?). Prosseguindo sem verificar sincronia.');
    return { verificado: false };
  }
  const sujos = git('git status --porcelain -- index.html results.json');
  const atras = git('git rev-list --count HEAD..origin/main');
  if (sujos) {
    throw new Error(
      'index.html ou results.json tem alteracoes nao commitadas:\n' + sujos +
      '\nA avaliacao mede o modelo publicado. Commite, descarte, ou use --allow-dirty.');
  }
  if (parseInt(atras) > 0) {
    throw new Error(
      `checkout esta ${atras} commit(s) atras de origin/main.\n` +
      'Rode `git pull --ff-only` antes de avaliar — senao o relatorio descreve um modelo ' +
      'que nao esta no ar. Ou use --allow-dirty se a defasagem for intencional.');
  }
  return { verificado: true, head: git('git rev-parse --short HEAD') };
}

// Checagem de completude: o caminho de dezembro so vale se a temporada acabou. Falha com
// nome e numero, nunca em silencio.
function checarCompletude(longo) {
  const pendentes = [];
  for (const [sk, s] of Object.entries(longo.series)) {
    if (!s.completa) pendentes.push(`${sk} na rodada ${s.H}`);
  }
  return pendentes;
}

function main() {
  const soSelftest = tem('--selftest');
  const soCurto = tem('--curto');
  const full = tem('--full');
  const horizonte = val('--horizonte', null);

  let sync = { verificado: false };
  if (!tem('--allow-dirty')) {
    sync = checarSincronia();
    if (sync.verificado) console.log(`sincronia ok — HEAD ${sync.head} == origin/main`);
  } else {
    console.log('sincronia DISPENSADA (--allow-dirty)');
  }

  console.log('\n== curto prazo ==');
  const { rodar: rodarCurto } = require('./rodar_curto.cjs');
  const curto = rodarCurto();
  for (const a of curto.autoteste) {
    console.log(`  autoteste ${a.serie}: ${a.n} jogos, desvio ${a.desvioMaximo.toExponential(1)} vs. backtestSeries do app`);
  }
  if (soSelftest) {
    console.log('\nautoteste ok. (--selftest: nada foi gravado)');
    return;
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'curto.json'), JSON.stringify(curto, null, 1));
  for (const [sk, s] of Object.entries(curto.series)) {
    const v = s.base.vies.casa;
    console.log(`  [${sk}] n=${s.base.score.n} Brier=${s.base.score.brier.toFixed(4)} ECE=${(s.base.ece * 100).toFixed(2)}%` +
      ` | vies casa ${(v.gap * 100).toFixed(1)}pp z=${v.z.toFixed(2)}${v.significativo ? ' SIGNIFICATIVO' : ''}`);
  }

  let longo = null;
  if (!soCurto) {
    console.log('\n== longo prazo ==');
    const { rodar: rodarLongo } = require('./rodar_longo.cjs');
    longo = rodarLongo({
      series: (val('--series', 'A,B,C')).split(','),
      nSims: parseInt(val('--sims', full ? '10000' : '5000')),
      nSeeds: parseInt(val('--seeds', full ? '8' : '5')),
      horizonte: horizonte ? parseInt(horizonte) : null,
    });
    fs.writeFileSync(path.join(__dirname, 'out', 'longo.json'), JSON.stringify(longo, null, 1));
    const pend = checarCompletude(longo);
    if (pend.length) {
      console.log(`\n  HORIZONTE ENCURTADO — temporada incompleta: ${pend.join(', ')}.`);
      console.log('  As zonas reais (titulo, acesso, Z4) ainda nao existem; os eventos sao');
      console.log('  genericos (1o, top-4, 4 ultimos). Rode de novo quando as series acabarem.');
      if (horizonte) {
        console.error(`\nERRO: --horizonte ${horizonte} foi pedido mas a temporada nao chegou la.`);
        process.exitCode = 2;
      }
    } else {
      console.log('\n  TEMPORADA COMPLETA — horizonte cheio, zonas reais aplicaveis.');
    }
  }

  // Analises transversais (modo/preset, poder do agrupamento). Baratas: nao usam Monte
  // Carlo. A grade de horizontes usa, entao so entra se ja tiver sido gerada — rode
  // `node eval/horizonte.cjs` para (re)cria-la.
  console.log('\n== modo, preset e poder ==');
  const modos = require('./modos.cjs').rodar();
  fs.writeFileSync(path.join(__dirname, 'out', 'modos.json'), JSON.stringify(modos, null, 1));
  const poder = require('./poder.cjs').rodar();
  fs.writeFileSync(path.join(__dirname, 'out', 'poder.json'), JSON.stringify(poder, null, 1));
  const compartilhado = require('./compartilhado.cjs').rodar();
  fs.writeFileSync(path.join(__dirname, 'out', 'compartilhado.json'), JSON.stringify(compartilhado, null, 1));
  const mm = modos.modoAgrupado.meta;
  console.log(`  ATK/DEF vs ELO PURO: delta ${mm.delta >= 0 ? '+' : ''}${mm.delta.toFixed(4)} ` +
    `(${mm.delta < 0 ? 'ELO PURO' : 'ATK/DEF'} melhor), z=${Math.abs(mm.z).toFixed(2)}`);

  // Com --curto o estagio longo nao roda, mas o out/longo.json de uma execucao anterior
  // continua valido: o relatorio deve refletir tudo que existe, senao a secao some e a
  // numeracao das seguintes pula.
  if (!longo) {
    const lp = path.join(__dirname, 'out', 'longo.json');
    if (fs.existsSync(lp)) {
      longo = JSON.parse(fs.readFileSync(lp, 'utf8'));
      console.log('  (longo prazo reaproveitado de out/longo.json)');
    }
  }

  // Analises que usam Monte Carlo e por isso rodam separadas, sob demanda. Sao lidas do
  // disco se existirem: a grade de alcances (node eval/horizonte.cjs) e a varredura de
  // drift (node eval/drift.cjs).
  // `gradeHorizonte` tem nome distinto de `horizonte`, que ja e o argumento --horizonte.
  const carregar = arq => {
    const p = path.join(__dirname, 'out', arq);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`  (sem out/${arq} — secao correspondente omitida)`);
    return null;
  };
  const gradeHorizonte = carregar('horizonte.json');
  const varreduraDrift = carregar('drift.json');
  const confianca = carregar('confianca.json');
  const demonstracao = carregar('demonstracao.json');
  const candidato = carregar('candidato.json');
  // Ancoras de teto e piso do Brier: barato (sem Monte Carlo), roda sempre.
  const piso = require('./piso.cjs').rodar();
  fs.writeFileSync(path.join(__dirname, 'out', 'piso.json'), JSON.stringify(piso, null, 1));
  // Testes formais de calibracao: baratos (reanalisam os pares salvos), entao rodam sempre
  // que os pares existem.
  let testes = null;
  if (confianca && confianca.pares) {
    testes = require('./teste_calibracao.cjs').rodar();
    fs.writeFileSync(path.join(__dirname, 'out', 'teste_calibracao.json'), JSON.stringify(testes, null, 1));
  }

  const { gerar } = require('./relatorio.cjs');
  fs.writeFileSync(path.join(__dirname, 'REPORT.md'),
    gerar(curto, longo, { modos, poder, compartilhado, horizonte: gradeHorizonte, drift: varreduraDrift, confianca, demonstracao, testes, candidato, piso }));
  // Versao HTML do mesmo relatorio. Nada e recalculado: publicar.cjs so converte o
  // REPORT.md, que por sua vez so formata os JSON canonicos.
  const { montar } = require('./publicar.cjs');
  fs.writeFileSync(path.join(__dirname, 'out', 'report.html'),
    montar(fs.readFileSync(path.join(__dirname, 'REPORT.md'), 'utf8')));
  console.log('\n-> eval/out/curto.json' + (longo ? '\n-> eval/out/longo.json' : '') +
    '\n-> eval/out/modos.json\n-> eval/out/poder.json' +
    '\n-> eval/REPORT.md\n-> eval/out/report.html');
}

try {
  main();
} catch (e) {
  console.error('\nFALHOU: ' + e.message);
  process.exitCode = 1;
}
