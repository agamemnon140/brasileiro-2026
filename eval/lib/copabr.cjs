// Reconstrói os jogos da Copa do Brasil com nome de time.
//
// O app guarda a R32 POSICIONALMENTE: CB_RES_IDA[i] = {ga, gb} e os times saem de
// CB_TEAMS[CB_R32[i][0..1]]. A convenção de mando está no próprio motor —
// `apply(a, b, ida.ga, ida.gb)` e depois `apply(b, a, volta.ga, volta.gb) // mando inverte
// na volta` — ou seja, `ga` é SEMPRE do mandante, e o mandante troca entre as pernas.
// Inverter isso passaria despercebido (os placares continuariam plausíveis) e contaminaria
// justamente o viés de casa, que é o que se está medindo.
//
// As oitavas vêm do results.json (`cb`), que já traz casa/fora por nome.
//
// Ordem cronológica: a engine ordena por `r`, então as pernas recebem 1..4 (R32 ida, R32
// volta, R16 ida, R16 volta). Não são rodadas de liga; é só o eixo do tempo do walk-forward.

function montar(E, resultsJson) {
  const jogos = [];

  // R32 — ida e volta, dos blocos embutidos
  (E.CB_R32 || []).forEach(([ia, ib], idx) => {
    const a = E.CB_TEAMS[ia], b = E.CB_TEAMS[ib];
    const ida = E.CB_RES_IDA && E.CB_RES_IDA[idx];
    const volta = E.CB_RES_VOLTA && E.CB_RES_VOLTA[idx];
    if (ida && ida.ga != null && ida.gb != null) {
      jogos.push({ c: a, f: b, gc: ida.ga, gf: ida.gb, r: 1, fase: 'R32', perna: 'ida' });
    }
    if (volta && volta.ga != null && volta.gb != null) {
      jogos.push({ c: b, f: a, gc: volta.ga, gf: volta.gb, r: 2, fase: 'R32', perna: 'volta' });
    }
  });

  // R16 (e adiante) — da automação, já com nome de time
  const vistos = new Set(jogos.map(j => j.fase + '|' + j.c + '|' + j.f));
  const ORDEM = { R32: 1, R16: 3, QF: 5, SF: 7, FINAL: 9 };
  const contaPorPar = {};
  for (const r of (resultsJson.cb || [])) {
    const fase = String(r.fase || '').toUpperCase();
    const c = r.casa, f = r.fora;
    if (!c || !f || r.gc == null || r.gf == null) continue;
    const k = fase + '|' + c + '|' + f;
    if (vistos.has(k)) continue;
    vistos.add(k);
    // ida vs volta: dentro da mesma fase, o par (x,y) e o par (y,x) são as duas pernas.
    const par = fase + '|' + [c, f].sort().join('|');
    contaPorPar[par] = (contaPorPar[par] || 0) + 1;
    const base = ORDEM[fase] || 11;
    jogos.push({ c, f, gc: r.gc, gf: r.gf, r: base + (contaPorPar[par] - 1), fase, perna: contaPorPar[par] === 1 ? 'ida' : 'volta' });
  }

  jogos.sort((x, y) => x.r - y.r);
  return jogos;
}

// CB_ELOS é {time: elo}; o harness espera {time: {elo}}.
function ranking(E) {
  const out = {};
  Object.entries(E.CB_ELOS || {}).forEach(([t, e]) => out[t] = { elo: e });
  return out;
}

module.exports = { montar, ranking };
