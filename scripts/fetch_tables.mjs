// fetch_tables.mjs — baixa as Tabelas Detalhadas OFICIAIS da CBF (PDF), extrai os
// jogos da fase de liga já disputados via API do Claude (PDF como document block)
// e mescla em ../results.json (lido pelo app no load). Rodado semanalmente pela
// GitHub Action update-tables.yml. Node 20+ (fetch global).
//
// Descoberta do PDF: o link muda toda semana (data + hash no fim, ex.:
// .../cdn/Tabela_Detalhada_Brasileiro_Serie_B_2026_09_07_0bfcf98409.pdf), então o
// script raspa as páginas de competição da CBF atrás do link atual.
//
// Travas (mesma filosofia do fetch_results.mjs):
//  1. allowlist de nomes canônicos por série — descarta o resto
//  2. faixa de placar 0..14 inteiros + rodada inteira
//  3. jogo que JÁ está embutido no app (SX_RES do index.html) não entra no results.json
//  4. NUNCA sobrescreve placar já gravado — registra conflito e mantém o original
//  5. teto de jogos novos por execução
//  6. só fase de liga (grupos): mata-mata da D e da Copa BR ficam fora (vivem no código do app)
//
// Mantenha TEAMS/NORM_NAME em sincronia com o app e com scripts/fetch_results.mjs.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, '..', 'results.json');
const APP_HTML_PATH = join(__dirname, '..', 'index.html');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const MAX_NEW_PER_RUN = 80;
const PDF_HOST = 'stcbfsiteprdimgbrs.blob.core.windows.net';

const TEAMS = {
  A: ["Flamengo","Palmeiras","Cruzeiro","Mirassol","Fluminense","Botafogo","Bahia","São Paulo","Internacional","Grêmio","Atlético-MG","Santos","Corinthians","Vasco","Red Bull Bragantino","Vitória","Coritiba","Athletico-PR","Chapecoense","Remo"],
  B: ["Fortaleza","Ceará","Sport","Juventude","Criciúma","Goiás","Novorizontino","CRB","Avaí","Cuiabá","Atlético-GO","Operário-PR","Vila Nova","América-MG","Athletic","Botafogo-SP","Ponte Preta","Londrina","Náutico","São Bernardo"],
  C: ["Ferroviária","Amazonas","Volta Redonda","Paysandu","Caxias","Brusque","Guarani","Floresta","Confiança","Ypiranga","Maringá","Ituano","Botafogo-PB","Figueirense","Anápolis","Itabaiana","Inter de Limeira","Barra","Maranhão","Santa Cruz"],
};

const NORM_NAME = {
  "Atletico-MG":"Atlético-MG","Atletico Mineiro":"Atlético-MG","Atlético GO":"Atlético-GO","Atletico-GO":"Atlético-GO","Atlético":"Atlético-GO","Athletico Paranaense":"Athletico-PR","RB Bragantino":"Red Bull Bragantino","Bragantino":"Red Bull Bragantino","Sao Paulo":"São Paulo","São Bernardo FC":"São Bernardo","Sao Bernardo":"São Bernardo","Gremio":"Grêmio","Avai":"Avaí","Cuiaba":"Cuiabá","Goias":"Goiás","América MG":"América-MG","America-MG":"América-MG","America Mineiro":"América-MG","Nautico":"Náutico","Criciuma":"Criciúma","Operário PR":"Operário-PR","Operario-PR":"Operário-PR","Operário":"Operário-PR","Athletic MG":"Athletic","Botafogo SP":"Botafogo-SP","Botafogo PB":"Botafogo-PB","Grêmio Novorizontino":"Novorizontino","Barra SC":"Barra","Ypiranga RS":"Ypiranga","Maringá PR":"Maringá","Ferroviária SP":"Ferroviária","Inter de Limeira SP":"Inter de Limeira",
};

const SETS = Object.fromEntries(Object.entries(TEAMS).map(([k, v]) => [k, new Set(v)]));
const norm = (n) => NORM_NAME[(n || '').trim()] || (n || '').trim();
const dedupKey = (r) => `${r.serie}|${norm(r.casa).toLowerCase()}|${norm(r.fora).toLowerCase()}`;

