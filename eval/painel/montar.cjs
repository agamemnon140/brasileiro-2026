// Monta os arquivos de dados do painel "Calibração das previsões de zona" a partir das
// saídas de eval/zonas2026.cjs, eval/matamata2026.cjs e eval/hist/calibracao.cjs.
// Cada arquivo sai como {rows, meta}; meta leva o código que gerou os números.
//
// Cada recorte é (fase, série, zona, conjunto de rodadas). Os conjuntos são os de
// zonas2026.cjs: todas as rodadas, metades e quartos da fase de liga e, nas fases finais,
// o que foi previsto depois dela.
//
//   node eval/painel/montar.cjs      # grava eval/painel/dados/*.json
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out'), DEST = path.join(__dirname, 'dados');
const ler = f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const existe = f => fs.existsSync(path.join(OUT, f));
const cod = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r1 = x => (x == null ? null : Math.round(x * 1000) / 10);      // fração -> % com 1 casa
const NOME = { A: 'Série A (prévia)', B: 'Série B', C: 'Série C', D: 'Série D', Todas: 'Todas as séries' };
const BLOCOS = ['todas', 'm1', 'm2', 'q1', 'q2', 'q3', 'q4', 'finais'];
const CURTO = { todas: 'Todas as rodadas', m1: '1ª metade', m2: '2ª metade', q1: '1º quarto', q2: '2º quarto', q3: '3º quarto', q4: '4º quarto', finais: 'Depois da fase de liga' };

const Z = ler('zonas2026.json'), M = ler('matamata2026.json');

// rótulo do conjunto: com as rodadas quando o recorte é de uma série só
function bloco(id, fase_id, rodadas) {
  const curto = id === 'todas' && fase_id === 'finais' ? 'Todas as rodadas e fases' : CURTO[id];
  const onde = id === 'todas' || id === 'finais' ? '' : rodadas ? `antes das rodadas ${rodadas[0]} a ${rodadas[1]}` : 'de cada campeonato';
  return { bloco_id: id, bloco_curto: curto, bloco_rodadas: onde, bloco: onde ? `${curto} · ${onde}` : curto, bloco_ordem: BLOCOS.indexOf(id) };
}
function faixas(prefixo, base, cal) {
  return cal.faixas.map((f, i) => ({ f, i })).filter(x => x.f.n).map(({ f, i }) => ({
    id: `${prefixo}.f${i}`, ...base, faixa: f.faixa, ordem: i, previsoes: f.n, casos: f.casos,
    previsto_pct: r1(f.previsto), aconteceu_pct: r1(f.observado), diferenca_pp: r1(f.diferenca),
    margem_lo_pp: r1(f.ic95[0]), margem_hi_pp: r1(f.ic95[1]), veredito: f.compativel ? 'dentro da margem' : 'fora da margem',
  }));
}

// 1 e 2. calibração por faixa e resumo de cada recorte
let cal = []; const resumo = [], ordemZona = {};
function add(fase_id, fase, serie, zona, id, rodadas, c, brier) {
  if (!c || !c.n) return;
  const kz = `${fase_id}.${serie}.${zona}`;
  if (!(kz in ordemZona)) ordemZona[kz] = Object.keys(ordemZona).length;
  const prefixo = `${fase_id}.${serie.toLowerCase()}.${slug(zona)}.${id}`;
  const base = { fase_id, fase, serie, serie_nome: NOME[serie], zona, zona_ordem: ordemZona[kz], ...bloco(id, fase_id, rodadas) };
  cal = cal.concat(faixas(prefixo, base, c));
  resumo.push({ id: prefixo, ...base, previsoes: c.n, clubes: c.clubes, erro_medio_pp: +(c.ece * 100).toFixed(1), brier: brier == null ? null : +brier.toFixed(4) });
}
function recortes(fase_id, fase, geral, series, sks) {
  // primeiro "todas as rodadas", para fixar a ordem das zonas; depois cada conjunto
  for (const id of BLOCOS) {
    const g = id === 'todas' ? geral : (geral.blocos || {})[id];
    if (g) add(fase_id, fase, 'Todas', 'Todas', id, null, g.calibracao, g.brier);
    for (const sk of sks) {
      const s = id === 'todas' ? series[sk] : (series[sk].blocos || {})[id];
      if (!s) continue;
      add(fase_id, fase, sk, 'Todas', id, s.rodadas, s.calibracao, s.brier);
      for (const e of s.porEvento) add(fase_id, fase, sk, e.evento, id, s.rodadas, e.calibracao, e.brier);
    }
  }
}
recortes('liga', 'Fase de liga', Z.geral, Z.series, ['A', 'B', 'C', 'D']);
recortes('finais', 'Fases finais', M.geral, M.series, ['C', 'D']);

