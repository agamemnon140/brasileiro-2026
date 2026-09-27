// A confiabilidade que o modelo publica e ESTATISTICAMENTE boa? Testes formais, com numero
// e limiar, sobre os 10.800 pares (probabilidade prevista, desfecho) salvos por
// confianca.cjs. Nada aqui roda Monte Carlo de futebol — so reanalisa os pares.
//
// Tres testes complementares, porque cada um enxerga um defeito diferente:
//
// 1. Z DE SPIEGELHALTER. Hipotese nula: cada desfecho o_i ~ Bernoulli(p_i), ou seja, as
//    probabilidades sao exatamente o que dizem ser. O teste soma os residuos (o-p)
//    ponderados por (1-2p) — o peso que maximiza sensibilidade a ma calibracao — e
//    normaliza pela variancia sob H0. |Z| > 1,96 rejeita calibracao perfeita a 5%.
//
// 2. ECE CONTRA O PROPRIO NULO. O ECE observado nunca e zero, nem para um modelo perfeito:
//    com amostra finita, as frequencias por faixa flutuam. Entao "ECE = 2,5%" so significa
//    algo comparado com o ECE que um modelo PERFEITAMENTE calibrado produziria com estas
//    mesmas probabilidades e este mesmo n. Simulamos isso (o*_i ~ Bern(p_i), B vezes) e
//    reportamos o percentil do observado. Percentil < 95 = indistinguivel de perfeito.
//
// 3. WILSON POR FAIXA. Para cada faixa do diagrama, o IC95 (Wilson) da frequencia
//    observada. Se a media prevista da faixa cai dentro do IC, a faixa cumpre o contrato.
//    Reporta quantas cumprem — e uma leitura local, que os testes globais podem mascarar.
//
// CAVEAT DE DEPENDENCIA, obrigatorio: os pares nao sao independentes. Os desfechos de uma
// serie vem da MESMA tabela final (cortes diferentes, mesmo gabarito), e dentro de um
// (serie, evento) exatamente 4 dos 20 clubes terminam no top-4 — os desfechos se restringem
// mutuamente. Os tres testes assumem independencia, entao seus p-valores sao aproximados e
// tendem ao otimismo (n efetivo < n nominal). Por isso cada teste roda tambem numa fatia
// QUASE-INDEPENDENTE: um unico corte mediano por serie, que elimina a repeticao do gabarito
// entre cortes (resta a restricao dentro do evento). Conclusao que sobrevive nas duas
// versoes e conclusao; a que so aparece no conjunto cheio e artefato de n inflado.
//
// 4. TESTE DE SINAL modelo x tabela congelada (da grade de horizontes): transforma o
//    "34/35" em p-valor binomial exato. As celulas da grade compartilham jogos, entao vale o
//    mesmo caveat — mas com p ~ 1e-8 ha margem enorme para desconto de dependencia.
const fs = require('fs');
const path = require('path');

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Phi(z) por aproximacao de Zelen & Severo — sobra precisao para p-valores de relatorio.
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function spiegelhalter(pares) {
  let num = 0, varr = 0;
  for (const x of pares) {
    const w = 1 - 2 * x.p;
    num += (x.o - x.p) * w;
    varr += w * w * x.p * (1 - x.p);
  }
  const z = varr > 0 ? num / Math.sqrt(varr) : 0;
  return { z, pValor: 2 * (1 - phi(Math.abs(z))), n: pares.length };
}

function ece(pares, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ n: 0, sp: 0, so: 0 }));
  for (const x of pares) {
    const k = Math.min(nBins - 1, Math.floor(x.p * nBins));
    bins[k].n++; bins[k].sp += x.p; bins[k].so += x.o;
  }
  let acc = 0;
  for (const b of bins) if (b.n) acc += b.n * Math.abs(b.so / b.n - b.sp / b.n);
  return acc / pares.length;
}

// Distribuicao do ECE sob calibracao perfeita: o* ~ Bernoulli(p), B replicas.
function eceNulo(pares, { B = 2000, seed = 424242, nBins = 10 } = {}) {
  const rnd = mulberry(seed);
  const obs = ece(pares, nBins);
  const nulos = [];
  const copia = pares.map(x => ({ p: x.p, o: 0 }));
  for (let b = 0; b < B; b++) {
    for (const c of copia) c.o = rnd() < c.p ? 1 : 0;
    nulos.push(ece(copia, nBins));
  }
  nulos.sort((a, b) => a - b);
  const abaixo = nulos.filter(v => v < obs).length;
  return {
    observado: obs,
    nuloMedio: nulos.reduce((a, b) => a + b, 0) / B,
    nuloP95: nulos[Math.floor(0.95 * B)],
    percentil: abaixo / B,
  };
}

// IC de Wilson a 95% para proporcao observada de uma faixa.
function wilson(k, n) {
  const z = 1.96, ph = k / n;
  const den = 1 + z * z / n;
  const centro = (ph + z * z / (2 * n)) / den;
  const meio = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / den;
  return [centro - meio, centro + meio];
}

