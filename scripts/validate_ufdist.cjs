// Validação: roda a simMC_D modificada (headless) e confere que ufDist é
// produzido e que sum_uf E[fase] bate com as vagas da fase (64/32/16/8/4/2/6).
const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'simulador_unificado.jsx'), 'utf8').split(/\r?\n/);
// Engine + dados: até antes de useSortable (1147). Excisa Badge (124-137) e TN (141).
const engine = lines.slice(0, 1146)
  .map((l, i) => { const n = i + 1; if (n >= 124 && n <= 137) return ''; if (n === 141) return ''; return l; })
  .filter(l => !/^\s*import\s/.test(l) && !/export\s+default/.test(l))
  .join('\n');

const harness = `
(function(){
  const cfg = {...DEFAULT_CFG, drift:15};
  const r = simMC_D(cfg, 3000, 'conservador', false);
  if(!r.ufDist) { console.log('FAIL: ufDist ausente'); return; }
  const PH = ['f2','f3','oit','qf','sf','fin','ac'];
  const expected = {f2:64,f3:32,oit:16,qf:8,sf:4,fin:2,ac:6};
  let ok = true;
  console.log('fase  | soma E[times] sobre UFs | esperado');
  for(const p of PH){
    const tot = r.ufDist.reduce((s,row)=>s+row[p].E,0);
    const good = Math.abs(tot - expected[p]) < 1e-6;
    if(!good) ok = false;
    console.log('  '+p.padEnd(4)+' | '+tot.toFixed(3).padStart(10)+'            | '+expected[p]+(good?'  OK':'  <<< MISMATCH'));
  }
  // checa shape de uma UF
  const sp = r.ufDist.find(x=>x.uf==='SP');
  console.log('\\nSP n='+sp.n+' ac.pcts.length='+sp.ac.pcts.length+' (esperado n+1='+(sp.n+1)+')');
  console.log('SP acesso pcts %: '+sp.ac.pcts.map(v=>v.toFixed(1)).join(' '));
  console.log('\\ntop3 por E[acesso]: '+r.ufDist.slice(0,3).map(x=>x.uf+' '+x.ac.E.toFixed(2)).join(', '));
  console.log(ok ? '\\nRESULT: PASS' : '\\nRESULT: FAIL');
})();
`;
eval(engine + '\n' + harness);