// 3. precisão por zona e conjunto de rodadas
const prec = [];
for (const id of BLOCOS) {
  for (const sk of ['A', 'B', 'C', 'D']) {
    const s = id === 'todas' ? Z.series[sk] : (Z.series[sk].blocos || {})[id];
    if (s) for (const e of s.porEvento) prec.push({ id: `liga.${sk.toLowerCase()}.${slug(e.evento)}.${id}`, serie: sk, serie_nome: NOME[sk], fase: 'Fase de liga', zona: e.evento, ...bloco(id, 'liga', s.rodadas), vagas: e.vagas, previsoes: e.previsoes,
      habilidade_pct: r1(e.habilidade), brier: +e.brier.toFixed(3), brier_referencia: +e.brierTaxaBase.toFixed(3), acerto_modelo_pct: r1(e.acertoModeloDesdeR1), acerto_tabela_pct: r1(e.acertoTabelaDoMomento) });
  }
  for (const sk of ['C', 'D']) {
    const s = id === 'todas' ? M.series[sk] : (M.series[sk].blocos || {})[id];
    if (s) for (const e of s.porEvento) prec.push({ id: `finais.${sk.toLowerCase()}.${slug(e.evento)}.${id}`, serie: sk, serie_nome: NOME[sk], fase: 'Fases finais', zona: e.evento, ...bloco(id, 'finais', s.rodadas), vagas: e.vagas, previsoes: e.previsoesAbertas,
      habilidade_pct: r1(e.habilidade), brier: +e.brier.toFixed(3), brier_referencia: +e.brierReferencia.toFixed(3), acerto_modelo_pct: null, acerto_tabela_pct: null });
  }
}

// 4. eventos raros: a menor probabilidade dada ao que aconteceu, e a maior ao que não aconteceu
const raros = [];
const quando = (rot) => { const m = /^rodada (\d+)$/.exec(rot); return m ? (m[1] === '0' ? 'pré-temporada' : 'após a rodada ' + m[1]) : rot; };
const TZ = ler('zonas2026_trajetorias.json'), TM = ler('matamata2026_trajetorias.json');
const varrer = (traj, fase, rotulo, sims) => { for (const [sk, ts] of Object.entries(traj)) for (const t of ts) {
  let melhor = null;
  t.p.forEach((p, i) => { if (p == null) return; const q = t.o ? p : 1 - p; if (!melhor || q < melhor.q) melhor = { q, p, i }; });
  if (!melhor) continue;
  raros.push({ serie: sk, serie_nome: NOME[sk], fase, clube: t.time, evento: t.evento, quando: quando(rotulo(sk, melhor.i)), etapa: melhor.i, probabilidade_pct: +(melhor.p * 100).toFixed(2),
    desfecho: t.o ? 'aconteceu' : 'não aconteceu', chance_do_desfecho_pct: +(melhor.q * 100).toFixed(2), piso_pct: +(100 / sims).toFixed(2) });
} };
varrer(TZ.series, 'Fase de liga', (sk, i) => 'rodada ' + i, TZ.nSims);
varrer(TM.series, 'Fases finais', (sk, i) => TM.etapas[sk][i], TM.nSims);
raros.sort((a, b) => a.chance_do_desfecho_pct - b.chance_do_desfecho_pct || a.etapa - b.etapa);
const rarosTop = raros.slice(0, 40).map((r, i) => ({ id: 'r' + (i + 1), posicao: i + 1, ...r }));

