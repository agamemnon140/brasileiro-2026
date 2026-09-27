// Estratégias de Elo inicial ("elos de partida").
//
// Por que isto é o braço mais importante do harness: no modo que o app roda (eo=false,
// ATK/DEF), calcL calcula λ só a partir de atk/def, e atk/def nascem de initLeague(elo).
// O Elo corrente evolui em trilho separado e NUNCA volta para λ. Logo o Elo inicial é o
// único canal pelo qual a força a priori de um clube entra na previsão — e kElo/homeAdv,
// que só mexem no Elo corrente, são inertes para previsão. Medido, não suposto:
// Brier idêntico até a 12ª casa com kElo de 4 a 64.
//
// Nota de escala: initLeague normaliza o alcance via targetRatio
// (rawSpread = log(targetRatio)/log(max/min)), então o que a semente transmite é a ORDEM e
// as distâncias RELATIVAS, não a amplitude absoluta. Por isso as variantes abaixo diferem
// na forma (linear, log, posição), não no intervalo escolhido.

const ELO_MIN = 1400, ELO_MAX = 1750;

function escalar(vals, lo = ELO_MIN, hi = ELO_MAX) {
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx === mn) return () => (lo + hi) / 2;
  return v => lo + (hi - lo) * (v - mn) / (mx - mn);
}

// Escada global da classificação de 2025: põe os clubes das quatro séries numa régua só.
// O degrau de 16 por divisão (A começa em 1, B em 17, C em 33, D em 49) faz as fronteiras
// se SOBREPOREM em 4 postos — que é o que o acesso e o rebaixamento afirmam: os 4
// promovidos da B valem aproximadamente os 4 rebaixados da A. Um degrau de 20 diria que o
// campeão da B é pior que o lanterna da A, o que a própria regra do campeonato desmente.
const DEGRAU = { A: 0, B: 16, C: 32, D: 48 };

function postoGlobal(reg) {
  if (!reg) return null;
  const d = DEGRAU[reg.serie];
  return d === undefined ? null : d + reg.pos;
}

// Constrói todas as sementes para um conjunto de clubes.
// rankingApp: objeto {time: {elo}} embutido no index.html
// resolver:   nome do app -> entrada do RNC (ou null)
// resolver25: nome do app -> classificação final de 2025 (ou null). Opcional: sem ele as
//             variantes ano_anterior* simplesmente não são oferecidas.
function construir(times, rankingApp, resolver, resolver25) {
  const rnc = times.map(t => resolver(t));
  const semRnc = times.filter((t, i) => !rnc[i]);

  // Piso para quem não tem RNC (clube sem competição nacional prévia): recebe o menor
  // valor observado no grupo, não a média — ausência de histórico é informação, e tratá-la
  // como "clube mediano" inventaria força que ninguém mediu.
  const pts = rnc.filter(Boolean).map(r => r.p);
  const piso = pts.length ? Math.min(...pts) : 51;
  const p = i => (rnc[i] ? rnc[i].p : piso);
  const s5 = i => (rnc[i] && rnc[i].s5 ? rnc[i].s5 : piso * 5);

  const idx = {}; times.forEach((t, i) => idx[t] = i);

  const mk = (fn) => {
    const vals = times.map((t, i) => fn(i));
    const esc = escalar(vals);
    const tab = {}; times.forEach((t, i) => tab[t] = esc(vals[i]));
    return t => (tab[t] !== undefined ? tab[t] : (ELO_MIN + ELO_MAX) / 2);
  };

  // === Ano anterior (2025) ===
  // Motivação medida: o RNC é memória de cinco anos e, nas divisões de baixo, é dominado
  // por clubes que caíram da A/B carregando pontuação antiga sem futebol atual — daí ele
  // ajudar a Série A e atrapalhar a C. A classificação do ano anterior é o sinal recente
  // que falta.
  const anoAnterior = {};
  const semAno25 = [];
  if (resolver25) {
    const reg25 = times.map(t => resolver25(t));
    times.forEach((t, i) => { if (!reg25[i]) semAno25.push(t); });
    const postos = reg25.map(postoGlobal).filter(x => x !== null);
    // Quem não jogou competição nacional em 2025 fica um degrau abaixo do pior posto
    // observado no grupo — ausência de histórico é informação, não motivo para medianizar.
    const pior = postos.length ? Math.max(...postos) : 64;
    const posto = i => (postoGlobal(reg25[i]) ?? pior + 1);

    anoAnterior.ano_anterior = mk(i => -posto(i));

    // Regressão à média: a campanha de um ano é ruidosa e superestima extremos.
    //
    // ATENÇÃO — encolher NÃO pode passar por mk(). mk() renormaliza para [ELO_MIN, ELO_MAX],
    // e encolher em direção ao centro é transformação afim: a renormalização a desfaz
    // exatamente, e k=0,25 sai idêntico a k=1. (Foi o que aconteceu na primeira versão: três
    // linhas com o mesmo Brier até a última casa.)
    //
    // Encolhendo com escala FIXA a coisa passa a morder, por um caminho indireto:
    // initLeague usa rawSpread = log(targetRatio)/log(max/min), capado em maxSpread. Com o
    // alcance cheio (1400–1750) isso dá 4,92 — logo abaixo do teto de 5. Qualquer
    // encolhimento empurra rawSpread acima do teto, o cap passa a valer, e o spread efetivo
    // de atk/def encolhe junto. Ou seja: o que a semente transmite de amplitude só existe
    // por causa desse teto.
    const centro25 = (ELO_MIN + ELO_MAX) / 2;
    const cheio = mk(i => -posto(i));
    const comRegressao = k => {
      const tab = {};
      times.forEach(t => tab[t] = centro25 + k * (cheio(t) - centro25));
      return t => (tab[t] !== undefined ? tab[t] : centro25);
    };
    anoAnterior.ano_anterior_reg50 = comRegressao(0.5);
    anoAnterior.ano_anterior_reg25 = comRegressao(0.25);
  }

  return {
    // status quo: os números atribuídos à mão no index.html
    atual: t => (rankingApp[t] ? rankingApp[t].elo : 1500),

    // hipótese nula: nenhuma opinião a priori
    iguais: () => 1500,

    // pontos do RNC, linear. Escala muito assimétrica (16314 no topo, 51 no piso):
    // achata todo mundo do meio para baixo.
    rnc_pontos: mk(i => p(i)),

    // log dos pontos — trata razão, não diferença. Espalha melhor a cauda.
    rnc_log: mk(i => Math.log(Math.max(1, p(i)))),

    // só a ordem, ignorando a magnitude. Imune a outlier no topo.
    rnc_posicao: mk(i => -(rnc[i] ? rnc[i].pos : 999)),

    // nível + tendência. p é a soma PONDERADA por recência (5·P25+…+1·P21) e s5 a soma
    // simples, logo p/s5 ∈ [1,5] é o "ano médio" da força do clube: alto = em ascensão,
    // baixo = vivendo de passado. Gratuito, já está no repo.
    rnc_recencia: mk(i => Math.log(Math.max(1, p(i))) * (1 + 0.15 * ((p(i) / s5(i)) - 3))),

    ...anoAnterior,

    __meta: { semRnc, piso, n: times.length, semAno25 },
  };
}

module.exports = { construir, escalar, postoGlobal, DEGRAU, ELO_MIN, ELO_MAX };