function faixasWilson(pares, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ n: 0, sp: 0, so: 0 }));
  for (const x of pares) {
    const k = Math.min(nBins - 1, Math.floor(x.p * nBins));
    bins[k].n++; bins[k].sp += x.p; bins[k].so += x.o;
  }
  const out = [];
  bins.forEach((b, k) => {
    if (!b.n) return;
    const prev = b.sp / b.n, obs = b.so / b.n;
    const [lo, hi] = wilson(b.so, b.n);
    out.push({
      faixa: `${(k / nBins * 100).toFixed(0)}-${((k + 1) / nBins * 100).toFixed(0)}%`,
      n: b.n, previsto: prev, observado: obs, icLo: lo, icHi: hi,
      cumpre: prev >= lo && prev <= hi,
    });
  });
  return out;
}

// p-valor binomial exato bicaudal para k sucessos em n sob p=0,5.
function testeSinal(k, n) {
  const logC = (n, k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1);
    return s;
  };
  const pm = j => Math.exp(logC(n, j) - n * Math.LN2);
  let cauda = 0;
  const pk = pm(k);
  for (let j = 0; j <= n; j++) if (pm(j) <= pk + 1e-15) cauda += pm(j);
  return Math.min(1, cauda);
}

function rodar() {
  const cj = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'confianca.json'), 'utf8'));
  if (!cj.pares) throw new Error('confianca.json sem pares brutos — rode node eval/confianca.cjs antes.');
  const pares = cj.pares.map(x => ({ ...x, p: Math.min(1 - 1e-9, Math.max(1e-9, x.p)) }));

  // Fatia quase-independente: um unico corte (o alcance ~mediano de cada serie ja nao esta
  // salvo por corte; usamos o alcance como proxy — pares de alcance unico por serie nao
  // repetem o gabarito). Melhor proxy disponivel nos dados salvos: para cada (serie, evento),
  // manter so os pares de UM alcance, o mais proximo de 5.
  const alvos = {};
  for (const x of pares) {
    const k = x.s + '|' + x.e;
    if (!(k in alvos) || Math.abs(x.a - 5) < Math.abs(alvos[k] - 5)) alvos[k] = x.a;
  }
  const fatia = pares.filter(x => alvos[x.s + '|' + x.e] === x.a);

  const grupos = {
    'todos os pares': pares,
    'fatia quase-independente (1 alcance por série/evento)': fatia,
  };
  for (const ev of ['lider', 'top4', 'ultimos4']) grupos[`evento: ${ev}`] = pares.filter(x => x.e === ev);

  const saida = { grupos: {} };
  for (const [nome, g] of Object.entries(grupos)) {
    saida.grupos[nome] = {
      spiegelhalter: spiegelhalter(g),
      ece: eceNulo(g),
      faixas: faixasWilson(g),
    };
  }

  // teste de sinal da grade de horizontes
  const hz = path.join(__dirname, 'out', 'horizonte.json');
  if (fs.existsSync(hz)) {
    const h = JSON.parse(fs.readFileSync(hz, 'utf8'));
    let k = 0, n = 0;
    for (const s of Object.values(h.series)) for (const p of s.pontos) {
      n++;
      if (p.modelo < p.congelada) k++;
    }
    saida.duelo = { vitorias: k, n, pValor: testeSinal(k, n) };
  }
  return saida;
}

if (require.main === module) {
  const r = rodar();
  console.log('=== Testes formais de calibracao ===\n');
  for (const [nome, g] of Object.entries(r.grupos)) {
    const s = g.spiegelhalter, e = g.ece;
    const cumpre = g.faixas.filter(f => f.cumpre).length;
    console.log(`-- ${nome} (n=${s.n}) --`);
    console.log(`  Spiegelhalter: Z = ${s.z.toFixed(2)}  p = ${s.pValor.toFixed(3)}  ` +
      `-> ${Math.abs(s.z) < 1.96 ? 'NAO rejeita calibracao perfeita' : 'REJEITA calibracao perfeita'}`);
    console.log(`  ECE: observado ${(e.observado * 100).toFixed(2)}%  |  sob calibracao perfeita: ` +
      `media ${(e.nuloMedio * 100).toFixed(2)}%, p95 ${(e.nuloP95 * 100).toFixed(2)}%  |  percentil do observado: ${(e.percentil * 100).toFixed(0)}`);
    console.log(`  Wilson: ${cumpre}/${g.faixas.length} faixas com o previsto dentro do IC95 do observado\n`);
  }
  if (r.duelo) {
    console.log(`-- duelo modelo x tabela congelada (grade de horizontes) --`);
    console.log(`  ${r.duelo.vitorias}/${r.duelo.n} celulas para o modelo  |  teste de sinal: p = ${r.duelo.pValor.toExponential(2)}`);
  }
  const dst = path.join(__dirname, 'out', 'teste_calibracao.json');
  fs.writeFileSync(dst, JSON.stringify(r, null, 1));
  console.log('\n-> ' + dst);
}

module.exports = { rodar, spiegelhalter, eceNulo, faixasWilson, testeSinal };
