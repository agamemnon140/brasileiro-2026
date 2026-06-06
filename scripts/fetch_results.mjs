// fetch_results.mjs — busca resultados FINALIZADOS do Brasileirão 2026 via API do
// Claude com web_search e escreve em ../results.json (lido pelo app no load).
// Node 20+ (fetch global). Rodado pela GitHub Action update-results.yml.
//
// Travas de confiabilidade (busca web pode alucinar placar):
//  1. allowlist de times (nomes canônicos do app, via normName) — descarta o resto
//  2. faixa de placar 0..14 inteiros
//  3. exige source http(s)
//  4. NUNCA sobrescreve placar já gravado — registra conflito e mantém o original
//  5. teto de jogos novos por execução (aborta se implausível)
// O app (handleSearchResults) re-valida tudo, então o pior caso de um placar
// alucinado é 1 linha extra, visível no diff e reversível.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, '..', 'results.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const MAX_NEW_PER_RUN = 60; // teto de segurança (4 séries × várias rodadas)

// ---------------------------------------------------------------------------
// Listas canônicas de times (extraídas de SA/SB/SC_RANKING e SD_TD do app) +
// o mapa normName do app. Mantêm a allowlist e a normalização em sincronia com
// o que o app aceita. Se o app mudar os nomes, atualize aqui.
// ---------------------------------------------------------------------------
const TEAMS = {
  A: ["Flamengo","Palmeiras","Cruzeiro","Mirassol","Fluminense","Botafogo","Bahia","São Paulo","Internacional","Grêmio","Atlético-MG","Santos","Corinthians","Vasco","Red Bull Bragantino","Vitória","Coritiba","Athletico-PR","Chapecoense","Remo"],
  B: ["Fortaleza","Ceará","Sport","Juventude","Criciúma","Goiás","Novorizontino","CRB","Avaí","Cuiabá","Atlético-GO","Operário-PR","Vila Nova","América-MG","Athletic","Botafogo-SP","Ponte Preta","Londrina","Náutico","São Bernardo"],
  C: ["Ferroviária","Amazonas","Volta Redonda","Paysandu","Caxias","Brusque","Guarani","Floresta","Confiança","Ypiranga","Maringá","Ituano","Botafogo-PB","Figueirense","Anápolis","Itabaiana","Inter de Limeira","Barra","Maranhão","Santa Cruz"],
  D: ["CSA","Tombense","ABC","Retrô","Ferroviário","América-RN","Manaus","Águia de Marabá","Brasil-RS","Sousa","Tocantinópolis","ASA","Porto Velho","Trem","Sergipe","Tuna Luso","Maracanã","Cianorte","Operário-MS","Jacuipense","Capital","Fluminense-PI","São Luiz-RS","Azuriz","Rio Branco-ES","GAS","Guarany de Bagé","Mixto","Portuguesa-SP","Atlético-BA","Lagarto","CSE","Independência","Joinville","CRAC","Uberlândia","Imperatriz","Democrata GV","Vitória-ES","Nacional-AM","XV de Piracicaba","São Joseense","Oratório","Madureira","Gama","Galvez","Noroeste","Velo Clube","Sampaio Corrêa-RJ","Betim","Tirol","ABECAT","Inhumas","Porto","Santa Catarina","Decisão","Maguary","Primavera","Serra Branca","IAPE","Piauí","Guaporé","Monte Roraima","Ivinhema","Laguna","America-RJ","Araguaína","Blumenau","Sampaio Corrêa","Aparecidense","São José-RS","Altos","FC Cascavel","Ceilândia","Juazeirense","Manauara","Água Santa","Marcílio Dias","Central","Goiatuba","Luverdense","Maricá","Nova Iguaçu","Brasiliense","Pouso Alegre","Portuguesa-RJ","Humaitá","São Raimundo-RR","Iguatu","União-MT","Real Noroeste","Treze","Atlético-CE","Operário-MT","Moto Club","Parnahyba"],
};

const NORM_NAME = {
  "Atletico-MG":"Atlético-MG","Atletico Mineiro":"Atlético-MG","Atletico-GO":"Atlético-GO","Atletico Goianiense":"Atlético-GO","Athletico Paranaense":"Athletico-PR","Athletico PR":"Athletico-PR","RB Bragantino":"Red Bull Bragantino","Bragantino":"Red Bull Bragantino","Sao Paulo":"São Paulo","Sao Bernardo":"São Bernardo","Gremio":"Grêmio","Avai":"Avaí","Cuiaba":"Cuiabá","Goias":"Goiás","America-MG":"América-MG","America Mineiro":"América-MG","Nautico":"Náutico","Criciuma":"Criciúma","Operario-PR":"Operário-PR","Botafogo SP":"Botafogo-SP","Botafogo PB":"Botafogo-PB","Grêmio Novorizontino":"Novorizontino","Vasco da Gama":"Vasco","Atletico-CE":"Atlético-CE",
};

const SETS = Object.fromEntries(Object.entries(TEAMS).map(([k, v]) => [k, new Set(v)]));
const norm = (n) => NORM_NAME[(n || '').trim()] || (n || '').trim();

// ---------------------------------------------------------------------------
function dedupKey(r) {
  return `${r.serie}|${norm(r.casa).toLowerCase()}|${norm(r.fora).toLowerCase()}`;
}

