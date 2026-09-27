// Join entre os nomes de clube do app e a classificacao final de 2025 coletada da
// Wikipedia (eval/data/final_2025.json).
//
// Mesma regra do join com o RNC: o par e sempre (nome normalizado, UF). Aqui a armadilha e
// simetrica e mordeu na primeira tentativa — cortar o sufixo dos dois lados faz
// "Atletico-GO" e "Atletico-MG" colidirem em "atletico", e dois clubes da Serie B 2025
// apareceram como se tivessem vindo da Serie A. A UF NAO pode sair da chave.
//
// As fontes escrevem o mesmo clube de jeitos diferentes: a Wikipedia sufixa a UF
// ("Internacional-RS", "Vila Nova-GO") e usa nomes por extenso ("Gremio Novorizontino",
// "Ypiranga de Erechim"); o app usa a forma curta. O ALIAS abaixo cobre exatamente esses
// casos, um a um, sem heuristica de similaridade — casar por parecenca e como se produz um
// America-RJ virando America-MG.
const fs = require('fs');
const path = require('path');

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// nome da Wikipedia (normalizado, ja sem sufixo de UF) -> nome do app (normalizado)
const ALIAS = {
  'gremionovorizontino': 'novorizontino',
  'ypirangadeerechim': 'ypiranga',
  'athleticclub': 'athletic',
  'saobernardofutebolclube': 'saobernardo',
};

function partir(nome) {
  const m = /^(.*)-([A-Z]{2})$/.exec(nome);
  if (m) return { base: norm(m[1]), uf: m[2] };
  return { base: norm(nome), uf: null };
}

function chave(base, uf) {
  const b = ALIAS[base] || base;
  return uf ? b + '|' + uf : b;
}

// Constroi o indice a partir do final_2025.json. ufOfTeam vem do app e cobre os clubes
// cujo nome nao carrega sufixo (Flamengo -> RJ).
function construir(ufOfTeam, arquivo) {
  const p = arquivo || path.join(__dirname, '..', 'data', 'final_2025.json');
  if (!fs.existsSync(p)) return null;
  const dados = JSON.parse(fs.readFileSync(p, 'utf8'));

  const porChave = new Map();   // "base|UF" -> {serie, pos, P, ...}
  const porBase = new Map();    // "base" -> [registros]  (desempate por unicidade)
  for (const [serie, linhas] of Object.entries(dados.series)) {
    for (const l of linhas) {
      const { base, uf } = partir(l.nome);
      // A Wikipedia so sufixa a UF quando precisa desambiguar: "Botafogo-SP" leva sufixo,
      // o do Rio nao. Sem resolver a UF tambem deste lado, o Botafogo-RJ fica ambiguo
      // contra os outros dois e e rejeitado — o clube some da semente em silencio.
      const ufFinal = uf || (ufOfTeam ? ufOfTeam(l.nome) : null) || null;
      const reg = { ...l, serie, base: ALIAS[base] || base, uf: ufFinal };
      if (ufFinal) porChave.set(chave(base, ufFinal), reg);
      const b = ALIAS[base] || base;
      if (!porBase.has(b)) porBase.set(b, []);
      porBase.get(b).push(reg);
    }
  }

  return function resolver(nomeApp) {
    const { base, uf } = partir(nomeApp);
    const ufFinal = uf || (ufOfTeam ? ufOfTeam(nomeApp) : null) || null;
    if (ufFinal) {
      const hit = porChave.get(chave(base, ufFinal));
      if (hit) return hit;
    }
    // Sufixo EXPLICITO no nome do app e desambiguacao deliberada: sem par exato, o clube
    // esta ausente de 2025 e o fallback fica proibido. Sem essa trava, "Fluminense-PI"
    // casa com o Fluminense do Rio e "Vitoria-ES" com o Vitoria da Bahia — dois clubes da
    // Serie D 2026 herdariam a campanha de um clube da Serie A. Aconteceu; virou codigo.
    //
    // Ja uma UF apenas INFERIDA (ufOfTeam) nao carrega essa intencao, e travar nela
    // derrubava "Novorizontino" e "Ypiranga", cujos nomes de 2025 sao por extenso
    // ("Gremio Novorizontino", "Ypiranga de Erechim") e nao tem UF de onde inferir.
    if (uf) return null;
    // Sem sufixo explicito: aceita nome unico em todo o conjunto de 2025.
    const c = porBase.get(ALIAS[base] || base);
    if (c && c.length === 1) return c[0];
    return null;
  };
}

module.exports = { construir, norm, partir };