// Descoberta via CMS público da CBF (Strapi): o documento "Complemento de Tabela"
// da competição aponta para o arquivo no Azure Blob (file.data.attributes.url).
// Confirmado em 11/07/2026: GET /api/championship-documents?filters[slug][$eq]=
// campeonato-brasileiro/serie-b/2026&filters[type][$eq]=Complemento de Tabela&populate=*
// O WAF da CBF pode recusar IPs de datacenter (ex.: runners do GitHub) — por isso
// todo fetch tem fallback via proxy allorigins.win (o mesmo que o app usa no browser).
const CMS_API = 'https://cms.cbf.com.br/api/championship-documents';
const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept': 'application/json, application/pdf, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9',
};

async function fetchWithFallback(url, kind) {
  const grab = async (target) => {
    const resp = await fetch(target, { headers: FETCH_HEADERS });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return kind === 'json' ? resp.json() : Buffer.from(await resp.arrayBuffer());
  };
  try {
    return await grab(url);
  } catch (e) {
    const detail = e.cause ? ` (${e.cause.code || e.cause.message})` : '';
    console.error(`::warning::fetch direto falhou: ${e.message}${detail} — tentando via proxy allorigins`);
    return await grab('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  }
}

async function findPdfUrl(serie) {
  const slug = `campeonato-brasileiro/serie-${serie.toLowerCase()}/2026`;
  const qs = new URLSearchParams({
    'filters[slug][$eq]': slug,
    'filters[type][$eq]': 'Complemento de Tabela',
    'populate': '*',
    'sort[0]': 'createdAt:desc',
    'pagination[pageSize]': '5',
  });
  try {
    const data = await fetchWithFallback(`${CMS_API}?${qs}`, 'json');
    for (const doc of data.data || []) {
      const at = doc.attributes || {};
      const url = at.url || (at.file && at.file.data && at.file.data.attributes && at.file.data.attributes.url);
      if (url && /tabela/i.test(at.title || '') && new URL(url).hostname === PDF_HOST && url.toLowerCase().endsWith('.pdf')) return url;
    }
  } catch (e) {
    console.error(`::warning::Série ${serie}: CMS falhou: ${e.message}`);
  }
  return null;
}

async function downloadPdfB64(url) {
  const buf = await fetchWithFallback(url, 'buffer');
  if (buf.length > 15 * 1024 * 1024) throw new Error('PDF grande demais');
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('resposta não é um PDF');
  return buf.toString('base64');
}

function buildPrompt(serie) {
  return [
    `Este PDF é a Tabela Detalhada oficial da CBF do Campeonato Brasileiro Série ${serie} 2026.`,
    `Extraia TODOS os jogos da FASE DE PONTOS CORRIDOS (rodadas numeradas) que JÁ TÊM PLACAR preenchido.`,
    `IGNORE completamente fases de mata-mata/playoff/quadrangular/segunda fase.`,
    `Use EXATAMENTE estes nomes de times: ${TEAMS[serie].join(', ')}.`,
    `(No PDF os nomes podem vir com sufixo de UF, ex. "Operário PR" = "Operário-PR", "São Bernardo FC" = "São Bernardo", "Athletic MG" = "Athletic", "América MG" = "América-MG", "Barra SC" = "Barra".)`,
    `Responda APENAS com um array JSON no formato:`,
    `[{"rodada":12,"casa":"...","gc":0,"gf":0,"fora":"..."}]`,
    `gc = gols do mandante, gf = gols do visitante. Jogos SEM placar (só "x") ficam de fora.`,
  ].join(' ');
}

async function extractFromPdf(serie, pdfB64, customPrompt) {
  const body = {
    model: MODEL,
    max_tokens: 30000,
    system: 'Você extrai dados tabulares de PDFs oficiais com precisão absoluta. Nunca invente placares; transcreva apenas o que está no documento.',
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
        { type: 'text', text: customPrompt || buildPrompt(serie) },
      ],
    }],
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data.stop_reason === 'max_tokens') console.error(`::warning::Série ${serie}: resposta truncada em max_tokens — extração possivelmente incompleta.`);
  let txt = '';
  for (const b of data.content || []) if (b.type === 'text') txt += b.text;
  let t = txt.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch {}
  const m = t.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  // O modelo às vezes divide a resposta em VÁRIOS arrays (um por fase/bloco ```json).
  // Como as linhas são objetos planos (sem colchetes internos), dá para capturar cada
  // array de nível único e concatenar.
  const parts = [...t.matchAll(/\[[^\[\]]*\]/g)]
    .map((mm) => { try { return JSON.parse(mm[0]); } catch { return null; } })
    .filter(Array.isArray);
  if (parts.length) return parts.flat();
  console.error(`::warning::Série ${serie}: resposta não parseou como array (${txt.length} chars): ${txt.slice(0, 300).replace(/\n/g, ' ')}`);
  return [];
}