function buildPrompt(serie) {
  const teams = TEAMS[serie].join(', ');
  return [
    `Use a busca web para encontrar jogos FINALIZADOS (com placar final) da Série ${serie}`,
    `do Campeonato Brasileiro 2026, que já foram disputados até ontem.`,
    `Priorize fontes confiáveis: ge.globo.com, espn.com.br, cbf.com.br, sofascore.com.`,
    `Use EXATAMENTE estes nomes oficiais de times: ${teams}.`,
    `Para cada jogo finalizado retorne: serie, rodada (número), casa, gc (gols do mandante),`,
    `gf (gols do visitante), fora e source (URL da fonte que você usou).`,
    `Responda APENAS com um array JSON, nada mais, no formato:`,
    `[{"serie":"${serie}","rodada":18,"casa":"...","gc":0,"gf":0,"fora":"...","source":"https://..."}]`,
    `Se não houver jogos finalizados confirmáveis, responda [].`,
  ].join(' ');
}

async function callClaude(serie) {
  const body = {
    model: MODEL,
    max_tokens: 8000,
    system: 'Você extrai resultados esportivos. Só reporte um placar que você confirme em uma fonte web citada. Nunca invente um placar; na dúvida, omita o jogo.',
    tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    messages: [{ role: 'user', content: buildPrompt(serie) }],
  };

  // server-side web_search pode pausar (pause_turn) — continua até no máx. 4 voltas.
  let messages = body.messages;
  for (let i = 0; i < 4; i++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, messages }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`API ${resp.status} (série ${serie}): ${t.slice(0, 300)}`);
    }
    const data = await resp.json();
    if (data.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: data.content }];
      continue;
    }
    let txt = '';
    for (const b of data.content || []) if (b.type === 'text') txt += b.text;
    return txt;
  }
  return '';
}

function parseArray(txt) {
  let t = (txt || '').replace(/```json\s*/g, '').replace(/```/g, '').trim();
  try {
    const a = JSON.parse(t);
    if (Array.isArray(a)) return a;
  } catch {}
  const m = t.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return [];
}

// Trava as candidatas de uma série: nomes canônicos, placar válido, fonte http.
function sanitize(serie, rows) {
  const out = [];
  for (const r of rows || []) {
    const casa = norm(r.casa), fora = norm(r.fora);
    const gc = Number(r.gc), gf = Number(r.gf);
    const set = SETS[serie];
    if (!set) continue;
    if (!set.has(casa) || !set.has(fora)) continue;            // allowlist
    if (casa === fora) continue;
    if (!Number.isInteger(gc) || !Number.isInteger(gf)) continue;
    if (gc < 0 || gc > 14 || gf < 0 || gf > 14) continue;       // faixa de placar
    if (!/^https?:\/\//i.test(String(r.source || ''))) continue; // exige fonte
    out.push({
      serie,
      rodada: Number.isInteger(Number(r.rodada)) ? Number(r.rodada) : undefined,
      casa, gc, gf, fora,
      source: String(r.source),
    });
  }
  return out;
}

async function main() {
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY ausente.');
    process.exit(1);
  }

  // Lê results.json existente (array puro ou envelope {results:[...]})
  let existing = [];
  try {
    const raw = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
    existing = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
  } catch { existing = []; }

  const byKey = new Map();
  for (const r of existing) byKey.set(dedupKey(r), r);

  const conflicts = [];
  let added = 0, unchanged = 0;

  for (const serie of ['A', 'B', 'C', 'D']) {
    let candidates = [];
    try {
      candidates = sanitize(serie, parseArray(await callClaude(serie)));
    } catch (e) {
      console.error(`::warning::Série ${serie} falhou: ${e.message}`);
      continue;
    }
    console.log(`Série ${serie}: ${candidates.length} candidata(s) válida(s).`);
    for (const c of candidates) {
      const k = dedupKey(c);
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { ...c, confirmed_at: new Date().toISOString() });
        added++;
      } else if (Number(prev.gc) !== c.gc || Number(prev.gf) !== c.gf) {
        // placar diferente do já gravado: NÃO sobrescreve — registra conflito.
        conflicts.push({ key: k, gravado: `${prev.gc}-${prev.gf}`, novo: `${c.gc}-${c.gf}`, source: c.source });
        console.error(`::warning::Conflito ${k}: gravado ${prev.gc}-${prev.gf} vs novo ${c.gc}-${c.gf} (mantido o gravado)`);
      } else {
        unchanged++;
      }
    }
  }

  if (added > MAX_NEW_PER_RUN) {
    console.error(`::error::Adicionaria ${added} jogos (> ${MAX_NEW_PER_RUN}) — provável erro da busca. Abortando sem gravar.`);
    process.exit(1);
  }

  const merged = [...byKey.values()];
  // Detecta mudança comparando só o conjunto de resultados (ignora updated_at).
  const canon = (arr) => JSON.stringify(
    arr.map((r) => ({ serie: r.serie, casa: r.casa, fora: r.fora, gc: r.gc, gf: r.gf, rodada: r.rodada }))
       .sort((a, b) => dedupKey(a).localeCompare(dedupKey(b)))
  );
  const changed = canon(merged) !== canon(existing);

  console.log(`Resumo: +${added} novos, ${unchanged} iguais, ${conflicts.length} conflito(s).`);
  if (!changed) {
    console.log('Sem mudanças em results.json.');
    return;
  }

  const envelope = {
    schema: 1,
    updated_at: new Date().toISOString(),
    results: merged,
  };
  await writeFile(RESULTS_PATH, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
  console.log(`results.json atualizado (${merged.length} resultado(s)).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
