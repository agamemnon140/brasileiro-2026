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

async function extractFromPdf(serie, pdfB64) {
  const body = {
    model: MODEL,
    max_tokens: 30000,
    system: 'Você extrai dados tabulares de PDFs oficiais com precisão absoluta. Nunca invente placares; transcreva apenas o que está no documento.',
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
        { type: 'text', text: buildPrompt(serie) },
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
  let txt = '';
  for (const b of data.content || []) if (b.type === 'text') txt += b.text;
  let t = txt.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch {}
  const m = t.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
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

async function main() {
  if (!API_KEY) { console.error('ANTHROPIC_API_KEY ausente.'); process.exit(1); }

  let existing = [];
  try {
    const raw = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
    existing = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
  } catch { existing = []; }
  const byKey = new Map();
  for (const r of existing) byKey.set(dedupKey(r), r);

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

  if (added > MAX_NEW_PER_RUN) {
    console.error(`::error::Adicionaria ${added} jogos (> ${MAX_NEW_PER_RUN}) — implausível para 1 semana. Abortando sem gravar.`);
    process.exit(1);
  }

  const merged = [...byKey.values()];
  const canon = (arr) => JSON.stringify(
    arr.map((r) => ({ serie: r.serie, casa: r.casa, fora: r.fora, gc: r.gc, gf: r.gf, rodada: r.rodada }))
       .sort((a, b) => dedupKey(a).localeCompare(dedupKey(b)))
  );
  console.log(`Resumo: +${added} novos, ${unchanged} iguais, ${skippedBuiltIn} já embutidos no app, ${conflicts.length} conflito(s).`);
  if (canon(merged) === canon(existing)) { console.log('Sem mudanças em results.json.'); return; }

  await writeFile(RESULTS_PATH, JSON.stringify({ schema: 1, updated_at: new Date().toISOString(), results: merged }, null, 2) + '\n', 'utf8');
  console.log(`results.json atualizado (${merged.length} resultado(s)).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
