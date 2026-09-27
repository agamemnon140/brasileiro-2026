// Validacao do final_2025.json: a composicao das series de 2026 derivada da classificacao
// de 2025 tem de reproduzir o acesso e o rebaixamento reais. Se nao reproduzir, ou a coleta
// esta errada ou o join casou clube com homonimo — nos dois casos a semente "ano anterior"
// estaria mentindo, e mentindo de forma plausivel.
const { loadEngine } = require('../scripts/engine.cjs');
const J = require('./lib/join2025.cjs');

const ESPERADO = { A: { A: 16, B: 4 }, B: { A: 4, B: 12, C: 4 }, C: { B: 4, C: 12, D: 4 } };

function validar() {
  const E = loadEngine(['SA_NM', 'SB_NM', 'SC_NM', 'SD_TIMES', 'ufOfTeam']);
  const r25 = J.construir(E.ufOfTeam);
  if (!r25) return { ok: false, erro: 'eval/data/final_2025.json ausente — rode python eval/data/coletar_2025.py' };
  const t26 = {
    A: [...new Set(Object.values(E.SA_NM))], B: [...new Set(Object.values(E.SB_NM))],
    C: [...new Set(Object.values(E.SC_NM))], D: E.SD_TIMES,
  };
  const linhas = []; let ok = true;
  for (const s of ['A', 'B', 'C', 'D']) {
    const conta = {}, orfaos = [];
    for (const t of t26[s]) {
      const h = r25(t);
      if (h) conta[h.serie] = (conta[h.serie] || 0) + 1; else orfaos.push(t);
    }
    const esp = ESPERADO[s];
    const bate = !esp ? null
      : Object.keys(esp).length === Object.keys(conta).length &&
        Object.entries(esp).every(([k, v]) => conta[k] === v) && orfaos.length === 0;
    if (bate === false) ok = false;
    linhas.push({ serie: s, n: t26[s].length, origem: conta, semPar: orfaos, esperado: esp || null, bate });
  }
  return { ok, linhas };
}

if (require.main === module) {
  const r = validar();
  if (r.erro) { console.error(r.erro); process.exit(1); }
  for (const l of r.linhas) {
    console.log(`Serie ${l.serie} (${l.n}): ${JSON.stringify(l.origem)} | sem par: ${l.semPar.length}` +
      (l.bate === null ? '  (sem estrutura esperada — vagas estaduais)' : l.bate ? '  BATE' : '  DIVERGE') +
      (l.semPar.length && l.serie !== 'D' ? ' -> ' + l.semPar.join(', ') : ''));
  }
  console.log(r.ok ? '\nOK — a composicao de 2026 derivada de 2025 reproduz acesso/rebaixamento reais.'
                   : '\nFALHOU — corrija a coleta ou o join antes de usar a semente ano_anterior.');
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { validar };
