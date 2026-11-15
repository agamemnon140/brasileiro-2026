// PRIMEIRO TESTE MULTI-TEMPORADA: uma semente derivada da tabela do ano anterior bate
// "todos iguais" nos eventos de zona?
//
// Roda o motor de hoje (recortado do index.html, como todo o eval/) sobre as Series A, B, C e
// D de 2022 a 2025, com os jogos de eval/data/hist/cbf_jogos_2021_2025.csv. O clube e o id
// da CBF, nao o nome. Cada liga e simulada como pontos corridos puros (sk 'A' com os gols
// medios da serie de verdade), entao playoff da B e quadrangular da C de 2026 nao entram.
//
// REGUA: Brier dos eventos de zona, com os cortes reais de cada serie na fase de liga
//   A: 1o, top-4, top-6, 4 ultimos    B: 1o, top-4 (acesso), 4 ultimos
//   C: 1o, top-8 (quadrangular), 4 ultimos    D (cada grupo de 8): 1o, top-4 (classificados)
// medido em quatro cortes: pre-temporada e 25%, 50% e 75% das rodadas.
//
// SEMENTE "ano anterior": posto na piramide do ano anterior (A 1-20, B 21-40, C 41-60, D
// 61+ por aproveitamento na fase de grupos; quem nao jogou serie nacional fica no piso),
// convertido em Elo linear no posto dentro da serie e encolhido por k em direcao ao centro.
// "iguais" e o piso de comparacao: todo clube no centro.
//
// VEREDITO (fixado antes de rodar, ver eval/REVISAO.md): a semente vira licao se melhora o
// Brier de zona em pelo menos 12 das 16 celulas temporada x serie. A confirmacao em 2026 e
// passo separado.
//
//   node eval/hist/sementes.cjs            # 2000 simulacoes por ponto, ~3 min
//   node eval/hist/sementes.cjs 5000       # mais simulacoes
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('../../scripts/engine.cjs');
const L = require('../lib/longterm.cjs');
const S = require('../lib/seeds.cjs');
const { lerCsv, tabela } = require('./ingerir.cjs');

const NSIMS = parseInt(process.argv[2]) || 2000;
const KS = [0.25, 0.5, 1.0];
const CENTRO = (S.ELO_MIN + S.ELO_MAX) / 2;
const EVENTOS = {
  A: [['1o', 1, 1], ['top4', 1, 4], ['top6', 1, 6], ['z4', 17, 20]],
  B: [['1o', 1, 1], ['top4', 1, 4], ['z4', 17, 20]],
  C: [['1o', 1, 1], ['top8', 1, 8], ['z4', 17, 20]],
  D: [['1o', 1, 1], ['top4', 1, 4]],
};

// Ligas de pontos corridos de cada temporada x serie. Na C e o grupo de 190 jogos (ou os
// dois de 90 em 2021); na D, os oito grupos de 56 jogos.
function ligas(jogos) {
  const out = {};
  const porTS = {};
  for (const g of jogos) (porTS[`${g.ano}|${g.serie}`] = porTS[`${g.ano}|${g.serie}`] || []).push(g);
  for (const [k, js] of Object.entries(porTS)) {
    const [ano, serie] = k.split('|');
    const porGrupo = {};
    js.forEach(g => (porGrupo[g.grupo] = porGrupo[g.grupo] || []).push(g));
    const alvo = { A: [380], B: [380], C: [190, 90], D: [56] }[serie];
    out[k] = Object.entries(porGrupo).filter(([, v]) => alvo.includes(v.length))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, v]) => ({ ano: Number(ano), serie, nome, jogos: v, times: [...new Set(v.flatMap(g => [g.id_m, g.id_v]))] }));
  }
  return out;
}

// A CBF troca o id do clube quando ele vira SAF (Cruzeiro, Vasco, Botafogo, Bahia, Fortaleza...).
// Sem religar os ids, um clube que foi 4o da Serie A no ano anterior entra como "sem
// historico". O elo e feito pelo nome: um id que estreia no ano Y herda de um id que sumiu
// antes de Y quando o nome normalizado de um e igual ao do outro ou seu prefixo, e o
// candidato e unico entre os de aparicao mais recente. Devolve id novo -> id antigo.
const normNome = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(saf|s\.?a\.?f\.?|futebol|clube|esporte|club|de|do|da|e|regatas|fc|ec|sc|sociedade|anonima|ltda)\b/g, ' ')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function aliases(jogos) {
  const nome = {}, anos = {};
  for (const g of jogos) for (const [id, n] of [[g.id_m, g.mandante], [g.id_v, g.visitante]]) { nome[id] = n; (anos[id] = anos[id] || new Set()).add(g.ano); }
  const prim = id => Math.min(...anos[id]), ult = id => Math.max(...anos[id]);
  const mapa = {}, ambiguos = [];
  for (const t of Object.keys(nome)) {
    const y = prim(t); if (y <= 2021) continue;
    const nt = normNome(nome[t]);
    // prefixo so vale quando o nome novo diz SAF: sem isso, "Guarany FC" herdaria de "Guarany de Sobral"
    const ehSaf = /\bs\.?a\.?f\b/i.test(nome[t]);
    let c = Object.keys(nome).filter(i => i !== t && ult(i) < y && (normNome(nome[i]) === nt || (ehSaf && (nt.startsWith(normNome(nome[i]) + ' ') || normNome(nome[i]).startsWith(nt + ' ')))));
    if (!c.length) continue;
    const rec = Math.max(...c.map(ult)); c = c.filter(i => ult(i) === rec);
    if (c.length === 1) mapa[t] = c[0]; else ambiguos.push(`${t} ${nome[t]}: ${c.map(i => i + ' ' + nome[i]).join(' / ')}`);
  }
  return { mapa, ambiguos, nome };
}
// Elos que o nome nao resolve, conferidos a mao.
const ALIAS_MANUAL = {};

