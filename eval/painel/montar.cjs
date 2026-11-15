// Monta os arquivos de dados do painel "Calibração das previsões de zona" a partir das
// saídas de eval/zonas2026.cjs, eval/matamata2026.cjs e eval/hist/calibracao.cjs.
// Cada arquivo sai como {rows, meta}; meta leva o código que gerou os números.
//
//   node eval/painel/montar.cjs      # grava eval/painel/dados/*.json
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out'), DEST = path.join(__dirname, 'dados');
const ler = f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const existe = f => fs.existsSync(path.join(OUT, f));
const cod = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r1 = x => Math.round(x * 1000) / 10;      // fração -> % com 1 casa
const NOME = { A: 'Série A (prévia)', B: 'Série B', C: 'Série C', D: 'Série D', Todas: 'Todas as séries' };

const Z = ler('zonas2026.json'), M = ler('matamata2026.json');

function faixas(prefixo, base, cal) {
  return cal.faixas.map((f, i) => ({ f, i })).filter(x => x.f.n).map(({ f, i }) => ({
    id: `${prefixo}.f${i}`, ...base, faixa: f.faixa, ordem: i, previsoes: f.n, casos: f.casos,
    previsto_pct: r1(f.previsto), aconteceu_pct: r1(f.observado), diferenca_pp: r1(f.diferenca),
    margem_lo_pp: r1(f.ic95[0]), margem_hi_pp: r1(f.ic95[1]), veredito: f.compativel ? 'dentro da margem' : 'fora da margem',
  }));
}

// 1. calibração por série, fase e zona
let cal = [], ordemZona = 0;
const add = (fase_id, fase, serie, zona, c) => { cal = cal.concat(faixas(`${fase_id}.${serie.toLowerCase()}.${slug(zona)}`, { fase_id, fase, serie, serie_nome: NOME[serie], zona, zona_ordem: ordemZona++ }, c)); };
add('liga', 'Fase de liga', 'Todas', 'Todas', Z.geral.calibracao);
for (const sk of ['A', 'B', 'C', 'D']) { add('liga', 'Fase de liga', sk, 'Todas', Z.series[sk].calibracao); for (const e of Z.series[sk].porEvento) add('liga', 'Fase de liga', sk, e.evento, e.calibracao); }
add('finais', 'Fases finais', 'Todas', 'Todas', M.geral.calibracao);
for (const sk of ['C', 'D']) { add('finais', 'Fases finais', sk, 'Todas', M.series[sk].calibracao); for (const e of M.series[sk].porEvento) add('finais', 'Fases finais', sk, e.evento, e.calibracao); }

// 2. precisão por zona
const prec = [];
for (const sk of ['A', 'B', 'C', 'D']) for (const e of Z.series[sk].porEvento) prec.push({ id: `liga.${sk.toLowerCase()}.${slug(e.evento)}`, serie: sk, serie_nome: NOME[sk], fase: 'Fase de liga', zona: e.evento, vagas: e.vagas, previsoes: e.previsoes,
  habilidade_pct: r1(e.habilidade), brier: +e.brier.toFixed(3), brier_referencia: +e.brierTaxaBase.toFixed(3), acerto_modelo_pct: r1(e.acertoModeloDesdeR1), acerto_tabela_pct: r1(e.acertoTabelaDoMomento) });
for (const sk of ['C', 'D']) for (const e of M.series[sk].porEvento) prec.push({ id: `finais.${sk.toLowerCase()}.${slug(e.evento)}`, serie: sk, serie_nome: NOME[sk], fase: 'Fases finais', zona: e.evento, vagas: e.vagas, previsoes: e.previsoesAbertas,
  habilidade_pct: r1(e.habilidade), brier: +e.brier.toFixed(3), brier_referencia: +e.brierReferencia.toFixed(3), acerto_modelo_pct: null, acerto_tabela_pct: null });

// 3. eventos raros: a menor probabilidade dada ao que aconteceu, e a maior ao que não aconteceu
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

// 4. drift: 2026 (semente do app) e 2022–2025 (semente neutra)
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
grava('calibracao.json', cal, [entrada, { label: 'eval/zonas2026.cjs', value: cod('zonas2026.cjs'), type: 'code', lang: 'javascript' }, { label: 'eval/matamata2026.cjs', value: cod('matamata2026.cjs'), type: 'code', lang: 'javascript' }]);
grava('precisao.json', prec, [entrada, { label: 'Código', value: 'O mesmo de "Calibração por faixa": eval/zonas2026.cjs e eval/matamata2026.cjs' }]);
grava('raros.json', rarosTop, [entrada, { label: 'eval/painel/montar.cjs', value: cod('painel/montar.cjs'), type: 'code', lang: 'javascript' }]);
grava('variantes.json', variantes, [entrada, { label: 'eval/hist/calibracao.cjs', value: cod('hist/calibracao.cjs'), type: 'code', lang: 'javascript' }]);