function sanitize(serie, rows, source) {
  const out = [];
  for (const r of rows || []) {
    const casa = norm(r.casa), fora = norm(r.fora);
    const gc = Number(r.gc), gf = Number(r.gf), rodada = Number(r.rodada);
    if (!SETS[serie].has(casa) || !SETS[serie].has(fora) || casa === fora) continue;
    if (!Number.isInteger(gc) || !Number.isInteger(gf) || gc < 0 || gc > 14 || gf < 0 || gf > 14) continue;
    if (!Number.isInteger(rodada) || rodada < 1 || rodada > 38) continue;
    out.push({ serie, rodada, casa, gc, gf, fora, source });
  }
  return out;
}

// Jogos já embutidos no app (SX_RES do index.html) não precisam ir ao results.json.
async function loadBuiltIn() {
  const built = { A: new Set(), B: new Set(), C: new Set() };
  try {
    const src = await readFile(APP_HTML_PATH, 'utf8');
    for (const [serie, cname] of [['A', 'SA_RES'], ['B', 'SB_RES'], ['C', 'SC_RES']]) {
      const m = src.match(new RegExp(`const ${cname} = (\\[[\\s\\S]*?\\]);`));
      if (!m) continue;
      const arr = new Function('return ' + m[1])();
      for (const r of arr) built[serie].add(`${serie}|${r.c.toLowerCase()}|${r.f.toLowerCase()}`);
    }
  } catch (e) {
    console.error(`::warning::não consegui ler os embutidos do app: ${e.message}`);
  }
  return built;
}

// ---------------------------------------------------------------------------
// Série D — MATA-MATA (2ª fase em diante). O PDF traz cada perna com código do
// confronto (GR: B01..G01), coluna I/V e pênaltis entre parênteses. Vai para o
// campo ko_d do results.json; o app aplica como overlay no chaveamento
// (precedência: edições do usuário > dados embutidos > automação).
// ---------------------------------------------------------------------------
const SD_NORM = {
  'América RN': 'América-RN', 'Nacional AM': 'Nacional-AM', 'São José RS': 'São José-RS',
  'São Luiz RS': 'São Luiz-RS', 'XV Piracicaba': 'XV de Piracicaba', 'XV de Piracaciba': 'XV de Piracicaba',
  'Sampaio Corrêa MA': 'Sampaio Corrêa', 'Sampaio Corrêa RJ': 'Sampaio Corrêa-RJ',
  'Democrata MG': 'Democrata GV', 'Democrata': 'Democrata GV', 'Cascavel': 'FC Cascavel',
  'Portuguesa RJ': 'Portuguesa-RJ', 'Portuguesa SP': 'Portuguesa-SP', 'Vitória ES': 'Vitória-ES',
  'Rio Branco ES': 'Rio Branco-ES', 'Fluminense PI': 'Fluminense-PI', 'América RJ': 'America-RJ',
  'São Raimundo RR': 'São Raimundo-RR', 'São Raimundo': 'São Raimundo-RR', 'Independência AC': 'Independência',
};
const sdNorm = (n) => SD_NORM[(n || '').trim()] || (n || '').trim();

// Nomes canônicos da D direto do app (SD_GRUPOS) + pernas já embutidas (SD_F2_REAL/SD_F3_REAL).
// IMPORTANTE: ao consolidar novas fases no app (oitavas+), manter esses parses cobrindo-as.
async function loadSdContext() {
  const ctx = { names: new Set(), builtLegs: new Set() };
  try {
    const src = await readFile(APP_HTML_PATH, 'utf8');
    const g = src.match(/const SD_GRUPOS = (\[[\s\S]*?\]);/);
    if (g) for (const t of new Function('return ' + g[1])().flat()) ctx.names.add(t);
    for (const cname of ['SD_F2_REAL', 'SD_F3_REAL']) {
      const m = src.match(new RegExp(`const ${cname} = (\\[[\\s\\S]*?\\]);`));
      if (!m) continue;
      for (const t of new Function('return ' + m[1])()) {
        if (t.ida || t.iA != null) ctx.builtLegs.add(t.code + '|ida');
        if (t.volta || t.vA != null) ctx.builtLegs.add(t.code + '|volta');
      }
    }
  } catch (e) {
    console.error(`::warning::não consegui ler o contexto da Série D do app: ${e.message}`);
  }
  return ctx;
}

