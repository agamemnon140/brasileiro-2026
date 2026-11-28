// Coletor dos jogos historicos das Series A-D na API do site da CBF.
//
// Rodou em 14/11/2026 DENTRO DE UM NAVEGADOR, numa aba aberta em
// https://www.cbf.com.br/api/cbf/campeonatos/anos, porque o ambiente do Claude nao alcanca
// cbf.com.br. Foram 588 requisicoes em sequencia, cerca de 32 minutos, nenhuma falha.
// Nao tem dependencia de navegador alem do fetch com caminho relativo: num Node que alcance o
// site, troque os caminhos por URLs absolutas e use NODE_EXTRA_CA_CERTS=scripts/cbf-ca.pem.
// Essa variante em Node NAO foi testada.
//
// Os ids de edicao vem de /api/cbf/campeonatos/anos (campeonato "Campeonato Brasileiro",
// categorias "Serie A".."Serie D"; a API lista 2018 a 2026). Uma rodada alem da ultima
// devolve "[]", e e assim que o laco sabe parar.
//
// Saida: window.__C.rows, uma linha por jogo, no formato que eval/hist/ingerir.cjs le:
//   ano|serie|grupo|rodada|data|id_mandante|mandante|gm|gv|visitante|id_visitante|pen_m|pen_v|id_jogo
// "panaltis" e a grafia da propria API.
window.__C = { done: false, log: [], rows: [], err: [], reqs: 0, atual: '', t0: Date.now() };
(async () => {
  const C = window.__C;
  const ED = {
    A: { 2021: '12487', 2022: '12518', 2023: '12555', 2024: '12584', 2025: '12606' },
    B: { 2021: '12488', 2022: '12519', 2023: '12556', 2024: '12585', 2025: '12607' },
    C: { 2021: '12490', 2022: '12520', 2023: '12561', 2024: '12586', 2025: '12616' },
    D: { 2021: '12489', 2022: '12524', 2023: '12562', 2024: '12587', 2025: '12617' },
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cl = s => String(s == null ? '' : s).replace(/[|\n\r]/g, ' ').trim();
  for (const sk of ['B', 'C', 'D', 'A']) for (const y of ['2021', '2022', '2023', '2024', '2025']) {
    const id = ED[sk][y]; let vazias = 0, n = 0;
    for (let r = 1; r <= 46 && vazias < 2; r++) {
      C.atual = `${sk}${y} r${r}`;
      let j = null, ok = false;
      for (let t = 0; t < 3 && !ok; t++) {
        try {
          const resp = await fetch(`/api/cbf/jogos/campeonato/${id}/rodada/${r}/fase`); C.reqs++;
          if (resp.ok) { j = await resp.json(); ok = true; } else await sleep(900);
        } catch (e) { await sleep(900); }
      }
      if (!ok) { C.err.push(`${sk}${y} r${r}`); vazias++; continue; }
      let k = 0;
      for (const g of ((j && Array.isArray(j.jogos)) ? j.jogos : [])) for (const x of (g.jogo || [])) {
        const md = x.mandante || {}, vs = x.visitante || {};
        C.rows.push([y, sk, cl(g.grupo), cl(x.rodada || r), cl(x.data), cl(md.id), cl(md.nome), cl(md.gols),
          cl(vs.gols), cl(vs.nome), cl(vs.id), cl(md.panaltis), cl(vs.panaltis), cl(x.id_jogo)].join('|'));
        k++;
      }
      if (k === 0) vazias++; else { vazias = 0; n += k; }
      await sleep(100);
    }
    C.log.push(`${sk}${y}:${n}`);
  }
  C.done = true; C.t1 = Date.now();
})();
