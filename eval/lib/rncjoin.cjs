// Join entre os nomes de clube do app e a tabela RNC_2026 (235 clubes).
//
// Regra do repo, herdada do pipeline rnc_data: o par é sempre (nome normalizado, UF).
// Com a UF conhecida e sem par, o clube está AUSENTE — nunca se casa por nome solto, que
// é exatamente como "América-RJ" viraria "América-MG" (há três Operário, cinco Atlético,
// dois Rio Branco, dois Primavera).
//
// Duas diferenças de formato entre as fontes, ambas tratadas aqui:
//   1. o app sufixa a UF no nome ("América-RN"); o RNC guarda "América" + u:"RN"
//   2. alguns nomes divergem por extenso ("Vasco" vs "Vasco da Gama")

const ALIAS = {
  'vasco': 'vascodagama',
  'saobernardo': 'saobernardofc',
  'redbullbragantino': 'bragantino',
};

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// "América-RN" -> {base:'america', uf:'RN'};  "Flamengo" -> {base:'flamengo', uf:null}
function partir(nome) {
  const m = /^(.*)-([A-Z]{2})$/.exec(nome);
  return m ? { base: norm(m[1]), uf: m[2] } : { base: norm(nome), uf: null };
}

function construir(RNC, ufOfTeam) {
  const porNomeUf = new Map();
  const porNome = new Map();
  for (const r of RNC) {
    const b = norm(r.n);
    porNomeUf.set(b + '|' + r.u, r);
    if (!porNome.has(b)) porNome.set(b, []);
    porNome.get(b).push(r);
  }
  // resolve um nome do app -> entrada do RNC, ou null
  return function resolver(nome) {
    const { base, uf } = partir(nome);
    const ufFinal = uf || ufOfTeam(nome) || null;
    // O RNC conserva o sufixo em parte dos nomes ("Atlético-MG", "América-MG"), então o
    // nome INTEIRO tem de ser tentado antes de partir o sufixo — senão Atlético-MG cai no
    // balaio dos cinco "Atlético" e é rejeitado por homonímia.
    const inteiro = norm(nome);
    const cands = [inteiro, ALIAS[inteiro], base, ALIAS[base]].filter(Boolean);
    for (const b of cands) {
      if (ufFinal && porNomeUf.has(b + '|' + ufFinal)) return porNomeUf.get(b + '|' + ufFinal);
    }
    // sem UF conhecida, só aceita nome único no RNC inteiro
    for (const b of cands) {
      const c = porNome.get(b);
      if (!ufFinal && c && c.length === 1) return c[0];
    }
    return null;
  };
}

module.exports = { construir, norm, partir };
