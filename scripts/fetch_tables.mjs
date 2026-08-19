// fetch_tables.mjs — baixa as Tabelas Detalhadas OFICIAIS da CBF (PDF), extrai os
// jogos da fase de liga já disputados via API do Claude (PDF como document block)
// e mescla em ../results.json (lido pelo app no load). Rodado semanalmente pela
// GitHub Action update-tables.yml. Node 20+ (fetch global).
//
// Cache: scripts/pdf-cache.json guarda a URL do PDF de cada serie/competicao na
// ultima extracao COMPLETA. URL igual = PDF igual, entao as chamadas a API (o que
// custa dinheiro) sao puladas. FORCE_REFRESH=1 ignora o cache.
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
const PDF_CACHE_PATH = join(__dirname, 'pdf-cache.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const MAX_NEW_PER_RUN = 80;
const PDF_HOST = 'stcbfsiteprdimgbrs.blob.core.windows.net';
// FORCE_REFRESH=1 ignora o cache de URL e reextrai tudo (util depois de mexer nos
// prompts ou na sanitizacao, quando o PDF e o mesmo mas o parsing mudou).
const FORCE_REFRESH = /^(1|true|yes)$/i.test(process.env.FORCE_REFRESH || '');

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

// Copa do Brasil: slug próprio no CMS. Tem vizinhos-armadilha com o mesmo prefixo
// (copa-do-brasil/sub-15/2026, .../feminino/2026), então o filtro é por slug EXATO.
const CB_SLUG = 'copa-do-brasil/masculino/2026';

async function findPdfUrl(serie) {
  const slug = serie === 'CB' ? CB_SLUG : `campeonato-brasileiro/serie-${serie.toLowerCase()}/2026`;
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

// Datas: extração SEPARADA da de placares. O prompt de placar exige jogo já
// disputado (guarda contra placar alucinado); data interessa justamente para jogo
// FUTURO, que aquele prompt exclui de propósito. Mantendo os dois apartados, mexer
// em data nunca pode degradar a extração de placar.
function buildDatesPrompt(serie) {
  return [
    `Este PDF é a Tabela Detalhada oficial da CBF do Campeonato Brasileiro Série ${serie} 2026.`,
    `Liste TODOS os jogos da FASE DE PONTOS CORRIDOS (rodadas numeradas), tendo placar ou não, com a DATA de cada um.`,
    `IGNORE completamente fases de mata-mata/playoff/quadrangular/segunda fase.`,
    `Use EXATAMENTE estes nomes de times: ${TEAMS[serie].join(', ')}.`,
    `(No PDF os nomes podem vir com sufixo de UF, ex. "Operário PR" = "Operário-PR", "São Bernardo FC" = "São Bernardo", "Athletic MG" = "Athletic", "América MG" = "América-MG", "Barra SC" = "Barra".)`,
    `NÃO inclua placares. Responda APENAS com um array JSON no formato:`,
    `[{"rodada":12,"casa":"...","fora":"...","data":"09/08"}]`,
    `data = dia/mês com 2 dígitos cada (dd/mm), exatamente como no PDF. Jogo sem data definida no PDF fica de fora.`,
  ].join(' ');
}

function sanitizeDates(serie, rows) {
  const out = [];
  for (const r of rows || []) {
    const casa = norm(r.casa), fora = norm(r.fora);
    const rodada = Number(r.rodada);
    const data = typeof r.data === 'string' ? r.data.trim() : '';
    if (!SETS[serie].has(casa) || !SETS[serie].has(fora) || casa === fora) continue;
    if (!Number.isInteger(rodada) || rodada < 1 || rodada > 38) continue;
    // dd/mm estrito; recusa 32/13 e afins para não escrever lixo na fixture
    const m = /^(\d{2})\/(\d{2})$/.exec(data);
    if (!m) continue;
    const dd = Number(m[1]), mm = Number(m[2]);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) continue;
    out.push({ serie, rodada, casa, fora, data });
  }
  return out;
}

// Sinaliza que a ultima extracao bateu no teto de max_tokens (logo pode estar
// incompleta). Lido em main() para NAO gravar a URL no cache -- assim a serie e
// reextraida na proxima execucao em vez de ficar congelada pela metade.
let lastExtractTruncated = false;

async function extractFromPdf(serie, pdfB64, customPrompt) {
  lastExtractTruncated = false;
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
  if (data.stop_reason === 'max_tokens') {
    lastExtractTruncated = true;
    console.error(`::warning::Série ${serie}: resposta truncada em max_tokens — extração possivelmente incompleta.`);
  }
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

// Datas embutidas no app: S{A,B,C}_DATES é UMA data por RODADA (parseTab faz
// data: dates[ri]). Só vai para o results.json a data que DIVERGE da rodada — jogo
// remarcado — senão o envelope carregaria ~1100 datas iguais às que o app já tem.
async function loadBuiltInDates() {
  const built = { A: [], B: [], C: [] };
  try {
    const src = await readFile(APP_HTML_PATH, 'utf8');
    for (const [serie, cname] of [['A', 'SA_DATES'], ['B', 'SB_DATES'], ['C', 'SC_DATES']]) {
      const m = src.match(new RegExp(`const ${cname} = (\\[[\\s\\S]*?\\]);`));
      if (!m) continue;
      built[serie] = new Function('return ' + m[1])();
    }
  } catch (e) {
    console.error(`::warning::não consegui ler as datas embutidas do app: ${e.message}`);
  }
  return built;
}

// ---------------------------------------------------------------------------
// Copa do Brasil — OITAVAS (R16). A R32 já está 100% oficial e embutida
// (CB_RES_IDA/VOLTA). O app indexa as oitavas por POSIÇÃO em CB_R16_PAIRS, com
// {g1a,g1b} = ida (a manda) e {g2a,g2b} = volta (b manda; g2a são os gols de a).
// Aqui só extraímos por NOME; quem resolve a posição e a orientação é o app, que
// é dono de CB_R16_PAIRS — assim o scraper não duplica o chaveamento.
// ---------------------------------------------------------------------------
async function loadCbPairs() {
  try {
    const src = await readFile(APP_HTML_PATH, 'utf8');
    const m = src.match(/const CB_R16_PAIRS = (\[[\s\S]*?\]);/);
    if (!m) return [];
    return new Function('return ' + m[1])();
  } catch (e) {
    console.error(`::warning::não consegui ler CB_R16_PAIRS do app: ${e.message}`);
    return [];
  }
}

function buildCbPrompt(names) {
  return [
    `Este PDF é a Tabela Detalhada oficial da CBF da Copa do Brasil 2026.`,
    `Extraia APENAS os jogos das OITAVAS DE FINAL (16 avos já foram; ignore fases anteriores e posteriores) que JÁ TÊM PLACAR preenchido.`,
    `Use EXATAMENTE estes nomes de times: ${names.join(', ')}.`,
    `Cada confronto tem ida e volta. Responda APENAS com um array JSON no formato:`,
    `[{"casa":"...","gc":0,"gf":0,"fora":"..."}]`,
    `casa = mandante daquele jogo, gc = gols do mandante, gf = gols do visitante.`,
    `Jogo SEM placar (apenas "x" entre os times) NÃO pode aparecer — NUNCA invente placar para jogo futuro; na dúvida, omita.`,
  ].join(' ');
}

function sanitizeCb(rows, nameSet, source) {
  const out = [];
  for (const r of rows || []) {
    const casa = norm(r.casa), fora = norm(r.fora);
    const gc = Number(r.gc), gf = Number(r.gf);
    if (!nameSet.has(casa) || !nameSet.has(fora) || casa === fora) continue;
    if (!Number.isInteger(gc) || !Number.isInteger(gf) || gc < 0 || gc > 14 || gf < 0 || gf > 14) continue;
    out.push({ fase: 'R16', casa, fora, gc, gf, source });
  }
  return out;
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

// Cache de URL do PDF. O link da CBF carrega data + hash no fim e so muda quando a
// tabela e republicada, entao URL igual = PDF igual e a extracao daria o mesmo
// resultado. Como cada extracao manda o PDF inteiro para a API (o custo dominante
// de uma execucao), pular a chamada quando nada mudou derruba o gasto de quase toda
// execucao para zero. Gravado no repo pela Action junto com o results.json.
async function loadPdfCache() {
  try {
    const raw = JSON.parse(await readFile(PDF_CACHE_PATH, 'utf8'));
    return raw && raw.urls && typeof raw.urls === 'object' ? { ...raw.urls } : {};
  } catch { return {}; }
}

async function savePdfCache(urls) {
  await writeFile(PDF_CACHE_PATH, JSON.stringify({ updated_at: new Date().toISOString(), urls }, null, 2) + '\n', 'utf8');
}

async function main() {
  if (!API_KEY) { console.error('ANTHROPIC_API_KEY ausente.'); process.exit(1); }

  let existing = [], existingKo = [], existingDates = [], existingCb = [];
  try {
    const raw = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
    existing = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
    existingKo = !Array.isArray(raw) && Array.isArray(raw.ko_d) ? raw.ko_d : [];
    existingDates = !Array.isArray(raw) && Array.isArray(raw.dates) ? raw.dates : [];
    existingCb = !Array.isArray(raw) && Array.isArray(raw.cb) ? raw.cb : [];
  } catch { existing = []; existingKo = []; existingDates = []; existingCb = []; }
  const byKey = new Map();
  for (const r of existing) byKey.set(dedupKey(r), r);
  const koByKey = new Map();
  for (const r of existingKo) koByKey.set(`${r.code}|${r.leg}`, r);

  const builtIn = await loadBuiltIn();
  const builtInDates = await loadBuiltInDates();
  const pdfCache = await loadPdfCache();
  if (FORCE_REFRESH) console.log('FORCE_REFRESH ativo — reextraindo todas as séries.');
  let extracted = 0, skippedCache = 0;
  const conflicts = [];
  let added = 0, skippedBuiltIn = 0, unchanged = 0;
  // datas por jogo (serie|rodada|casa|fora -> {data}); o PDF é a fonte, então aqui
  // a versão nova SEMPRE vence — jogo remarcado é justamente o caso de uso.
  const datesByKey = new Map();
  // Séries cujo passe de datas rodou NESTA execução. As demais (puladas por cache,
  // download falhou, extração falhou) precisam ter as datas já gravadas reinjetadas
  // depois do laço — senão a substituição em bloco lá embaixo apagaria as delas.
  const datesFresh = new Set();

  for (const serie of ['A', 'B', 'C']) {
    const url = await findPdfUrl(serie);
    if (!url) { console.error(`::warning::Série ${serie}: PDF da Tabela Detalhada não encontrado nas páginas da CBF.`); continue; }
    if (!FORCE_REFRESH && pdfCache[serie] === url) {
      console.log(`Série ${serie}: PDF inalterado desde a última extração — pulando as chamadas à API.`);
      skippedCache++;
      continue;
    }
    console.log(`Série ${serie}: ${url}`);
    let candidates = [];
    let pdfB64 = null;
    let serieOk = true;
    try {
      pdfB64 = await downloadPdfB64(url);
      candidates = sanitize(serie, await extractFromPdf(serie, pdfB64), url);
      extracted++;
      if (lastExtractTruncated) serieOk = false;
    } catch (e) {
      console.error(`::warning::Série ${serie} falhou: ${e.message}`);
      continue;
    }
    console.log(`Série ${serie}: ${candidates.length} jogo(s) com placar no PDF.`);

    // Datas (passe separado, mesmo PDF já baixado). Falha aqui não derruba os placares.
    try {
      const ds = sanitizeDates(serie, await extractFromPdf(serie, pdfB64, buildDatesPrompt(serie)));
      let diver = 0;
      for (const d of ds) {
        const daRodada = (builtInDates[serie] || [])[d.rodada - 1] || '';
        if (daRodada && d.data === daRodada) continue; // igual à data da rodada: nada a overlay
        datesByKey.set(`${d.serie}|${d.rodada}|${d.casa}|${d.fora}`, { ...d, source: url });
        diver++;
      }
      console.log(`Série ${serie}: ${ds.length} data(s) no PDF, ${diver} divergente(s) da data da rodada.`);
      datesFresh.add(serie);
      extracted++;
      if (lastExtractTruncated) serieOk = false;
    } catch (e) {
      serieOk = false;
      console.error(`::warning::Série ${serie}: extração de datas falhou: ${e.message}`);
    }
    // Só cacheia quando OS DOIS passes (placares e datas) foram completos: cachear
    // depois de uma falha parcial congelaria a metade que faltou até a CBF republicar.
    if (serieOk) pdfCache[serie] = url;
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

  for (const d of existingDates) {
    if (!datesFresh.has(d.serie)) datesByKey.set(`${d.serie}|${d.rodada}|${d.casa}|${d.fora}`, d);
  }

  // ---- Série D: mata-mata → ko_d ----
  let koAdded = 0, koSkipped = 0, koUnchanged = 0;
  {
    const url = await findPdfUrl('D');
    if (!url) console.error('::warning::Série D: PDF da Tabela Detalhada não encontrado.');
    else if (!FORCE_REFRESH && pdfCache.D === url) {
      console.log('Série D: PDF inalterado desde a última extração — pulando a chamada à API.');
      skippedCache++;
    } else {
      console.log(`Série D: ${url}`);
      try {
        const sd = await loadSdContext();
        if (!sd.names.size) throw new Error('lista de times da D não encontrada no app');
        const raw = await extractFromPdf('D', await downloadPdfB64(url), buildPromptD(sd.names));
        extracted++;
        if (!lastExtractTruncated) pdfCache.D = url;
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
  // ---- Copa do Brasil: oitavas → cb ----
  let cbAdded = 0, cbUnchanged = 0;
  const cbByKey = new Map();
  for (const r of existingCb) cbByKey.set(`${r.fase}|${r.casa}|${r.fora}`, r);
  {
    const pairs = await loadCbPairs();
    const names = [...new Set(pairs.flat())];
    if (!names.length) console.error('::warning::Copa do Brasil: CB_R16_PAIRS não encontrado no app — pulando.');
    else {
      const url = await findPdfUrl('CB');
      if (!url) console.error('::warning::Copa do Brasil: PDF da Tabela Detalhada não encontrado.');
      else if (!FORCE_REFRESH && pdfCache.CB === url) {
        console.log('Copa do Brasil: PDF inalterado desde a última extração — pulando a chamada à API.');
        skippedCache++;
      } else {
        console.log(`Copa do Brasil: ${url}`);
        try {
          const nameSet = new Set(names);
          const rows = sanitizeCb(await extractFromPdf('CB', await downloadPdfB64(url), buildCbPrompt(names)), nameSet, url);
          extracted++;
          if (!lastExtractTruncated) pdfCache.CB = url;
          // só aceita jogo entre times que formam um confronto REAL das oitavas
          const pairKeys = new Set(pairs.map(([a, b]) => [a, b].sort().join('|')));
          const valid = rows.filter((r) => pairKeys.has([r.casa, r.fora].sort().join('|')));
          if (rows.length !== valid.length) console.error(`::warning::Copa do Brasil: ${rows.length - valid.length} jogo(s) descartado(s) por não formarem confronto das oitavas.`);
          for (const c of valid) {
            const k = `${c.fase}|${c.casa}|${c.fora}`;
            const prev = cbByKey.get(k);
            if (!prev) { cbByKey.set(k, { ...c, confirmed_at: new Date().toISOString() }); cbAdded++; }
            else if (Number(prev.gc) !== c.gc || Number(prev.gf) !== c.gf) {
              conflicts.push(k);
              console.error(`::warning::Conflito CB ${k}: gravado ${prev.gc}-${prev.gf} vs PDF ${c.gc}-${c.gf} (mantido o gravado)`);
            } else cbUnchanged++;
          }
          console.log(`Copa do Brasil: ${valid.length} jogo(s) de oitavas com placar no PDF.`);
        } catch (e) {
          console.error(`::warning::Copa do Brasil falhou: ${e.message}`);
        }
      }
    }
  }
  // Depois da trava de MAX_NEW_PER_RUN e de todos os blocos: se a execução abortasse,
  // gravar o cache faria as séries pularem a reextração na próxima vez.
  await savePdfCache(pdfCache);
  console.log(`Extrações via API: ${extracted}; séries puladas por cache: ${skippedCache}.`);

  const mergedCb = [...cbByKey.values()].sort((a, b) => `${a.fase}|${a.casa}`.localeCompare(`${b.fase}|${b.casa}`));
  const canonCb = (arr) => JSON.stringify(arr.map((r) => ({ fase: r.fase, casa: r.casa, fora: r.fora, gc: r.gc, gf: r.gf })));
  const cbChanged = canonCb(mergedCb) !== canonCb(existingCb);

  // Datas: o PDF é sempre a versão corrente, então substitui em bloco (não faz merge
  // com o existente — data removida do PDF deve sumir do overlay também). Só entra se
  // ao menos uma série respondeu, para uma falha de extração não zerar o que havia.
  const mergedDates = datesByKey.size
    ? [...datesByKey.values()].sort((a, b) => `${a.serie}|${String(a.rodada).padStart(2, '0')}|${a.casa}`.localeCompare(`${b.serie}|${String(b.rodada).padStart(2, '0')}|${b.casa}`))
    : existingDates;
  const canonD = (arr) => JSON.stringify(arr.map((d) => ({ serie: d.serie, rodada: d.rodada, casa: d.casa, fora: d.fora, data: d.data })));
  const datesChanged = canonD(mergedDates) !== canonD(existingDates);

  console.log(`Resumo: +${added} liga + ${koAdded} mata-mata D novos, ${unchanged + koUnchanged} iguais, ${skippedBuiltIn + koSkipped} já embutidos no app, ${conflicts.length} conflito(s), ${mergedDates.length} data(s) remarcada(s)${datesChanged ? ' (MUDOU)' : ''}, +${cbAdded} Copa BR nova(s) (${mergedCb.length} no total).`);
  if (canon(merged) === canon(existing) && canonKo(mergedKo) === canonKo(existingKo) && !datesChanged && !cbChanged) { console.log('Sem mudanças em results.json.'); return; }

  // last_run: quantos jogos ESTA execução acrescentou, para o selo do app mostrar o
  // delta em vez do acumulado. Só é escrito quando houve mudança (o return acima corta
  // execuções sem novidade), então ele sempre descreve a última atualização efetiva.
  // cb_added fica FORA de total_new enquanto o app nao consumir results.json.cb:
  // o selo anunciaria "+16 resultado(s)" que nao aparecem em lugar nenhum na UI.
  const lastRun = { at: new Date().toISOString(), added: added, ko_added: koAdded, total_new: added + koAdded, cb_added: cbAdded, dates: mergedDates.length, dates_changed: datesChanged };
  await writeFile(RESULTS_PATH, JSON.stringify({ schema: 2, updated_at: new Date().toISOString(), last_run: lastRun, results: merged, ko_d: mergedKo, cb: mergedCb, dates: mergedDates }, null, 2) + '\n', 'utf8');
  console.log(`results.json atualizado (${merged.length} resultado(s) de liga + ${mergedKo.length} perna(s) de mata-mata D + ${mergedDates.length} data(s) remarcada(s); last_run.total_new=${lastRun.total_new}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