// 5. drift: 2026 (semente do app) e 2022–2025 (semente neutra)
const variantes = [];
const pega = (c, i) => c.faixas[i] && c.faixas[i].n ? c.faixas[i] : null;
const addVar = (id, base, drift, brier, c, n) => { const f7 = pega(c, 7), f8 = pega(c, 8), f10 = pega(c, 10);
  variantes.push({ id, base, drift, previsoes: n, brier: +brier.toFixed(4), erro_medio_pp: +(c.ece * 100).toFixed(2),
    f7080_previsto_pct: f7 ? r1(f7.previsto) : null, f7080_aconteceu_pct: f7 ? r1(f7.observado) : null, f7080_veredito: f7 ? (f7.compativel ? 'dentro' : 'fora') : null,
    f8090_previsto_pct: f8 ? r1(f8.previsto) : null, f8090_aconteceu_pct: f8 ? r1(f8.observado) : null, f8090_veredito: f8 ? (f8.compativel ? 'dentro' : 'fora') : null,
    certeza_aconteceu_pct: f10 ? +(f10.observado * 100).toFixed(2) : null }); };
const z26 = { 0: 'zonas2026_drift0.json', 15: 'zonas2026.json', 30: 'zonas2026_drift30.json' };
for (const d of [0, 15, 30]) if (existe(z26[d])) { const o = ler(z26[d]); if (o.geral.brier != null) addVar('a2026.d' + d, '2026, semente do app', d, o.geral.brier, o.geral.calibracao, o.geral.calibracao.n); }
const h = { 0: 'hist_calibracao_drift0.json', 15: 'hist_calibracao_vigente.json', 30: 'hist_calibracao_drift30.json' };
for (const d of [0, 15, 30]) if (existe(h[d])) { const o = ler(h[d]); addVar('h2225.d' + d, '2022–2025, semente neutra', d, o.geral.brier, o.geral.calibracao, o.previsoes); }

fs.mkdirSync(DEST, { recursive: true });
const grava = (nome, rows, meta) => { fs.writeFileSync(path.join(DEST, nome), JSON.stringify({ rows, meta })); console.log(`${nome}: ${rows.length} linhas, ${(fs.statSync(path.join(DEST, nome)).size / 1024).toFixed(0)} KB`); };
const entrada = { label: 'Entrada', value: `index.html v4.90 e results.json de ${Z.results_json} do repositório agamemnon140/brasileiro-2026; ${Z.nSims} simulações por rodada` };
const codigo = [{ label: 'eval/zonas2026.cjs', value: cod('zonas2026.cjs'), type: 'code', lang: 'javascript' }, { label: 'eval/matamata2026.cjs', value: cod('matamata2026.cjs'), type: 'code', lang: 'javascript' }];
grava('calibracao.json', cal, [entrada, ...codigo]);
grava('recortes.json', resumo, [entrada, { label: 'Código', value: 'O mesmo de "Calibração por faixa": eval/zonas2026.cjs e eval/matamata2026.cjs' }]);
grava('precisao.json', prec, [entrada, { label: 'Código', value: 'O mesmo de "Calibração por faixa": eval/zonas2026.cjs e eval/matamata2026.cjs' }]);
grava('raros.json', rarosTop, [entrada, { label: 'eval/painel/montar.cjs', value: cod('painel/montar.cjs'), type: 'code', lang: 'javascript' }]);
grava('variantes.json', variantes, [entrada, { label: 'eval/hist/calibracao.cjs', value: cod('hist/calibracao.cjs'), type: 'code', lang: 'javascript' }]);
