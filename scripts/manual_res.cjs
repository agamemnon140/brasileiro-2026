// Placares digitados (v4.97): MANUAL_LS / manualResSummary, que alimentam o painel
// "Placares digitados neste navegador" e o botão "Limpar todos" da aba Config.
//
// (1) Contagem por origem: liga A/B/C pelo estado do app, as demais pelas chaves do
//     localStorage; entrada com todos os campos apagados não é placar; JSON corrompido, array
//     ou chave ausente contam zero em vez de quebrar a tela.
// (2) Trava estática: TODA chave simUni_* que o index.html usa tem de estar classificada aqui —
//     placar digitado (MANUAL_LS ou simUni_userRes) ou não. Uma chave nova sem classificação
//     reprova: é o jeito de o botão não ficar para trás quando alguém criar outro editor.
const { loadEngine, extractEngine } = require('./engine.cjs');
const E = loadEngine(['MANUAL_LS', 'manualResSummary']);

let ok = true;
const check = (cond, m) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) ok = false; };
const ls = o => k => (k in o ? o[k] : null);
const mapa = (u, o) => Object.fromEntries(E.manualResSummary(u, ls(o)).map(i => [i.id, i.n]));

console.log('\n(1) manualResSummary');
{
  const vazio = mapa({ A: [], B: [], C: [] }, {});
  check(Object.keys(vazio).length === 3 + E.MANUAL_LS.length && Object.values(vazio).every(n => n === 0), 'nada digitado: sete origens, todas em zero');
  const u = { A: [{ c: 'Santos', f: 'Grêmio', gc: 0, gf: 2, r: 36 }, { c: 'Grêmio', f: 'Vasco', gc: 1, gf: 1, r: 37 }], B: [], C: [{ c: 'x', f: 'y', gc: 1, gf: 0, r: 3 }] };
  const o = {
    simUni_bPO: JSON.stringify({ po1: { iA: 1, iB: 0, vA: 2, vB: 2 }, po2: {} }),            // po2 teve os campos apagados
    simUni_cQuad: JSON.stringify({ 'A-0-1': { h: 1, a: 0 }, 'B-2-3': { h: 0 }, final: { iA: 1, iB: 1, vA: 0, vB: 0, pen: 'A' } }),
    simUni_sdMM: JSON.stringify({ D01: { iA: 2, iB: 1 }, E02: { pen: 'B' }, F03: { iA: null } }), // F03 só com null não conta
    simUni_cbR16: JSON.stringify({ 0: { g1a: 1, g1b: 0 }, 3: {} })
  };
  const m = mapa(u, o);
  check(m.ligaA === 2 && m.ligaB === 0 && m.ligaC === 1, 'liga: conta os placares do estado do app (A 2, B 0, C 1)');
  check(m.simUni_bPO === 1 && m.simUni_cQuad === 3 && m.simUni_sdMM === 2 && m.simUni_cbR16 === 1, 'edições: conta só as entradas com algum valor (B 1, C 3, D 2, Copa 1)');
  const q = mapa(null, { simUni_bPO: '{quebrado', simUni_cQuad: '[1,2]', simUni_sdMM: 'null', simUni_cbR16: '"texto"' });
  check(Object.values(q).every(n => n === 0), 'JSON corrompido, array, null e string → zero, sem lançar');
  let lancou = false;
  try { E.manualResSummary({ A: [1] }, () => { throw new Error('localStorage bloqueado'); }); } catch (e) { lancou = true; }
  check(!lancou, 'leitor do localStorage que lança (modo privado) não derruba o resumo');
  const s = E.manualResSummary(u, ls(o));
  check(s.every(i => i.label && Array.isArray(i.un) && i.un.length === 2), 'toda origem tem rótulo e unidade (singular/plural)');
}

console.log('\n(2) toda chave simUni_* está classificada');
{
  const src = extractEngine();
  const usadas = [...new Set(src.match(/simUni_[A-Za-z0-9]+/g) || [])].sort();
  const placar = new Set(['simUni_userRes', ...E.MANUAL_LS.map(m => m.key)]);
  // não são placar digitado, e por quê:
  const outras = {
    simUni_fetchedRes: 'resultados buscados/oficiais (têm o "Limpar" do painel de PDF e são reescritos pelo results.json)',
    simUni_est27: 'fila estadual da Class. 2027 — edição de critério, não placar',
    simUni_apiKey: 'chave da API',
    simUni_ghToken: 'token do GitHub',
    simUni_vagasInt: 'resultado de final continental informado e chance assumida trocada no painel de vagas (v4.98) — cenário, não placar de jogo do app'
  };
  const sem = usadas.filter(k => !placar.has(k) && !(k in outras));
  check(sem.length === 0, sem.length ? `chave(s) sem classificação: ${sem.join(', ')} — é placar digitado? então entra em MANUAL_LS; se não, na lista "outras" deste harness` : `${usadas.length} chaves no index.html, todas classificadas`);
  const orfas = [...placar].filter(k => !usadas.includes(k));
  check(orfas.length === 0, orfas.length ? `MANUAL_LS aponta chave que o app não usa mais: ${orfas.join(', ')}` : 'toda chave de placar digitado ainda é usada pelo app');
  check(/MANUAL_LS\.forEach\(m => \{ try \{ localStorage\.removeItem\(m\.key\)/.test(src), 'a ação de limpar remove exatamente as chaves de MANUAL_LS');
}

console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
