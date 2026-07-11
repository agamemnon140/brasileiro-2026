// Análise: distribuição conjunta de quantos times de cada ESTADO (UF) avançam
// a cada fase da Série D. Reusa a engine pura do simulador_unificado.jsx
// (linhas 1..1101, antes de qualquer código React) e adiciona um acumulador
// por-simulação que conta, por UF, quantos times chegaram a cada fase.
//
// Defaults canônicos do app (dashboard "Simular Tudo"): ak='conservador',
// eo=false, drift=15. Fases (semântica v4.24, "CHEGOU a essa fase"):
//   f2  top-4 do grupo (64)   f3  2ª fase (32)   oit oitavas (16)
//   qf  quartas (8)   sf  semi (4)   fin final (2)   ac  acesso (6)   ch campeão (1)
const fs = require('fs');
const path = require('path');

const NS = parseInt(process.env.NS || '30000', 10);

const jsxPath = path.join(__dirname, '..', 'simulador_unificado.jsx');
const lines = fs.readFileSync(jsxPath, 'utf8').split(/\r?\n/);
// Engine + dados: linhas 1..1101 (índice 0..1100). Remove import/export e os
// dois únicos componentes JSX embutidos nesse trecho (Badge: linhas 118-131,
// TN: linha 135) que não são usados pela engine de simulação.
const engine = lines.slice(0, 1101)
  .map((l, i) => {
    const n = i + 1; // nº de linha 1-based
    if (n >= 118 && n <= 131) return ''; // componente Badge (JSX)
    if (n === 135) return '';            // componente TN (JSX)
    return l;
  })
  .filter(l => !/^\s*import\s/.test(l) && !/export\s+default/.test(l))
  .join('\n');

const PHASES = ['f2', 'f3', 'oit', 'qf', 'sf', 'fin', 'ac', 'ch'];