// Posto na piramide ao fim de `ano`: quanto menor, melhor.
function piramide(LG, ano) {
  const posto = {};
  const base = { A: 0, B: 20, C: 40, D: 60 };
  for (const serie of ['A', 'B', 'C', 'D']) {
    const ls = LG[`${ano}|${serie}`] || [];
    if (serie === 'A' || serie === 'B' || (serie === 'C' && ls.length === 1)) {
      ls.forEach(l => tabela(l.jogos).forEach((c, i) => posto[c.id] = base[serie] + i + 1));
    } else {
      // C em dois grupos (2021) e D em oito: ordena todos pelo aproveitamento na fase de grupos.
      const todos = ls.flatMap(l => tabela(l.jogos));
      todos.sort((a, b) => b.P / b.J - a.P / a.J || (b.GP - b.GC) / b.J - (a.GP - a.GC) / a.J || b.GP / b.J - a.GP / a.J);
      todos.forEach((c, i) => posto[c.id] = base[serie] + i + 1);
    }
  }
  return posto;
}

// Elo linear no posto ordinal dentro do conjunto `ids`; empates (o piso) dividem o posto medio.
function eloPorPosto(ids, posto0, alias = {}) {
  const PISO = 1e6;
  // segue a cadeia de ids antigos ate achar um com posto
  const posto = {};
  for (const t of ids) { let i = t, n = 0; while (!posto0[i] && alias[i] && n++ < 5) i = alias[i]; if (posto0[i]) posto[t] = posto0[i]; }
  const ord = [...ids].sort((a, b) => (posto[a] || PISO) - (posto[b] || PISO));
  const ordinal = {};
  for (let i = 0; i < ord.length;) {
    let j = i;
    while (j + 1 < ord.length && (posto[ord[j + 1]] || PISO) === (posto[ord[i]] || PISO)) j++;
    for (let k = i; k <= j; k++) ordinal[ord[k]] = (i + j) / 2;
    i = j + 1;
  }
  const n = ord.length, elo = {};
  ids.forEach(t => elo[t] = S.ELO_MAX - (S.ELO_MAX - S.ELO_MIN) * ordinal[t] / (n - 1));
  return elo;
}

