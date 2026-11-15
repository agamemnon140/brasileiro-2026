// Ingestao dos jogos historicos (Series A-D, 2021-2025) vindos da API do site da CBF.
//
// A API ("GWEB", a mesma que scripts/fetch_tables.mjs usa para 2026) serve as edicoes
// antigas: /api/cbf/campeonatos/anos lista os ids por ano e
// /api/cbf/jogos/campeonato/<id>/rodada/<n>/fase devolve os jogos de TODAS as fases que tem
// uma rodada n, cada um com grupo, rodada, data, ids e nomes dos clubes, gols e penaltis.
//
// A coleta roda num navegador (o ambiente do Claude nao alcanca cbf.com.br) e chega aqui como
// texto, uma linha por jogo:
//   ano|serie|grupo|rodada|data|id_mandante|mandante|gm|gv|visitante|id_visitante|pen_m|pen_v|id_jogo
// Este arquivo so normaliza, deduplica, confere e grava o CSV canonico. Nao busca nada.
//
//   node eval/hist/ingerir.cjs <arquivo-bruto>     # grava eval/data/hist/cbf_jogos_2021_2025.csv
//   node eval/hist/ingerir.cjs --conferir          # so confere o CSV ja gravado
const fs = require('fs');
const path = require('path');

const DESTINO = path.join(__dirname, '..', 'data', 'hist', 'cbf_jogos_2021_2025.csv');
const CAB = 'ano,serie,grupo,rodada,data,id_m,mandante,gm,gv,visitante,id_v,pen_m,pen_v,id_jogo';
const num = s => (s === '' || s == null || isNaN(Number(s)) ? null : Number(s));

function lerBruto(arquivo) {
  let txt = fs.readFileSync(arquivo, 'utf8');
  // O arquivo pode ser o texto puro ou um envelope JSON com o texto dentro.
  try { const j = JSON.parse(txt); txt = (Array.isArray(j) ? j : [j]).map(x => (x && x.text) || '').join('\n'); } catch (e) { /* texto puro */ }
  const jogos = new Map();
  for (const l of txt.split(/\r?\n/)) {
    if (!/^\d{4}\|[ABCD]\|/.test(l)) continue;
    const c = l.split('|');
    if (c.length !== 14) throw new Error('linha com ' + c.length + ' campos: ' + l.slice(0, 80));
    const d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(c[4]);
    const g = {
      ano: Number(c[0]), serie: c[1], grupo: c[2].replace(/\s+/g, ' ').trim(), rodada: Number(c[3]),
      data: d ? `${d[3]}-${d[2]}-${d[1]}` : '', id_m: c[5], mandante: c[6], gm: num(c[7]), gv: num(c[8]),
      visitante: c[9], id_v: c[10], pen_m: num(c[11]), pen_v: num(c[12]), id_jogo: c[13],
    };
    jogos.set(g.id_jogo || l, g);     // o mesmo jogo nao aparece duas vezes, mas a chave garante
  }
  return [...jogos.values()];
}

const csvCel = v => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
function gravar(jogos) {
  jogos.sort((a, b) => a.ano - b.ano || a.serie.localeCompare(b.serie) || a.grupo.localeCompare(b.grupo) ||
    a.rodada - b.rodada || a.data.localeCompare(b.data) || Number(a.id_jogo) - Number(b.id_jogo));
  const cols = CAB.split(',');
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, CAB + '\n' + jogos.map(g => cols.map(k => csvCel(g[k])).join(',')).join('\n') + '\n');
}

function lerCsv() {
  const linhas = fs.readFileSync(DESTINO, 'utf8').trim().split('\n');
  const cols = linhas[0].split(',');
  return linhas.slice(1).map(l => {
    const v = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { v.push(cur); cur = ''; } else cur += ch;
    }
    v.push(cur);
    const o = {}; cols.forEach((k, i) => o[k] = v[i]);
    for (const k of ['ano', 'rodada']) o[k] = Number(o[k]);
    for (const k of ['gm', 'gv', 'pen_m', 'pen_v']) o[k] = num(o[k]);
    return o;
  });
}