const harness = `
(function(){
  const cfg = {...DEFAULT_CFG, drift: 15};
  const ak = 'conservador';
  const eo = false;
  const { mc, mf } = getML(cfg, 'D');
  const snap = prepareSerieDState(cfg, eo, ak);
  const tabD = SD_REAL_TAB;

  // Uma simulação completa -> retorna conjuntos de times por fase.
  const simOne = () => {
    const { el, at, df, st } = cloneSDState(snap);
    let lastDR = 0;
    for (const j of tabD) {
      if (snap.jogados.has(pairKey(j.casa, j.fora, j.rodada))) continue;
      if (j.rodada > lastDR && j.rodada > snap.maxRR && cfg.drift > 0) { lastDR = j.rodada; applyDrift(SD_TIMES, el, at, df, cfg.drift); }
      const { lC, lF } = calcL(at[j.casa], df[j.casa], at[j.fora], df[j.fora], el[j.casa], el[j.fora], mc, mf, cfg.homeAdv, eo, cfg.c0Log);
      const gc = poissonRandom(lC), gf = poissonRandom(lF);
      st[j.casa].J++; st[j.fora].J++; st[j.casa].GP += gc; st[j.casa].GC += gf; st[j.fora].GP += gf; st[j.fora].GC += gc;
      if (gc > gf) { st[j.casa].V++; st[j.casa].P += 3; st[j.fora].D++; }
      else if (gc === gf) { st[j.casa].E++; st[j.fora].E++; st[j.casa].P++; st[j.fora].P++; }
      else { st[j.fora].V++; st[j.fora].P += 3; st[j.casa].D++; }
      updR(el, at, df, j.casa, j.fora, gc, gf, lC, lF, cfg, ak, eo);
    }
    const gruposRanked = SD_GRUPOS.map(g => g.map(t => ({ time: t, ...st[t], SG: st[t].GP - st[t].GC })).sort((a, b) => b.P - a.P || b.V - a.V || b.SG - a.SG || b.GP - a.GP));
    const gruposTop4 = gruposRanked.map(g => g.slice(0, 4).map(c2 => c2.time));
    const f2 = gruposTop4.flat();
    const s180 = (a, b) => { const r2 = eo ? (() => { const d = el[a] - el[b]; const e = 1 / (1 + Math.pow(10, -d / 400)); return { lC: 2 * cfg.mnMM * (0.5 + e), lF: 2 * cfg.mnMM * (0.5 + (1 - e)) }; })() : { lC: Math.max(0.2, 2 * cfg.mnMM * at[a] * df[b]), lF: Math.max(0.2, 2 * cfg.mnMM * at[b] * df[a]) }; const ga = poissonRandom(r2.lC), gb = poissonRandom(r2.lF); return ga > gb ? a : gb > ga ? b : Math.random() < 0.5 ? a : b; };
    let winF2 = [];
    for (const [gx, gy] of SD_PAIRS) {
      const pairs = [[gruposTop4[gx][0], gruposTop4[gy][3]], [gruposTop4[gx][1], gruposTop4[gy][2]], [gruposTop4[gy][0], gruposTop4[gx][3]], [gruposTop4[gy][1], gruposTop4[gx][2]]];
      for (const [a, b] of pairs) winF2.push(s180(a, b));
    }
    const f3 = winF2.slice();
    let winF3 = [];
    for (const [p1, p2] of SD_SUPER) {
      for (let j = 0; j < 4; j++) { const a = winF2[p1 * 4 + j], b = winF2[p2 * 4 + (3 - j)]; winF3.push(s180(a, b)); }
    }
    const oit = winF3.slice();
    const r16 = [...winF3].sort((a, b) => st[b].P - st[a].P || (st[b].GP - st[b].GC) - (st[a].GP - st[a].GC));
    const winOit = [];
    for (let i = 0; i < 8; i++) { const a = r16[i], b = r16[15 - i]; winOit.push(s180(a, b)); }
    const qf = winOit.slice();
    const r8 = [...winOit].sort((a, b) => st[b].P - st[a].P);
    const qW = [], qL = [];
    for (let i = 0; i < 4; i++) { const a = r8[i], b = r8[7 - i]; const w = s180(a, b); qW.push(w); qL.push(w === a ? b : a); }
    const sf = qW.slice();
    const playoff = [s180(qL[0], qL[1]), s180(qL[2], qL[3])];
    const ac = [...qW, ...playoff];
    const sf1 = s180(qW[0], qW[1]), sf2 = s180(qW[2], qW[3]);
    const fin = [sf1, sf2];
    const champ = s180(sf1, sf2);
    return { f2, f3, oit, qf, sf, fin, ac, ch: [champ] };
  };

  const PHASES = ${JSON.stringify(PHASES)};
  // Times por UF
  const ufTeams = {};
  SD_TIMES.forEach(t => { const u = SD_INFO[t].uf; (ufTeams[u] = ufTeams[u] || []).push(t); });
  const UFS = Object.keys(ufTeams).sort();
  // hist[uf][phase] = array de contagem: hist[uf][phase][k] = nº de sims com exatamente k times
  const hist = {};
  UFS.forEach(u => { hist[u] = {}; PHASES.forEach(p => { hist[u][p] = new Array(ufTeams[u].length + 1).fill(0); }); });

  const NS = ${NS};
  for (let s = 0; s < NS; s++) {
    const r = simOne();
    for (const p of PHASES) {
      const set = new Set(r[p]);
      // conta por UF
      const cnt = {};
      for (const t of set) { const u = SD_INFO[t].uf; cnt[u] = (cnt[u] || 0) + 1; }
      for (const u of UFS) { hist[u][p][cnt[u] || 0]++; }
    }
  }

  const out = { NS, cfg: { ak, eo, drift: cfg.drift }, ufTeams: {}, hist: {} };
  UFS.forEach(u => { out.ufTeams[u] = ufTeams[u]; out.hist[u] = hist[u]; });
  console.log('__RESULT__' + JSON.stringify(out));
})();
`;

eval(engine + '\n' + harness);