function rodar() {
  const E = loadEngine(['DEFAULT_CFG', 'simMC', 'calcClassif']);
  const jogos = lerCsv();
  const LG = ligas(jogos);
  const al = { ...aliases(jogos).mapa, ...ALIAS_MANUAL };
  const celulas = [];
  for (const ano of [2022, 2023, 2024, 2025]) {
    const posto = piramide(LG, ano - 1);
    for (const serie of ['A', 'B', 'C', 'D']) {
      const ls = LG[`${ano}|${serie}`];
      // Pontos corridos puros: sk 'A' com os gols medios e o mando da serie de verdade.
      const cfg = structuredClone(E.DEFAULT_CFG);
      cfg.lambdas.A = { ...E.DEFAULT_CFG.lambdas[serie] };
      const eloSerie = eloPorPosto(ls.flatMap(l => l.times), posto, al);
      const temPosto = t => { let i = t, n = 0; while (!posto[i] && al[i] && n++ < 5) i = al[i]; return !!posto[i]; };
      const semPosto = ls.flatMap(l => l.times).filter(t => !temPosto(t)).length;
      const variantes = { iguais: () => CENTRO };
      KS.forEach(k => variantes[`anterior@${k}`] = t => CENTRO + k * (eloSerie[t] - CENTRO));
      const soma = {}, soma0 = {}; let n = 0, n0 = 0;
      Object.keys(variantes).forEach(v => { soma[v] = 0; soma0[v] = 0; });
      ls.forEach((l, gi) => {
        const H = l.jogos.reduce((m, g) => Math.max(m, g.rodada), 0);
        const fixture = l.jogos.map(g => ({ casa: g.id_m, fora: g.id_v, rodada: g.rodada, data: g.data }));
        const res = l.jogos.filter(g => g.gm != null).map(g => ({ c: g.id_m, f: g.id_v, gc: g.gm, gf: g.gv, r: g.rodada }));
        const real = {}; E.calcClassif(l.times, res).forEach(c => real[c.time] = c.pos);
        const nT = l.times.length;
        for (const corte of [0, Math.round(H * 0.25), Math.round(H * 0.5), Math.round(H * 0.75)]) {
          for (const [v, ge] of Object.entries(variantes)) {
            const ranking = {}; l.times.forEach(t => ranking[t] = { elo: ge(t) });
            const { dist } = L.preverEm(E, {
              times: l.times, ranking, fixture, res, cfg, sk: 'A', H, corte, nSims: NSIMS,
              ak: cfg.defaultAlpha, seed: ano * 1000 + gi * 37 + corte * 7 + serie.charCodeAt(0),
            });
            let b = 0, m = 0;
            for (const [, de, ate0] of EVENTOS[serie]) {
              const ate = Math.min(ate0, nT);
              for (const t of l.times) {
                const p = L.soma(dist[t], de - 1, ate), o = real[t] >= de && real[t] <= ate ? 1 : 0;
                b += (p - o) ** 2; m++;
              }
            }
            soma[v] += b / m; if (corte === 0) soma0[v] += b / m;
          }
          n++; if (corte === 0) n0++;
        }
      });
      const cel = { ano, serie, ligas: ls.length, clubes: ls.flatMap(l => l.times).length, semPosto, brier: {}, brierPre: {} };
      Object.keys(variantes).forEach(v => { cel.brier[v] = soma[v] / n; cel.brierPre[v] = soma0[v] / n0; });
      celulas.push(cel);
      process.stderr.write(`  ${ano} ${serie}: iguais ${cel.brier.iguais.toFixed(4)} | ` + KS.map(k => `k=${k} ${cel.brier['anterior@' + k].toFixed(4)}`).join(' | ') + '\n');
    }
  }
  const veredito = {};
  for (const k of KS) {
    const v = 'anterior@' + k;
    const ganha = celulas.filter(c => c.brier[v] < c.brier.iguais);
    const ganhaPre = celulas.filter(c => c.brierPre[v] < c.brierPre.iguais);
    const porSerie = {};
    ['A', 'B', 'C', 'D'].forEach(s => porSerie[s] = ganha.filter(c => c.serie === s).length);
    veredito[v] = {
      celulasMelhores: ganha.length, de: celulas.length, porSerie,
      celulasMelhoresPreTemporada: ganhaPre.length,
      ganhoMedio: celulas.reduce((a, c) => a + (1 - c.brier[v] / c.brier.iguais), 0) / celulas.length,
      ganhoMedioPreTemporada: celulas.reduce((a, c) => a + (1 - c.brierPre[v] / c.brierPre.iguais), 0) / celulas.length,
      passa: ganha.length >= 12,
    };
  }
  return { nSims: NSIMS, ks: KS, eventos: EVENTOS, celulas, veredito };
}

if (require.main === module) {
  const out = rodar();
  console.log('\ncelula | clubes (sem posto no ano anterior) | Brier de zona: iguais | ' + KS.map(k => 'anterior k=' + k).join(' | ') + ' | pre-temporada: iguais -> melhor k');
  for (const c of out.celulas) {
    const pre = KS.map(k => c.brierPre['anterior@' + k]);
    console.log(`${c.ano} ${c.serie} | ${c.clubes} (${c.semPosto}) | ${c.brier.iguais.toFixed(4)} | ` +
      KS.map(k => c.brier['anterior@' + k].toFixed(4)).join(' | ') + ` | ${c.brierPre.iguais.toFixed(4)} -> ${Math.min(...pre).toFixed(4)}`);
  }
  console.log('\nveredito pela regra de celulas (>= 12 de 16):');
  for (const [v, r] of Object.entries(out.veredito)) {
    console.log(`  ${v}: melhor em ${r.celulasMelhores}/${r.de} (A ${r.porSerie.A}, B ${r.porSerie.B}, C ${r.porSerie.C}, D ${r.porSerie.D} de 4) | ` +
      `ganho medio ${(r.ganhoMedio * 100).toFixed(1)}% | so pre-temporada: ${r.celulasMelhoresPreTemporada}/${r.de}, ganho ${(r.ganhoMedioPreTemporada * 100).toFixed(1)}% | ${r.passa ? 'PASSA' : 'nao passa'}`);
  }
  fs.writeFileSync(path.join(__dirname, '..', 'out', 'hist_sementes.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\n-> eval/out/hist_sementes.json');
}

module.exports = { ligas, piramide, eloPorPosto, aliases, normNome, rodar };