// Tabela de pontos corridos de um conjunto de jogos; a identidade do clube e o id da CBF.
function tabela(jogos) {
  const t = {};
  const cl = (id, nome) => t[id] || (t[id] = { id, nome, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, P: 0 });
  for (const g of jogos) {
    if (g.gm == null || g.gv == null) continue;
    const m = cl(g.id_m, g.mandante), v = cl(g.id_v, g.visitante);
    m.J++; v.J++; m.GP += g.gm; m.GC += g.gv; v.GP += g.gv; v.GC += g.gm;
    if (g.gm > g.gv) { m.V++; v.D++; m.P += 3; } else if (g.gm < g.gv) { v.V++; m.D++; v.P += 3; } else { m.E++; v.E++; m.P++; v.P++; }
  }
  return Object.values(t).sort((a, b) => b.P - a.P || b.V - a.V || (b.GP - b.GC) - (a.GP - a.GC) || b.GP - a.GP);
}

function conferir(jogos) {
  let ok = true;
  const falha = m => { ok = false; console.log('   FALHA: ' + m); };
  const chave = g => `${g.ano} ${g.serie}`;
  const porTS = {};
  for (const g of jogos) (porTS[chave(g)] = porTS[chave(g)] || []).push(g);
  console.log('temporada | jogos | sem placar | clubes | grupos (jogos)');
  for (const k of Object.keys(porTS).sort()) {
    const js = porTS[k], grupos = {};
    js.forEach(g => grupos[g.grupo] = (grupos[g.grupo] || 0) + 1);
    const clubes = new Set(js.flatMap(g => [g.id_m, g.id_v]));
    const gs = Object.entries(grupos).sort((a, b) => b[1] - a[1]);
    console.log(`${k} | ${js.length} | ${js.filter(g => g.gm == null).length} | ${clubes.size} | ` +
      (gs.length > 6 ? `${gs.length} grupos, de ${gs[gs.length - 1][1]} a ${gs[0][1]} jogos` : gs.map(([n, c]) => `${n} ${c}`).join('; ')));
    const serie = k.slice(-1);
    if (serie === 'A' || serie === 'B') {
      if (js.length !== 380) falha(`${k}: esperava 380 jogos, ha ${js.length}`);
      const t = tabela(js);
      if (t.length !== 20 || t.some(c => c.J !== 38)) falha(`${k}: nem todo clube tem 38 jogos (${t.filter(c => c.J !== 38).map(c => c.nome + ' ' + c.J).join(', ')})`);
    }
  }
  // Fonte independente: as classificacoes finais de 2025 colhidas da Wikipedia. A comparacao e
  // pelo multiconjunto de campanhas (P,V,E,D,GP,GC), que nao depende de casar nomes.
  const f25 = path.join(__dirname, '..', 'data', 'final_2025.json');
  if (fs.existsSync(f25)) {
    const ref = JSON.parse(fs.readFileSync(f25, 'utf8')).series;
    const assin = c => [c.P, c.V, c.E, c.D, c.GP, c.GC].join('/');
    for (const s of ['A', 'B']) {
      if (!porTS[`2025 ${s}`]) continue;
      const meu = tabela(porTS[`2025 ${s}`]).map(assin).sort(), dele = ref[s].map(assin).sort();
      const iguais = meu.length === dele.length && meu.every((x, i) => x === dele[i]);
      console.log(`2025 ${s} contra a classificacao final da Wikipedia: ${iguais ? '20 campanhas identicas' : 'DIVERGE'}`);
      if (!iguais) falha(`2025 ${s}: campanhas diferentes da Wikipedia (${meu.filter(x => !dele.includes(x)).length} sem par)`);
    }
  }
  console.log('RESULT: ' + (ok ? 'PASS' : 'FAIL'));
  return ok;
}

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) { console.error('uso: node eval/hist/ingerir.cjs <arquivo-bruto> | --conferir'); process.exit(2); }
  let jogos;
  if (arg === '--conferir') jogos = lerCsv();
  else { jogos = lerBruto(arg); gravar(jogos); console.log(`${jogos.length} jogos -> ${path.relative(process.cwd(), DESTINO)}`); jogos = lerCsv(); }
  process.exit(conferir(jogos) ? 0 : 1);
}

module.exports = { lerCsv, tabela, DESTINO };
