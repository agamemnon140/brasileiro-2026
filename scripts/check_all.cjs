// Roda a suite inteira de harnesses e falha se qualquer um falhar.
//
// Cada harness valida uma invariante que nao se denuncia sozinha na UI: uma tabela plausivel
// e errada passa despercebida, uma soma que nao fecha nao. Rodar tudo de uma vez e o que
// permite pendurar a suite na Action — assim uma atualizacao de resultados que quebre uma
// invariante vira um X vermelho em vez de um numero silenciosamente errado no site.
//
// NS reduzido por padrao: aqui o que se testa e ESTRUTURA (somas exatas, popcounts,
// determinismo), nao precisao estatistica — 400 sims bastam e a suite fecha em ~1 min.
// Use NS=2000 para uma rodada mais parruda.
const { spawnSync } = require('child_process');
const path = require('path');

const NS = process.env.NS || '400';
const HARNESSES = [
  'validate_ufdist',  // distribuicao conjunta por UF fecha as vagas de cada fase
  'geral_d',          // classificacao geral 1-96 reproduz as fases por acumulado
  'mando_ko',         // mata-mata D: chaveamento/mando REAIS do ko_d (flip D04/E02, play-off)
  'rnc_check',        // constantes do RNC integras, join (nome, UF) sem ambiguidade
  'rnc_proj',         // projecao 2027: identidade da janela movel, banda, escala
  'traces',           // bitsets g3/prom e rebTrace batem com as probabilidades
  'alloc2027',        // waterfall fecha 96, cascata nao cria nem destroi vaga
  'serie2027',        // serie de 2027 soma o tamanho de cada divisao; sem heranca de homonimo
  'draw2027',         // sorteio: 16x6, teto de 3 impossivel, compacidade <= CBF
  'cascata'           // as cascatas ja consumadas na vida real sao reproduzidas
];

let falhas = 0;
const t0 = Date.now();
for (const h of HARNESSES) {
  const ini = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, h + '.cjs')], {
    env: { ...process.env, NS },
    encoding: 'utf8',
    timeout: 10 * 60 * 1000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  // cascata e informativo (imprime a validacao, nao tem PASS/FAIL proprio)
  const passou = r.status === 0 && !/RESULT: FAIL/.test(out);
  if (!passou) falhas++;
  console.log(`${passou ? 'PASS' : 'FAIL'}  ${h.padEnd(16)} ${((Date.now() - ini) / 1000).toFixed(1)}s`);
  if (!passou) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
}
console.log(`\n${HARNESSES.length - falhas}/${HARNESSES.length} em ${((Date.now() - t0) / 1000).toFixed(0)}s (NS=${NS})`);
process.exit(falhas ? 1 : 0);