function buildPromptD(names) {
  return [
    `Este PDF é a Tabela Detalhada oficial da CBF do Campeonato Brasileiro Série D 2026.`,
    `Extraia APENAS os jogos de MATA-MATA (SEGUNDA FASE em diante — códigos de confronto na coluna GR: B01..B32, C01..C16, D01..D08, E01..E04, F01..F04, G01) que JÁ TÊM PLACAR preenchido.`,
    `IGNORE completamente a fase de grupos (TURNO/RETURNO, grupos A01-A16, rodadas 1-10).`,
    `Cada linha tem a coluna I/V (I = jogo de ida, V = volta), o código GR, mandante, placar e visitante.`,
    `Pênaltis aparecem entre parênteses ao redor do placar: "(5) 1 x 1 (4)" significa 5 cobranças convertidas pelo mandante e 4 pelo visitante.`,
    `Use EXATAMENTE estes nomes de times: ${[...names].join(', ')}.`,
    `Responda APENAS com UM ÚNICO array JSON (todas as fases juntas, sem dividir em blocos) no formato:`,
    `[{"code":"D01","leg":"ida","data":"04/07","mand":"Goiatuba","gm":1,"gv":0,"vis":"Ferroviário","pen_m":null,"pen_v":null}]`,
    `data = a data DD/MM da linha; gm/gv = gols de mandante/visitante no jogo; pen_m/pen_v = pênaltis (null quando não houve).`,
    `ATENÇÃO: jogo SEM placar preenchido (apenas "x" entre os times) NÃO pode aparecer na resposta — NUNCA invente 0x0 para jogo futuro; na dúvida, omita a linha.`,
  ].join(' ');
}

function sanitizeKoD(rows, source, names) {
  const out = [];
  let futureDropped = 0;
  // "Hoje" em horário de Brasília (UTC-3): jogo com data FUTURA não pode ter placar —
  // guarda determinística contra placar alucinado de jogo apenas agendado.
  const nowBrt = new Date(Date.now() - 3 * 3600 * 1000);
  for (const r of rows || []) {
    const code = String(r.code || '').toUpperCase().trim();
    const leg = String(r.leg || '').toLowerCase().trim();
    const mand = sdNorm(r.mand), vis = sdNorm(r.vis);
    const gm = Number(r.gm), gv = Number(r.gv);
    if (!/^[BCDEFG]\d{2}$/.test(code) || (leg !== 'ida' && leg !== 'volta')) continue;
    if (!names.has(mand) || !names.has(vis) || mand === vis) continue;
    if (!Number.isInteger(gm) || !Number.isInteger(gv) || gm < 0 || gm > 14 || gv < 0 || gv > 14) continue;
    const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(String(r.data || '').trim());
    if (!dm) continue; // sem data legível => descarta (o PDF sempre traz a data)
    const gameDate = new Date(Date.UTC(2026, Number(dm[2]) - 1, Number(dm[1])));
    if (gameDate.getTime() > nowBrt.getTime()) { futureDropped++; continue; }
    const pm = r.pen_m == null ? null : Number(r.pen_m), pv = r.pen_v == null ? null : Number(r.pen_v);
    if (pm != null && (!Number.isInteger(pm) || pm < 0 || pm > 30)) continue;
    if (pv != null && (!Number.isInteger(pv) || pv < 0 || pv > 30)) continue;
    out.push({ code, leg, data: dm[0], mand, gm, gv, vis, pen_m: pm, pen_v: pv, source });
  }
  if (futureDropped) console.error(`::warning::Série D: ${futureDropped} perna(s) com DATA FUTURA descartada(s) (provável placar inventado para jogo agendado).`);
  return out;
}

async function main() {
  if (!API_KEY) { console.error('ANTHROPIC_API_KEY ausente.'); process.exit(1); }

  let existing = [], existingKo = [];
  try {
    const raw = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
    existing = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
    existingKo = !Array.isArray(raw) && Array.isArray(raw.ko_d) ? raw.ko_d : [];
  } catch { existing = []; existingKo = []; }
  const byKey = new Map();
  for (const r of existing) byKey.set(dedupKey(r), r);
  const koByKey = new Map();
  for (const r of existingKo) koByKey.set(`${r.code}|${r.leg}`, r);

  const builtIn = await loadBuiltIn();
  const conflicts = [];
  let added = 0, skippedBuiltIn = 0, unchanged = 0;

  for (const serie of ['A', 'B', 'C']) {
    const url = await findPdfUrl(serie);
    if (!url) { console.error(`::warning::Série ${serie}: PDF da Tabela Detalhada não encontrado nas páginas da CBF.`); continue; }
    console.log(`Série ${serie}: ${url}`);
    let candidates = [];
    try {
      candidates = sanitize(serie, await extractFromPdf(serie, await downloadPdfB64(url)), url);
    } catch (e) {
      console.error(`::warning::Série ${serie} falhou: ${e.message}`);
      continue;
    }
    console.log(`Série ${serie}: ${candidates.length} jogo(s) com placar no PDF.`);
    for (const c of candidates) {
      const k = dedupKey(c);
      if (builtIn[serie] && builtIn[serie].has(k)) { skippedBuiltIn++; continue; }
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { ...c, confirmed_at: new Date().toISOString() });
        added++;
      } else if (Number(prev.gc) !== c.gc || Number(prev.gf) !== c.gf) {
        conflicts.push(k);
        console.error(`::warning::Conflito ${k}: gravado ${prev.gc}-${prev.gf} vs PDF ${c.gc}-${c.gf} (mantido o gravado)`);
      } else unchanged++;
    }
  }

  // ---- Série D: mata-mata → ko_d ----
  let koAdded = 0, koSkipped = 0, koUnchanged = 0;
  {
    const url = await findPdfUrl('D');
    if (!url) console.error('::warning::Série D: PDF da Tabela Detalhada não encontrado.');
    else {
      console.log(`Série D: ${url}`);
      try {
        const sd = await loadSdContext();
        if (!sd.names.size) throw new Error('lista de times da D não encontrada no app');
        const raw = await extractFromPdf('D', await downloadPdfB64(url), buildPromptD(sd.names));
        const candidates = sanitizeKoD(raw, url, sd.names);
        console.log(`Série D: ${raw.length} linha(s) brutas, ${candidates.length} perna(s) válidas após sanitização.`);
        if (raw.length && !candidates.length) console.error(`::warning::Série D: TODAS as linhas caíram na sanitização — amostra: ${JSON.stringify(raw.slice(0, 3))}`);
        for (const c of candidates) {
          const k = `${c.code}|${c.leg}`;
          if (sd.builtLegs.has(k)) { koSkipped++; continue; }
          const prev = koByKey.get(k);
          if (!prev) {
            koByKey.set(k, { ...c, confirmed_at: new Date().toISOString() });
            koAdded++;
          } else if (prev.gm !== c.gm || prev.gv !== c.gv || prev.mand !== c.mand) {
            conflicts.push(k);
            console.error(`::warning::Conflito D ${k}: gravado ${prev.mand} ${prev.gm}-${prev.gv} vs PDF ${c.mand} ${c.gm}-${c.gv} (mantido o gravado)`);
          } else koUnchanged++;
        }
      } catch (e) {
        console.error(`::warning::Série D falhou: ${e.message}`);
      }
    }
  }

  if (added + koAdded > MAX_NEW_PER_RUN) {
    console.error(`::error::Adicionaria ${added + koAdded} jogos (> ${MAX_NEW_PER_RUN}) — implausível para 1 semana. Abortando sem gravar.`);
    process.exit(1);
  }

  const merged = [...byKey.values()];
  const mergedKo = [...koByKey.values()];
  const canon = (arr) => JSON.stringify(
    arr.map((r) => ({ serie: r.serie, casa: r.casa, fora: r.fora, gc: r.gc, gf: r.gf, rodada: r.rodada }))
       .sort((a, b) => dedupKey(a).localeCompare(dedupKey(b)))
  );
  const canonKo = (arr) => JSON.stringify(
    arr.map((r) => ({ code: r.code, leg: r.leg, mand: r.mand, gm: r.gm, gv: r.gv, vis: r.vis, pen_m: r.pen_m, pen_v: r.pen_v }))
       .sort((a, b) => `${a.code}|${a.leg}`.localeCompare(`${b.code}|${b.leg}`))
  );
  console.log(`Resumo: +${added} liga + ${koAdded} mata-mata D novos, ${unchanged + koUnchanged} iguais, ${skippedBuiltIn + koSkipped} já embutidos no app, ${conflicts.length} conflito(s).`);
  if (canon(merged) === canon(existing) && canonKo(mergedKo) === canonKo(existingKo)) { console.log('Sem mudanças em results.json.'); return; }

  await writeFile(RESULTS_PATH, JSON.stringify({ schema: 2, updated_at: new Date().toISOString(), results: merged, ko_d: mergedKo }, null, 2) + '\n', 'utf8');
  console.log(`results.json atualizado (${merged.length} resultado(s) de liga + ${mergedKo.length} perna(s) de mata-mata D).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
