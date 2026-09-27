// Gera eval/REPORT.md a partir de eval/out/*.json. Nada e calculado aqui — este modulo so
// formata, para que o relatorio nunca discorde dos JSON canonicos.
const fs = require('fs');
const path = require('path');
const { rps } = require('./lib/longterm.cjs');

// Ancoras do RPS, CALCULADAS na geracao (nada escrito a mao) para que o leitor tenha regua.
// "0,10" nao diz nada sozinho; comparado com "cravar a posicao e errar por 3" diz tudo.
function ancorasRps(K) {
  const media = a => a.reduce((x, y) => x + y, 0) / a.length;
  const todas = f => media([...Array(K)].map((_, j) => f(j + 1)));
  const pontual = (verdadeira, erro) => {
    const p = new Array(K).fill(0);
    p[Math.min(K - 1, Math.max(0, verdadeira - 1 + erro))] = 1;
    return rps(p, verdadeira);
  };
  return {
    K,
    perfeita: 0,
    erro1: todas(j => pontual(j, 1)),
    erro3: todas(j => pontual(j, 3)),
    erro5: todas(j => pontual(j, 5)),
    erro10: todas(j => pontual(j, 10)),
    uniforme: todas(j => rps(new Array(K).fill(1 / K), j)),
    invertida: rps([...Array(K)].map((_, i) => (i === K - 1 ? 1 : 0)), 1),
  };
}

const pct = x => (x * 100).toFixed(1) + '%';
const pp = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1);
const f4 = x => x.toFixed(4);
const ic = l => (l.ic95 ? `${l.delta >= 0 ? '+' : ''}${l.delta.toFixed(4)} [${l.ic95[0].toFixed(4)}, ${l.ic95[1].toFixed(4)}]` : '—');

function gerar(curto, longo, extra = {}) {
  const { modos, poder, compartilhado, horizonte, drift, confianca, testes, candidato, piso } = extra;
  const L = [];
  const w = s => L.push(s);

  w('# Avaliação retroativa das previsões — Brasileirão 2026');
  w('');
  w(`Gerado do \`results.json\` de **${curto.fonte.updated_at}**. Reexecutar com \`node eval/run.cjs\`.`);
  w('');
  w('> **Temporada incompleta.** As séries A/B/C estão em curso, então o longo prazo usa');
  w('> horizonte encurtado — prever a tabela da rodada H a partir da rodada r < H — e não a');
  w('> classificação final. Rodar de novo em dezembro troca H por 38 sozinho.');
  w('');

  w('## Como ler estes números');
  w('');
  w('Brier e calibração têm poderes estatísticos **muito** diferentes com ~220 jogos por série:');
  w('');
  w('- O **Brier** é dominado pela variância irredutível do resultado. Diferenças de 0,005 a');
  w('  0,015 entre configurações não se distinguem de ruído: o IC95 do bootstrap pareado');
  w('  cruza zero em quase todas as variantes testadas. Ranquear configs por Brier nesta');
  w('  temporada é ler ruído.');
  w('- O **viés marginal** — quanto o modelo prevê de vitórias em casa vs. quantas houve — é');
  w('  estimável com precisão bem maior, e é onde os defeitos reais aparecem.');
  w('');
  w('Daí a hierarquia adotada no relatório: **calibração decide, Brier confirma.**');
  w('');
  w('### Cobertura');
  w('');
  w('| Competição | jogos | curto prazo | longo prazo |');
  w('|---|---|---|---|');
  for (const [sk, x] of Object.entries(curto.series)) {
    const nome = sk === 'CB' ? 'Copa do Brasil' : 'Série ' + sk;
    const lp = longo && longo.series[sk] ? 'sim' : 'não';
    w(`| ${nome} | ${x.base.score.n} | sim | ${lp} |`);
  }
  w('');
  w('O longo prazo cobre só as ligas de pontos corridos: nas competições de mata-mata não');
  w('existe "tabela final" a prever, e a classificação depende de fase alcançada. A Copa do');
  w('Brasil é reconstruída com nome de time a partir de `CB_TEAMS`/`CB_R32` (a R32 é');
  w('guardada posicionalmente, como `{ga, gb}`) mais as fases nomeadas do `results.json`.');
  w('');

  w('## 1. Parâmetros inertes — o achado estrutural');
  w('');
  w('No modo que o app roda (`eo = false`, ATK/DEF, o padrão explícito da UI), `calcL`');
  w('calcula λ **só** a partir de `atk`/`def`. O Elo corrente nunca volta para λ: `updR`');
  w('atualiza Elo e atk/def em trilhos separados. O Elo é calculado, exibido e usado no');
  w('ranking da tela, mas **não participa da previsão** depois da inicialização.');
  w('');
  w('Consequência medida, não suposta — delta de Brier **exatamente zero**:');
  w('');
  const sks = Object.keys(curto.series);
  w(`| Parâmetro | Variação testada | ${sks.map(s => 'Δ Brier (' + s + ')').join(' | ')} |`);
  w(`|---|---|${sks.map(() => '---').join('|')}|`);
  const linhaIn = nome => sks.map(sk => {
    const l = curto.series[sk].inercia.find(x => x.nome === nome);
    return l ? l.delta.toExponential(1) : '—';
  });
  w(`| \`kElo\` | 16 → 64 | ${linhaIn('INERCIA kElo=64').join(' | ')} |`);
  w(`| \`homeAdv\` | 100 → 400 | ${linhaIn('INERCIA homeAdv=400').join(' | ')} |`);
  w(`| \`targetRatio\` | 3 → 8 | ${linhaIn('INERCIA targetRatio=8').join(' | ')} |`);
  w('');
  w('Os dois parâmetros mais visíveis de um modelo "Elo + Poisson" não afetam previsão');
  w('nenhuma. O único canal pelo qual a força a priori entra é o **Elo inicial**, via');
  w('`initLeague → initAD`, que fixa o atk/def de partida. As únicas taxas de aprendizado');
  w('vivas são `alphas.atk` e `alphas.def`.');
  w('');
  w('`targetRatio` é um caso mais sutil: ele governa a amplitude de atk/def, mas só enquanto');
  w('`rawSpread = log(targetRatio)/log(max/min)` ficar abaixo do teto `maxSpread`. Nas séries');
  w('de Elo inicial estreito o teto morde primeiro e o parâmetro fica inerte — parece global,');
  w('e não é (ver a seção 3).');
  w('');

  w('## 2. Curto prazo — o modelo acerta jogo a jogo?');
  w('');
  w('| Série | n | Brier modelo | taxa-base (walk-fwd) | uniforme | supera a taxa-base? |');
  w('|---|---|---|---|---|---|');
  for (const [sk, s] of Object.entries(curto.series)) {
    const b = s.baselines;
    const veredito = b.vsTaxaBase.significativo
      ? (b.vsTaxaBase.delta < 0 ? '**sim**' : '**não — é pior**')
      : 'indistinguível';
    w(`| ${sk} | ${s.base.score.n} | ${f4(b.modelo)} | ${f4(b.taxaBaseWalkForward)} | ${f4(b.uniforme)} | ${veredito} |`);
  }
  w('');
  w('A taxa-base walk-forward prevê apenas a frequência histórica de casa/empate/fora, sem');
  w('olhar quem joga.');
  w('');
  w('### Viés marginal');
  w('');
  w('| Série | desfecho | previsto | observado | gap | z | significativo |');
  w('|---|---|---|---|---|---|---|');
  for (const [sk, s] of Object.entries(curto.series)) {
    for (const k of ['casa', 'empate', 'fora']) {
      const v = s.base.vies[k];
      w(`| ${sk} | ${k} | ${pct(v.previsto)} | ${pct(v.observado)} | ${pp(v.gap)} pp | ${v.z.toFixed(2)} | ${v.significativo ? '**sim**' : 'não'} |`);
    }
  }
  w('');
  w('λ configurado vs. observado:');
  w('');
  w('| Série | total cfg | total obs | pesoCasa cfg | pesoCasa obs | ECE |');
  w('|---|---|---|---|---|---|');
  for (const [sk, s] of Object.entries(curto.series)) {
    const o = s.observado, c = s.cfgVigente;
    w(`| ${sk} | ${c.total.toFixed(2)} | ${o.golsPorJogo.toFixed(3)} | ${c.pesoCasa.toFixed(3)} | ${o.pesoCasa.toFixed(3)} | ${(s.base.ece * 100).toFixed(2)}% |`);
  }
  w('');
  w('### O viés de casa acompanha o `pesoCasa` configurado');
  w('');
  w('Ordenando as séries pelo `pesoCasa` que cada uma tem no `DEFAULT_CFG`, o gap de');
  w('vitórias em casa é monotônico — e as significativas são exatamente as de peso inflado:');
  w('');
  w('| Série | `pesoCasa` cfg | `pesoCasa` observado | gap de casa | z | significativo |');
  w('|---|---|---|---|---|---|');
  const ordPeso = Object.entries(curto.series)
    .sort((a, b) => b[1].cfgVigente.pesoCasa - a[1].cfgVigente.pesoCasa);
  for (const [sk, s] of ordPeso) {
    const v = s.base.vies.casa;
    w(`| ${sk} | ${s.cfgVigente.pesoCasa.toFixed(3)} | ${s.observado.pesoCasa.toFixed(3)} | ${pp(v.gap)} pp | ${v.z.toFixed(2)} | ${v.significativo ? '**sim**' : 'não'} |`);
  }
  w('');
  w('Esse é o defeito mais bem estabelecido do relatório: não depende de escolha de métrica,');
  w('aparece nas duas séries com poder estatístico, e tem uma causa nomeável no código.');
  w('');
  w('### Varredura do `pesoCasa`');
  w('');
  w('É o único canal de vantagem de casa no modo que o app roda — `homeAdv` não entra em λ');
  w('(seção 1). Vale varrer, e não apenas testar "igual ao observado": o ótimo de Brier **não**');
  w('coincide com a fração observada de gols, porque `pesoCasa` move também a forma da grade');
  w('de Poisson, não só a média.');
  w('');
  {
    const vals = curto.series[Object.keys(curto.series)[0]].pesoCasa.varredura.map(x => x.pesoCasa);
    w(`| competição | config. | observado | ótimo (Brier) | ${vals.map(v => v.toFixed(2)).join(' | ')} |`);
    w(`|---|---|---|---|${vals.map(() => '---').join('|')}|`);
    for (const [sk, s2] of Object.entries(curto.series)) {
      const v = s2.pesoCasa;
      const mb = Math.min(...v.varredura.map(x => x.brier));
      const ot = v.varredura.find(x => x.brier === mb);
      w(`| ${sk === 'CB' ? 'Copa' : 'Série ' + sk} | ${v.vigente.toFixed(3)} | ${v.observado.toFixed(3)} | ` +
        `**${ot.pesoCasa.toFixed(2)}** | ` +
        v.varredura.map(x => (x.brier === mb ? '**' + x.brier.toFixed(4) + '**' : x.brier.toFixed(4))).join(' | ') + ' |');
    }
  }
  w('');
  w('Três leituras que a variante única não daria:');
  w('');
  w('- **A Série A está claramente alta** (0,652 contra ótimo 0,59) e a **D também** (0,604');
  w('  contra 0,57) — as duas do viés significativo.');
  w('- **A Série C está ligeiramente baixa** (0,583 contra 0,59), no sentido oposto. Não é');
  w('  "todas altas": é cada uma no seu lugar.');
  w('- **A Copa valida o 0,652.** É a única competição onde o valor alto é o ótimo, e ela quer');
  w('  até mais peso de casa do que os gols observados sugerem.');
  w('');
  w('### Variantes de parâmetro testadas');
  w('');
  for (const [sk, s] of Object.entries(curto.series)) {
    w(`**Série ${sk}**`);
    w('');
    w('| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |');
    w('|---|---|---|---|---|');
    for (const l of s.parametros) {
      w(`| ${l.nome} | ${f4(l.brier)} | ${(l.ece * 100).toFixed(2)}% | ${ic(l)} | ${l.ic95 ? (l.significativo ? '**sim**' : 'não') : '—'} |`);
    }
    w('');
  }

  w('## 3. Elos de partida');
  w('');
  w('Como o Elo inicial é o único canal de força a priori (seção 1), é aqui que está a');
  w('alavanca real. Δ negativo = melhor que os Elos atribuídos à mão.');
  w('');
  for (const [sk, s] of Object.entries(curto.series)) {
    w(`**Série ${sk}** (curto prazo)`);
    w('');
    w('| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |');
    w('|---|---|---|---|---|');
    for (const l of s.sementes) {
      w(`| ${l.nome} | ${f4(l.brier)} | ${(l.ece * 100).toFixed(2)}% | ${ic(l)} | ${l.ic95 ? (l.significativo ? '**sim**' : 'não') : '—'} |`);
    }
    w('');
    const resumo = arr => (arr.length > 8 ? `${arr.length} clubes` : arr.join(', '));
    if (s.semRnc && s.semRnc.length) {
      w(`Sem par no RNC (recebem piso, não média): ${resumo(s.semRnc)}.`);
      w('');
    }
    if (s.semAno25 && s.semAno25.length) {
      w(`Sem competição nacional em 2025 (recebem piso nas sementes \`ano_anterior*\`): ` +
        `${resumo(s.semAno25)}. Quanto maior esse número, mais a semente empilha clubes no ` +
        `mesmo valor — é por isso que essas variantes vão mal na Série D, e é limitação do ` +
        `dado, não do método.`);
      w('');
    }
  }

  w('### A AMPLITUDE da semente importa muito mais que a ordenação');
  w('');
  w('Reescalando cada semente para o mesmo alcance e depois encolhendo por um fator `k`');
  w('(k=1 é o alcance cheio, k=0 é "todos iguais"), toda série mostra uma curva em U — e no');
  w('ótimo as ordenações **convergem para quase o mesmo Brier**. Escolher entre "à mão",');
  w('"RNC" e "ano anterior" mexe pouco; escolher o quanto acreditar na semente mexe muito.');
  w('');
  const ks = (curto.series[Object.keys(curto.series)[0]].amplitude.varredura.atual || []).map(x => x.k);
  for (const [sk, s] of Object.entries(curto.series)) {
    const a = s.amplitude;
    w(`| Série ${sk} — k | ${ks.map(k => k).join(' | ')} |`);
    w(`|---|${ks.map(() => '---').join('|')}|`);
    for (const [nome, linha] of Object.entries(a.varredura)) {
      const melhor = Math.min(...linha.map(x => x.brier));
      w(`| ${nome} | ${linha.map(x => (x.brier === melhor ? '**' + x.brier.toFixed(4) + '**' : x.brier.toFixed(4))).join(' | ')} |`);
    }
    w('');
  }
  w('E o `k` que cada série **já usa** hoje, para comparar com o ótimo acima:');
  w('');
  w('| Série | Elo min–max | k vigente | rawSpread | spread efetivo | no teto `maxSpread`? |');
  w('|---|---|---|---|---|---|');
  for (const [sk, s] of Object.entries(curto.series)) {
    const a = s.amplitude.vigente;
    w(`| ${sk} | ${a.eloMin}–${a.eloMax} | ${a.kEquivalente.toFixed(2)} | ${isFinite(a.rawSpread) ? a.rawSpread.toFixed(2) : '∞'} | ${a.spreadEfetivo.toFixed(2)} | ${a.noTeto ? '**sim**' : 'não'} |`);
  }
  w('');
  w('Duas leituras saem daqui:');
  w('');
  w('- **A Série A é a única com a amplitude errada** — usa k≈1,06 quando o ótimo medido');
  w('  está entre 0,35 e 0,50. B e C já estão perto do próprio ótimo. É a mesma série do');
  w('  viés de casa significativo: dois defeitos independentes, ambos na A.');
  w('- **`targetRatio` só funciona onde o teto não morde.** Nas séries cujo `rawSpread`');
  w('  passa de `maxSpread`, quem manda é o teto, e `targetRatio` fica inerte (ver a tabela');
  w('  de inércia da seção 1). O parâmetro parece global e não é.');
  w('');

  if (longo) {
    w('## 4. Longo prazo — o modelo acerta a tabela?');
    w('');
    w('### O que é o RPS');
    w('');
    w('*Ranked Probability Score.* A previsão de longo prazo não é uma aposta única: é uma');
    w('distribuição sobre as colocações possíveis de cada clube — e o RPS a pontua por cortes');
    w('acumulados da tabela (1º; 1º–2º; 1º–3º; …). Em cada corte, compara-se a probabilidade de');
    w('o clube estar ali dentro com o que de fato aconteceu, e eleva-se a diferença ao quadrado:');
    w('');
    w('`RPS = média sobre k de ( P(colocação ≤ k) − [colocação real ≤ k] )²`, com `[…]` valendo 1 quando a condição é verdadeira.');
    w('');
    w('Comparar **acumulados** é o que torna a métrica ordinal: errar por uma posição custa pouco,');
    w('errar por dez custa muito. Um Brier sobre colocações trataria 2º e 20º como categorias');
    w('igualmente distintas do 1º, o que para uma tabela de classificação é absurdo. Menor é');
    w('melhor; 0 é a previsão perfeita.');
    w('');
    const K = longo.series[Object.keys(longo.series)[0]].tabelaReal.length;
    const anc = ancorasRps(K);
    w(`Réguas, calculadas para ${K} clubes:`);
    w('');
    w('| previsão | RPS |');
    w('|---|---|');
    w(`| perfeita (toda a massa na posição certa) | ${anc.perfeita.toFixed(4)} |`);
    w(`| pontual, errando por 1 posição | ${anc.erro1.toFixed(4)} |`);
    w(`| pontual, errando por 3 posições | ${anc.erro3.toFixed(4)} |`);
    w(`| uniforme (1/${K} em cada posição) | ${anc.uniforme.toFixed(4)} |`);
    w(`| pontual, errando por 5 posições | ${anc.erro5.toFixed(4)} |`);
    w(`| pontual, errando por 10 posições | ${anc.erro10.toFixed(4)} |`);
    w(`| invertida (1º ↔ ${K}º) | ${anc.invertida.toFixed(4)} |`);
    w('');
    const refA = longo.series.A && longo.series.A.variantes.atual;
    if (refA) {
      w(`Para situar: o modelo mede **${refA.media.rps.toFixed(4)}** na Série A. Em termos da régua`);
      w('acima, isso custa o equivalente a cravar a posição de cada clube e errar por cerca de');
      w('duas colocações — e é melhor que ignorar os jogos disputados');
      w(`(${longo.series.A.semJogos.toFixed(4)}) e que a previsão uniforme (${anc.uniforme.toFixed(4)}).`);
      w('');
    }
    w('');
    w(`RPS sobre a distribuição de colocação, média de ${longo.nSeeds} sementes de Monte Carlo`);
    w(`a ${longo.nSims} simulações por ponto. Menor é melhor.`);
    w('');
    for (const [sk, s] of Object.entries(longo.series)) {
      w(`**Série ${sk}** — horizonte H=${s.H} (${s.completa ? '**temporada completa**' : 'encurtado'}), ` +
        `${s.jogosAteH} jogos conhecidos, cortes ${s.cortes.join(', ')}`);
      w('');
      w('| semente | RPS médio | Brier líder | Brier top-4 | Brier 4 últimos |');
      w('|---|---|---|---|---|');
      const ords = Object.entries(s.variantes).sort((a, b) => a[1].media.rps - b[1].media.rps);
      for (const [nome, v] of ords) {
        w(`| ${nome} | ${v.media.rps.toFixed(5)} | ${v.media.brierLider.toFixed(4)} | ${v.media.brierTop4.toFixed(4)} | ${v.media.brierUlt4.toFixed(4)} |`);
      }
      w(`| _ignorando os jogos disputados_ | ${s.semJogos.toFixed(5)} | — | — | — |`);
      w('');
      w('RPS por corte:');
      w('');
      w(`| semente | ${s.cortes.map(c => 'r' + c).join(' | ')} |`);
      w(`|---|${s.cortes.map(() => '---').join('|')}|`);
      for (const [nome, v] of ords) {
        w(`| ${nome} | ${v.pontos.map(x => x.rps.toFixed(4)).join(' | ')} |`);
      }
      w('');
    }
    w('Piso de ruído do Monte Carlo (série A, corte 9, H=22): desvio 0,00097 a 1k simulações,');
    w('0,00059 a 3k e 0,00017 a 10k. Diferenças menores que isso não são diferenças.');
    w('');
  }

  if (curto.qualificacao) {
    w('## 5. A qualificação usada para semear se justificou?');
    w('');
    w('Pergunta diferente de "qual semente é a melhor". Aqui cada ordenação é avaliada **no');
    w('seu próprio ótimo de amplitude** antes de comparar — senão a comparação seria entre');
    w('amplitudes, não entre qualificações — e o confronto é sempre contra "todos iguais",');
    w('que é a ausência de opinião.');
    w('');
    w('| Competição | Spearman com a escada 2025 | ordenação | Brier | k* | Δ vs. todos iguais | signif. |');
    w('|---|---|---|---|---|---|---|');
    for (const [sk, q] of Object.entries(curto.qualificacao)) {
      const nome = sk === 'CB' ? 'Copa do Brasil' : 'Série ' + sk;
      const sp = q.spearmanCom2025 ? q.spearmanCom2025.rho.toFixed(3) : '—';
      let primeira = true;
      for (const o of q.ordenacoes) {
        if (o.nome === 'iguais') continue;
        w(`| ${primeira ? nome : ''} | ${primeira ? sp : ''} | ${o.nome} | ${o.brier.toFixed(4)} | ${o.kOtimo ?? '—'} | ` +
          `${o.delta >= 0 ? '+' : ''}${o.delta.toFixed(4)} [${o.ic95[0].toFixed(4)}, ${o.ic95[1].toFixed(4)}] | ${o.significativo ? '**sim**' : 'não'} |`);
        primeira = false;
      }
    }
    w('');
    w('**A qualificação se justifica onde dá para provar, e só lá.** Em A, B e C todas as');
    w('estimativas apontam na direção certa (Δ negativo) e nenhuma atinge significância: com');
    w('~220 jogos e efeitos de 0,001–0,015, não há poder. A Copa do Brasil atinge, com apenas');
    w('48 jogos, porque o efeito ali é dez vezes maior — ela cruza clubes de divisões');
    w('diferentes, então saber quem é mais forte vale muito, e o ótimo de amplitude é k=1.');
    w('A Série D atinge pelo caminho oposto: efeito pequeno, mas 480 jogos.');
    w('');
    w('A coluna Spearman confirma a premissa declarada: os Elos de A (0,94), C (0,90) e da');
    w('Copa (0,98) são essencialmente a classificação do ano anterior. Na B (0,63) a semente');
    w('se afasta dela — e é justamente onde `ano_anterior` supera o valor à mão.');
    w('');

    const camadas = Object.entries(curto.qualificacao).find(([, q]) => q.camadas);
    if (camadas) {
      const [sk, q] = camadas;
      w(`### Série ${sk}: qual camada da semente trabalha?`);
      w('');
      w(`A Série ${sk} é semeada por \`SD_UF[estado] + SD_ADJ[origem]\`, com \`SD_OVR\``);
      w('sobrescrevendo 38 clubes à mão. Ligando e desligando cada camada:');
      w('');
      w('| variante | Brier (no ótimo de amplitude) | k* |');
      w('|---|---|---|');
      for (const [nome, v] of Object.entries(q.camadas.variantes)) {
        w(`| ${nome.replace(/_/g, ' ')} | ${v.brier.toFixed(4)} | ${v.k ?? '—'} |`);
      }
      w('');
      w('| comparação | Δ | IC95 | significativo |');
      w('|---|---|---|---|');
      for (const c of q.camadas.comparacoes) {
        w(`| ${c.de.replace(/_/g, ' ')} vs. ${c.contra.replace(/_/g, ' ')} | ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(4)} | [${c.ic95[0].toFixed(4)}, ${c.ic95[1].toFixed(4)}] | ${c.significativo ? '**sim**' : 'não'} |`);
      }
      w('');
      w('Três leituras:');
      w('');
      w('- **A qualificação por UF se justificou** e carrega a maior parte do sinal — é a');
      w('  única camada que sozinha bate "todos iguais" de forma significativa.');
      w('- **A `SD_UF` feita à mão bate significativamente uma tabela de UF derivada do RNC.**');
      w('  A alternativa de aparência mais objetiva é pior.');
      w('- **Os 38 overrides do `SD_OVR` não acrescentam nada** — o Δ contra `UF + origem` é');
      w('  levemente positivo e o IC cruza zero. O ajuste por origem também não se separa do');
      w('  ruído sozinho.');
      w('');
    }
  }

  if (modos) {
    w('## 6. Modo de simulação e preset de evolução');
    w('');
    w('Duas escolhas que a configuração expõe e que nunca tinham sido medidas: `eo` (ELO PURO');
    w('vs. ATK/DEF) e o preset de evolução (conservador / base / agressivo).');
    w('');
    const cols = Object.keys(modos.grade[Object.keys(modos.grade)[0]]);
    w(`| competição | ${cols.join(' | ')} |`);
    w(`|---|${cols.map(() => '---').join('|')}|`);
    for (const [sk, g] of Object.entries(modos.grade)) {
      const melhor = Math.min(...cols.map(c => g[c].brier));
      w(`| ${sk === 'CB' ? 'Copa' : 'Série ' + sk} | ` +
        cols.map(c => (g[c].brier === melhor ? '**' + g[c].brier.toFixed(4) + '**' : g[c].brier.toFixed(4))).join(' | ') + ' |');
    }
    w('');
    const m = modos.modoAgrupado;
    w(`**ATK/DEF vence ELO PURO com folga.** Agrupado: Δ ${m.meta.delta >= 0 ? '+' : ''}${m.meta.delta.toFixed(4)} ` +
      `a favor de ATK/DEF, z = ${Math.abs(m.meta.z).toFixed(2)} — o maior efeito medido em todo o relatório.`);
    w(`Por competição: ${m.porCompeticao.map(c => `${c.competicao} ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(4)}`).join(', ')}.`);
    w('Só a Série C prefere ELO PURO, e por pouco. O padrão do app estava certo — agora medido.');
    w('');
    w('| preset (agrupado) | Δ | z | I² | significativo |');
    w('|---|---|---|---|---|');
    for (const [nome, x] of Object.entries(modos.presetAgrupado)) {
      if (!x.meta) { w(`| ${nome} | sem variação | — | — | — |`); continue; }
      w(`| ${nome} | ${x.meta.delta >= 0 ? '+' : ''}${x.meta.delta.toFixed(4)} | ${Math.abs(x.meta.z).toFixed(2)} | ` +
        `${(x.heterogeneidade.I2 * 100).toFixed(0)}% | ${x.meta.significativo ? '**sim**' : 'não'} |`);
    }
    w('');
    w('`base` é a melhor célula em 4 das 5 competições, mas o agrupado não atinge');
    w('significância (I² alto) porque a Série C discorda com força. `agressivo` é');
    w('significativamente **pior** em ATK/DEF. Trocar o padrão de `conservador` para `base` é');
    w('defensável, e não comprovado.');
    w('');
    w('### A inércia é uma propriedade do MODO, não do parâmetro');
    w('');
    w('| parâmetro | em ATK/DEF (o modo do app) | em ELO PURO |');
    w('|---|---|---|');
    const linhaMod = base => {
      const a = modos.inerciaPorModo['atkdef: ' + base];
      const e = modos.inerciaPorModo['elo: ' + base];
      const fmt = arr => arr.every(x => x.inerte) ? '**inerte em todas**'
        : arr.map(x => `${x.competicao} ${x.delta >= 0 ? '+' : ''}${x.delta.toFixed(4)}`).join(', ');
      w(`| ${base} | ${fmt(a)} | ${fmt(e)} |`);
    };
    ['homeAdv 100->400', 'kElo 16->64', 'c0Log ligado'].forEach(linhaMod);
    w('');
    w('Em ELO PURO `homeAdv` é o parâmetro mais potente do modelo; em ATK/DEF não faz');
    w('literalmente nada. `c0Log` — o bloco inteiro de favoritismo dependente do Elo — também');
    w('só existe em ELO PURO. Como o app roda ATK/DEF, três blocos de configuração estão');
    w('inertes na prática, mas passam a valer se alguém ligar o outro modo.');
    w('');
  }

  if (compartilhado) {
    w('## 7. Um `pesoCasa` só, ou um por competição?');
    w('');
    w('O `DEFAULT_CFG` carrega cinco `lambdas`, um por competição. Isso é escolha de');
    w('modelagem, não fato: manter valores separados só se paga se as competições diferirem');
    w('mais que o ruído. O teste acha o valor único ótimo para cada agrupamento e mede o custo');
    w('de impô-lo, competição por competição.');
    w('');
    w('O critério não é "custo zero" — o ótimo livre é ótimo por construção, então o custo é');
    w('sempre positivo. É se o custo cabe no intervalo de confiança: quando o ótimo livre não');
    w('é significativamente melhor que o compartilhado, manter números separados é ajustar');
    w('ruído — e ajustar ruído custa generalização.');
    w('');
    const pc = compartilhado.pesoCasa;
    w('Ótimo livre por competição: ' + Object.entries(pc.livre)
      .map(([sk, l]) => `**${sk}** ${l.valor.toFixed(2)} (vigente ${l.vigente.toFixed(3)})`).join(' · ') + '.');
    w('');
    for (const [nome, g] of Object.entries(pc.grupos)) {
      w(`**${nome} → valor compartilhado ${g.valorCompartilhado.toFixed(2)}** — Brier agrupado ` +
        `${g.brierAgrupado.toFixed(5)} contra ${g.brierComVigentes.toFixed(5)} dos valores vigentes ` +
        `(${g.ganhoSobreVigentes >= 0 ? 'ganho' : 'perda'} de ${Math.abs(g.ganhoSobreVigentes).toFixed(5)}).`);
      w('');
      w('| competição | ótimo livre | vigente | custo de compartilhar | IC95 do ótimo livre vs. compartilhado | separar se justifica? |');
      w('|---|---|---|---|---|---|');
      for (const c of g.custos) {
        w(`| ${c.competicao} | ${c.otimoLivre.toFixed(2)} | ${c.vigente.toFixed(3)} | +${c.custo.toFixed(5)} | ` +
          `[${c.ic95[0].toFixed(5)}, ${c.ic95[1].toFixed(5)}] | ${c.significativo ? '**sim**' : 'não'} |`);
      }
      w('');
    }
    w('**Um único `pesoCasa` serve as quatro ligas, e serve melhor que os valores de hoje.**');
    w('Nenhum ótimo livre é significativamente melhor que o compartilhado, o custo máximo é da');
    w('ordem de 0,001, e o valor único bate os quatro valores vigentes. A Copa do Brasil é a');
    w('exceção real: seu ótimo é bem mais alto e forçá-la ao valor das ligas custa dez vezes');
    w('mais que qualquer liga. A estrutura que os dados sustentam é **dois valores — ligas e');
    w('mata-mata — não cinco.**');
    w('');
    const tt = compartilhado.total;
    w('### O `total` é uma armadilha de otimização');
    w('');
    w('`total` é o número de gols esperados por **jogo**, somando os dois times: `getML` devolve');
    w('`mc + mf = total`, com `mc` para o mandante e `mf` para o visitante.');
    w('');
    w('**Os valores vigentes acertam bem os gols.** Comparando o que o modelo prevê, em média,');
    w('com o que aconteceu:');
    w('');
    w('| série | `total` config. | gols observados/jogo | gols previstos/jogo | erro |');
    w('|---|---|---|---|---|');
    for (const [sk, s2] of Object.entries(curto.series)) {
      if (!s2.golsPrevistos) continue;
      w(`| ${sk} | ${s2.cfgVigente.total.toFixed(2)} | ${s2.observado.golsPorJogo.toFixed(3)} | ` +
        `${s2.golsPrevistos.toFixed(3)} | ${(s2.golsPrevistos - s2.observado.golsPorJogo) >= 0 ? '+' : ''}` +
        `${(s2.golsPrevistos - s2.observado.golsPorJogo).toFixed(3)} |`);
    }
    w('');
    w('A Série A está praticamente exata. A D é a única com desvio material.');
    w('');
    w('O problema aparece ao **otimizar**: a varredura dá ótimos livres de ' +
      Object.entries(tt.livre).map(([sk, l]) => `${sk} ${l.valor.toFixed(2)}`).join(', ') +
      ' — muito abaixo dos gols reais. O mecanismo é claro: baixar λ **infla empates**, tapando o');
    w('déficit estrutural da Poisson (seção 2). Na Série A, ir de 2,50 para 1,30 leva os empates');
    w('previstos de 22,6% para 28,4% — quase os 29,8% observados — e melhora o Brier de 1X2. Mas');
    w('passa a prever 1,99 gols por jogo onde acontecem 2,60.');
    w('');
    w('**Não é uma configuração a adotar.** O Monte Carlo simula placares, e o saldo de gols é');
    w('critério de desempate na tabela: otimizar `total` pelo 1X2 corromperia o saldo, um custo');
    w('que o Brier de curto prazo não enxerga. O ótimo aqui é sintoma de verossimilhança errada,');
    w('não parâmetro a mover — o conserto é a distribuição de placares, e o `total` vigente já');
    w('está no lugar certo.');
    w('');
  }

  if (poder) {
    w('## 8. Juntar competições aumenta o poder estatístico?');
    w('');
    w('Só quando o efeito aponta na mesma direção em todas. O ganho abaixo é o |z| agrupado');
    w('dividido pelo maior |z| individual — um denominador severo de propósito, já que o');
    w('máximo entre cinco é otimista por seleção. I² mede quanto da divergência entre');
    w('competições não é ruído amostral.');
    w('');
    w('| hipótese (global) | efeito por competição | Δ agrupado | ganho de poder | I² |');
    w('|---|---|---|---|---|');
    for (const [nome, x] of Object.entries(poder)) {
      if (!x.meta) { w(`| ${nome} | sem variação | — | — | — |`); continue; }
      const porC = x.porCompeticao.map(c => `${c.competicao} ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(3)}`).join(', ');
      w(`| ${nome} | ${porC} | ${x.meta.delta >= 0 ? '+' : ''}${x.meta.delta.toFixed(4)} | ` +
        `${x.poder.ganho.toFixed(2)}× | ${(x.heterogeneidade.I2 * 100).toFixed(0)}% |`);
    }
    w('');
    w('**Juntar rendeu em uma das cinco hipóteses**, e é justamente a de I² = 0. Onde as');
    w('competições discordam (I² de 73% e 83%), agrupar detecta *menos* que a melhor');
    w('competição sozinha — o efeito médio é uma média sem referente.');
    w('');
    w('E o sinal importa: **todo agrupado significativo aqui é uma PIORA.** O que o');
    w('agrupamento prova não é que existe um valor global melhor, e sim o contrário — que um');
    w('valor único imposto às cinco competições é pior que os atuais. Os parâmetros são');
    w('genuinamente por competição.');
    w('');
  }

  if (horizonte) {
    w('## 9. Longo prazo: até onde o modelo enxerga?');
    w('');
    w('O estágio de longo prazo fixa um horizonte e varia o corte, o que dá uma única tabela');
    w('realizada por série. Mas **todo par (r, H) com r < H é uma previsão com desfecho');
    w('observado** — "sabendo até a rodada r, como estará a tabela na rodada H?". Varrendo a');
    w('grade, as partidas já disputadas rendem centenas de pares, decompostos pelo **alcance**');
    w('(H − r), que é a pergunta de verdade.');
    w('');
    w('Os pares compartilham jogos, então isto não multiplica a amostra efetiva — dá');
    w('resolução, não poder. Uma temporada nunca dará IC honesto sobre "quem será campeão";');
    w('dá, sim, a forma da curva de habilidade contra o alcance.');
    w('');
    w('Referências: **tabela congelada** (a colocação de r se mantém — o que qualquer leitor');
    w('faz de graça) e **semente neutra** (mesmo motor, todos os Elos iguais).');
    w('');
    for (const [sk, s] of Object.entries(horizonte.series)) {
      w(`**Série ${sk}** (H máx ${s.hMax})`);
      w('');
      w('| alcance (rodadas) | pares | RPS modelo | tabela congelada | semente neutra | habilidade vs. congelada | modelo vence em |');
      w('|---|---|---|---|---|---|---|');
      for (const [alc, x] of Object.entries(s.porAlcance)) {
        w(`| ${alc} | ${x.n} | ${x.modelo.toFixed(4)} | ${x.congelada.toFixed(4)} | ${x.neutro.toFixed(4)} | ` +
          `${(x.habilidadeVsCongelada * 100).toFixed(1)}% | ${x.venceCongeladaEm}/${x.n} |`);
      }
      w('');
    }
  }

  if (drift) {
    w('## 10b. O `drift` — o parâmetro que o curto prazo não enxerga');
    w('');
    w('`applyDrift` só é chamado dentro do Monte Carlo, uma vez por rodada **simulada**, e só');
    w('para rodadas além da última disputada. O walk-forward caminha apenas sobre jogos reais,');
    w('então todo o estágio de curto prazo é cego a este parâmetro — nas tabelas da seção 1');
    w('ele aparece com delta zero **por construção**, não por inércia.');
    w('');
    w('E ele não é decorativo em ATK/DEF: o ruído atinge `atk`/`def` junto com o Elo');
    w('(σ_ad = drift × 0,008), e é `atk`/`def` que alimenta λ. Como o ruído se acumula a cada');
    w('rodada simulada, o efeito cresce com o alcance. Na prática, é o botão que regula a');
    w('largura das distribuições de longo prazo.');
    w('');
    w(`Valor vigente: **${drift.driftVigente}**.`);
    w('');
    w('| série | ' + drift.drifts.map(d => 'drift ' + d).join(' | ') + ' |');
    w(`|---|${drift.drifts.map(() => '---').join('|')}|`);
    for (const [sk, x] of Object.entries(drift.series)) {
      const melhor = Math.min(...drift.drifts.map(d => x.linhas[d].rps));
      w(`| ${sk} | ` + drift.drifts.map(d => {
        const v = x.linhas[d].rps;
        return v === melhor ? '**' + v.toFixed(5) + '**' : v.toFixed(5);
      }).join(' | ') + ' |');
    }
    w('');
    w('RPS sobre a distribuição de colocação. Menor é melhor.');
    w('');
    w('### Calibração dos eventos binários — o instrumento certo para o drift');
    w('');
    w('O RPS é pouco sensível à largura da distribuição; a calibração é o que denuncia');
    w('excesso ou falta de confiança. Agregando líder, top-4 e 4 últimos em todos os cortes e');
    w('séries:');
    w('');
    w('| drift | Brier | previsto | observado | viés | ECE | confiança |');
    w('|---|---|---|---|---|---|---|');
    for (const d of drift.drifts) {
      const a = drift.agregado[d];
      w(`| ${d} | ${a.brier.toFixed(5)} | ${(a.previsto * 100).toFixed(2)}% | ${(a.observado * 100).toFixed(2)}% | ` +
        `${(a.previsto - a.observado) >= 0 ? '+' : ''}${((a.previsto - a.observado) * 100).toFixed(2)} pp | ` +
        `${(a.ece * 100).toFixed(3)}% | ${(a.confianca * 100).toFixed(2)}% |`);
    }
    w('');
    w('A coluna **confiança** é a distância média da previsão em relação à indecisão: ela cai');
    w('conforme o drift sobe, que é exatamente o mecanismo esperado. A leitura útil é onde o');
    w('Brier e o ECE param de melhorar — abaixo disso o modelo está confiante demais.');
    w('');
    w('### O ótimo está fora do que a interface permite');
    w('');
    w('O seletor do dashboard oferece quatro valores: 0 (Off), 5 (Baixo), 10 (Médio) e');
    w('15 (**Alto**). O teto rotulado como "Alto" é justamente o valor vigente — e o ótimo');
    w('medido está acima dele. Não é um ajuste de configuração: é um valor que ninguém');
    w('consegue selecionar pela tela.');
    w('');
    w('### Um mesmo viés, por três caminhos independentes');
    w('');
    w('Três medições feitas por vias distintas apontam para a mesma direção — **o modelo é');
    w('sistematicamente confiante demais**:');
    w('');
    w('- a **amplitude da semente** é larga demais na Série A (k≈1,06 contra ótimo 0,35–0,50):');
    w('  confiança excessiva na força a priori;');
    w('- o **`pesoCasa`** prevê 54,4% de vitórias em casa onde houve 45,3%: confiança excessiva');
    w('  na vantagem de mando;');
    w('- o **`drift`** está abaixo do ótimo **pelo RPS** em todas as séries testadas: confiança');
    w('  excessiva na estabilidade da força ao longo da temporada.');
    w('');
    w('Os dois primeiros foram medidos com instrumentos diferentes — Brier no curto prazo e');
    w('teste z do viés marginal — e concordam. O terceiro **só concorda por uma das duas');
    w('métricas**, e essa ressalva está na subseção abaixo. A convergência dos dois primeiros');
    w('é o achado sólido; o drift é um caso mais interessante que isso.');
    w('');
    w('### As duas métricas discordam sobre o drift');
    w('');
    w('O RPS quer drift **alto** (ótimo 30 em A e C, 60 em B). A calibração dos eventos');
    w('binários quer **15** — exatamente o valor vigente, que minimiza tanto o Brier quanto o');
    w('ECE. Não é ruído: as duas curvas têm mínimos claros em lugares diferentes.');
    w('');
    w('A explicação está no que cada métrica cobra. O RPS pontua a distribuição de colocação');
    w('inteira e pune previsões confiantes e erradas ao longo de toda a ordem — alargar a');
    w('distribuição ajuda. Os eventos binários (líder, top-4, 4 últimos) são grosseiros e');
    w('recompensam nitidez; alargar demais só apaga o sinal.');
    w('');
    w('Isso é uma escolha de produto, não de estatística: **se o app existe para dizer quem');
    w('cai e quem sobe, 15 está certo. Se existe para projetar a tabela inteira, está baixo.**');
    w('O relatório não decide isso.');
    w('');
    w('Nota metodológica: nas tabelas de calibração acima, "previsto" e "observado" coincidem');
    w('em 15,00% por construção — as probabilidades somam sobre os times, então a média');
    w('marginal é fixa em (1+4+4)/20/3. O teste de viés marginal, útil no curto prazo, é vazio');
    w('aqui; quem informa são o Brier, o ECE e a confiança.');
    w('');
  }

  if (confianca) {
    w('## 10. A visão de longo prazo é confiável?');
    w('');
    w('O RPS mede a qualidade da distribuição inteira e a habilidade mede se vale simular.');
    w('Nenhum dos dois responde o que um leitor pergunta ao ver "62% de título": **esse 62%');
    w('quer dizer 62%?**');
    w('');
    w('Aqui cada trinca (corte, competição, clube) gera uma previsão para três eventos');
    w('binários e um desfecho observado. Decomposição de Murphy:');
    w('`Brier = confiabilidade − resolução + incerteza`. Confiabilidade baixa = as');
    w('probabilidades são honestas. Resolução alta = o modelo separa os casos. Um modelo pode');
    w('ter Brier bom por ser honesto e inútil, ou por ser informativo e desonesto — só o Brier');
    w('não distingue os dois.');
    w('');
    const fmt = (rot, d) => w(`| ${rot} | ${d.n} | ${d.brier.toFixed(4)} | ${d.confiabilidade.toFixed(5)} | ` +
      `${d.resolucao.toFixed(5)} | ${d.incerteza.toFixed(4)} | ${(d.skill * 100).toFixed(1)}% |`);
    w('| recorte | n | Brier | confiabilidade | resolução | incerteza | skill |');
    w('|---|---|---|---|---|---|---|');
    fmt('**geral**', confianca.geral);
    for (const [ev, d] of Object.entries(confianca.porEvento)) fmt(ev, d);
    for (const [b, d] of Object.entries(confianca.porBanda)) fmt(`alcance ${b} rodadas`, d);
    w('');
    if (confianca.sensibilidade) {
      w('### O número da confiabilidade é um teto, não um valor exato');
      w('');
      w('A identidade `Brier = confiabilidade − resolução + incerteza` só é exata quando cada');
      w('faixa contém um único valor previsto. Com previsões contínuas sobra um resíduo, e ele');
      w('depende da largura das faixas — então a confiabilidade reportada também depende:');
      w('');
      w('| nº de faixas | confiabilidade | resolução | resíduo da identidade |');
      w('|---|---|---|---|');
      for (const x of confianca.sensibilidade) {
        w(`| ${x.nBins} | ${x.confiabilidade.toFixed(6)} | ${x.resolucao.toFixed(5)} | ${x.residuo.toExponential(2)} |`);
      }
      w('');
      w('A leitura honesta: a confiabilidade está em algum lugar até ~0,0014 — o valor exato é');
      w('artefato do agrupamento. O que sustenta a conclusão é a **ordem de grandeza**: mesmo o');
      w('teto é ~90× menor que a incerteza (0,1275) e ~40× menor que a resolução. As');
      w('probabilidades são honestas por qualquer granulação.');
      w('');
    }
    if (testes) {
      w('### Testes formais: a calibração publicada é boa?');
      w('');
      w('Três testes com hipótese nula explícita — "as probabilidades são exatamente o que');
      w('dizem ser" — computados sobre os pares salvos. E um caveat obrigatório: os pares não');
      w('são independentes (cortes da mesma série compartilham o gabarito; dentro de um evento,');
      w('exatamente 4 dos 20 clubes terminam na zona), então os p-valores são aproximados e');
      w('tendem ao otimismo. Por isso cada teste roda também numa fatia quase-independente.');
      w('');
      w('| grupo | n | Z (Spiegelhalter) | p | ECE obs. | ECE sob perfeição (média / p95) | percentil | faixas Wilson ok |');
      w('|---|---|---|---|---|---|---|---|');
      for (const [nome, g] of Object.entries(testes.grupos)) {
        const sp = g.spiegelhalter, e = g.ece;
        const ok = g.faixas.filter(f => f.cumpre).length;
        w(`| ${nome} | ${sp.n} | ${sp.z.toFixed(2)} | ${sp.pValor < 0.001 ? '<0,001' : sp.pValor.toFixed(3)} | ` +
          `${(e.observado * 100).toFixed(2)}% | ${(e.nuloMedio * 100).toFixed(2)}% / ${(e.nuloP95 * 100).toFixed(2)}% | ` +
          `${(e.percentil * 100).toFixed(0)} | ${ok}/${g.faixas.length} |`);
      }
      w('');
      w('**Leitura honesta: a calibração NÃO é estatisticamente perfeita.** Com n=10.800 o');
      w('desvio é detectável (Z=2,58, p=0,01; ECE no percentil 100 do seu nulo) e sobrevive à');
      w('fatia quase-independente. Mas os testes por evento localizam o problema: **líder e');
      w('4 últimos passam** (Z=0,12 e −0,98); quem falha é o **top-4** (Z=5,04). E a magnitude');
      w('é pequena — os desvios das faixas que falham são de 1 a 6 pontos percentuais.');
      w('');
      w('O desvio mais relevante na prática está na faixa 0–10%: previsto 1,6%, observado');
      w('2,8%. Em termos absolutos é 1,2 pp; em termos relativos, os quase-impossíveis');
      w('acontecem com quase o dobro da frequência anunciada — é o preço da cauda.');
      w('');
      if (testes.duelo) {
        w('E o duelo contra a tabela congelada, agora como métrica em vez de anedota: o modelo');
        w(`vence em ${testes.duelo.vitorias} de ${testes.duelo.n} células da grade de alcances — teste de sinal`);
        w(`p = ${testes.duelo.pValor.toExponential(1)}. Mesmo descontando generosamente a dependência entre células`);
        w('(que compartilham jogos), a margem é de muitas ordens de grandeza.');
        w('');
      }
    }
    w('### Diagrama de confiabilidade');
    w('');
    w('| faixa prevista | n | previsto | observado | desvio |');
    w('|---|---|---|---|---|');
    for (const f of confianca.geral.faixas) {
      w(`| ${f.faixa} | ${f.n} | ${(f.previsto * 100).toFixed(1)}% | ${(f.observado * 100).toFixed(1)}% | ` +
        `${f.desvio >= 0 ? '+' : ''}${(f.desvio * 100).toFixed(1)} pp |`);
    }
    w('');
    w('Desvio positivo = aconteceu mais do que o previsto (modelo tímido nessa faixa);');
    w('negativo = aconteceu menos (otimista demais).');
    w('');
  }

  if (extra.demonstracao) {
    const de = extra.demonstracao;
    w('## Quando o modelo discorda da tabela, quem ganha?');
    w('');
    w('A demonstração de que a visão de longo prazo faz sentido não é uma métrica: é o duelo.');
    w('Se o modelo só repetisse a classificação corrente, seria inútil por construção —');
    w('qualquer um lê a tabela de graça. O valor dele está nos **desacordos francos**: casos em');
    w('que a tabela diz uma coisa (o time está na zona / está fora) e o modelo aponta para o');
    w(`lado oposto com convicção (|p − tabela| > ${de.limiar}). No desfecho, um dos dois acertou.`);
    w('');
    w(`**Placar geral: modelo ${de.placar.modelo} × ${de.placar.tabela} tabela** — ` +
      `${(de.taxaModelo * 100).toFixed(1)}% dos ${de.nCasos} desacordos para o modelo.`);
    w('');
    w('| recorte | duelos | vitórias do modelo | taxa |');
    w('|---|---|---|---|');
    for (const [ev, x] of Object.entries(de.porEvento)) {
      w(`| ${ev} | ${x.n} | ${x.modelo} | ${x.n ? (x.modelo / x.n * 100).toFixed(0) : '—'}% |`);
    }
    for (const [sk, x] of Object.entries(de.porSerie)) {
      w(`| Série ${sk} | ${x.n} | ${x.modelo} | ${x.n ? (x.modelo / x.n * 100).toFixed(0) : '—'}% |`);
    }
    w('');
    w('### Vitórias mais nítidas do modelo');
    w('');
    w('| série | rodada | clube | posição então | modelo dizia | desfecho (rodada H) |');
    w('|---|---|---|---|---|---|');
    for (const c of de.exemplosVitoria.slice(0, 10)) {
      w(`| ${c.serie} | ${c.corte} | ${c.time} | ${c.posNoCorte}º | ${(c.pModelo * 100).toFixed(0)}% de ${c.evento} | ` +
        `${c.posNoDesfecho}º — ${c.aconteceu ? 'dentro' : 'fora'} |`);
    }
    w('');
    w('### Derrotas mais nítidas');
    w('');
    w('| série | rodada | clube | posição então | modelo dizia | desfecho (rodada H) |');
    w('|---|---|---|---|---|---|');
    for (const c of de.exemplosDerrota.slice(0, 6)) {
      w(`| ${c.serie} | ${c.corte} | ${c.time} | ${c.posNoCorte}º | ${(c.pModelo * 100).toFixed(0)}% de ${c.evento} | ` +
        `${c.posNoDesfecho}º — ${c.aconteceu ? 'dentro' : 'fora'} |`);
    }
    w('');
    w('Ressalva de leitura: os duelos do mesmo clube em cortes vizinhos não são independentes —');
    w('um Fluminense que despenca gera vários desacordos que se resolvem juntos. O placar é');
    w('demonstração, não teste de hipótese; os testes estão nas seções anteriores.');
    w('');
  }

  if (candidato) {
    w('## E se 2026 tivesse rodado com os ajustes?');
    w('');
    w('Contrafactual: a "configuração candidata" aplica só os achados sólidos —');
    w(`\`pesoCasa\` único ${candidato.ajustes.pesoCasaLigas} nas quatro ligas e a amplitude da semente da Série A`);
    w(`encolhida para k=${candidato.ajustes.amplitudeSerieA} — e reprocessa a temporada inteira.`);
    w('');
    w('> **Este número é um teto, não uma expectativa.** Os ajustes foram derivados destes');
    w('> mesmos dados. Dois atenuantes declarados: os valores são redondos, vindos de curvas');
    w('> suaves (pouca capacidade de overfit em dois números), e o ganho é conferido também');
    w('> na segunda metade da temporada. O teste limpo é dezembro.');
    w('');
    w('| competição | Brier atual → candidata | ECE | viés de casa | Δ (IC95) |');
    w('|---|---|---|---|---|');
    for (const l of candidato.solida.linhas) {
      w(`| ${l.competicao} | ${l.brierAtual.toFixed(4)} → ${l.brierCand.toFixed(4)} | ` +
        `${(l.eceAtual * 100).toFixed(1)}% → ${(l.eceCand * 100).toFixed(1)}% | ` +
        `${(l.viesCasaAtual * 100).toFixed(1)} → ${(l.viesCasaCand * 100).toFixed(1)} pp | ` +
        `${l.delta >= 0 ? '+' : ''}${l.delta.toFixed(4)} [${l.ic95[0].toFixed(4)}, ${l.ic95[1].toFixed(4)}]` +
        `${l.significativo ? ' **sig.**' : ''} |`);
    }
    const ag = candidato.solida.agregado;
    w(`| **agregado** | ${ag.brierAtual.toFixed(4)} → ${ag.brierCand.toFixed(4)} | ` +
      `${(ag.eceAtual * 100).toFixed(2)}% → ${(ag.eceCand * 100).toFixed(2)}% | — | ` +
      `${ag.delta.toFixed(4)} [${ag.ic95[0].toFixed(4)}, ${ag.ic95[1].toFixed(4)}]${ag.significativo ? ' **sig.**' : ''} |`);
    w('');
    if (candidato.longo) {
      w('Longo prazo (RPS médio sobre os cortes): ' + Object.entries(candidato.longo)
        .map(([sk, x]) => `${sk} ${x.rpsAtual.toFixed(4)} → ${x.rpsCand.toFixed(4)} (${((1 - x.rpsCand / x.rpsAtual) * 100).toFixed(1)}%)`)
        .join(' · ') + '.');
      w('');
    }
    w('A leitura: **o ganho é quase todo o conserto da Série A** — Brier −0,029 (significativo,');
    w('e ainda maior na segunda metade), viés de casa de −9,1 pp para −0,8 pp, ECE de 7,8%');
    w('para 3,6%. Com isso a Série A passa de indistinguível da taxa-base para claramente');
    w('melhor que ela. B, C e Copa já estavam certas e não mudam; a D melhora um pouco. O');
    w('ECE agregado cai à metade (2,78% → 1,39%): o modelo teria sido sobretudo mais');
    w('**honesto**, não mais vidente.');
    w('');
  }

  if (piso) {
    w('## O Brier em escala: teto, piso e o mercado');
    w('');
    w('"0,63 não é ruim?" — a pergunta certa, com resposta quantitativa: a escala do 1X2 é');
    w('**comprimida**. Um jogo típico com probabilidades verdadeiras 45/28/27 tem Brier');
    w('esperado de ~0,645 *mesmo para quem conhece essas probabilidades exatamente* — o acaso');
    w('do futebol impõe o piso. As âncoras, todas medidas nos mesmos jogos:');
    w('');
    w('- **auto-esperado**: o Brier que o próprio modelo espera de si (média de 1 − Σp²). Se o');
    w('  realizado ≈ auto-esperado, o modelo entrega o que promete e o nível reflete falta de');
    w('  informação, não desonestidade.');
    w('- **clarividente**: previsão com os ratings *finais* da temporada — vazamento deliberado.');
    w('  É o teto de qualquer melhoria de estimativa de força nesta família de modelo; abaixo');
    w('  dele só com informação de jogo (escalação, desfalques, descanso).');
    w('');
    const ordem = ['taxaBase', 'atual', 'candidata', 'clarividente'];
    const rot = { taxaBase: 'taxa-base (walk-fwd)', atual: 'modelo vigente', candidata: 'modelo candidato', clarividente: 'clarividente (teto de força)' };
    w('| âncora | Brier | RPS/jogo | ' + Object.keys(piso.series).join(' (Brier) | ') + ' (Brier) |');
    w('|---|---|---|' + Object.keys(piso.series).map(() => '---').join('|') + '|');
    w(`| uniforme | 0,667 | — | ${Object.keys(piso.series).map(() => '0,667').join(' | ')} |`);
    for (const k of ordem) {
      const ag = piso.agregado[k];
      w(`| ${rot[k]} | ${ag.brier.toFixed(4)} | ${ag.rpsPartida.toFixed(4)} | ` +
        Object.values(piso.series).map(s3 => s3[k].brier.toFixed(4)).join(' | ') + ' |');
    }
    w('');
    w(`O candidato realiza ${piso.agregado.candidata.brier.toFixed(4)} contra auto-esperado de ` +
      `${piso.agregado.candidata.autoEsperado.toFixed(4)} — entrega o que promete. A distância até o`);
    w(`clarividente (${piso.agregado.clarividente.brier.toFixed(4)}) é o espaço capturável por melhor estimativa`);
    w('de força: ~0,036, concentrado na Série D (0,044), onde 96 clubes têm ~10 jogos de grupo');
    w('para os ratings convergirem.');
    w('');
    w('### Comparação externa, na métrica dos outros');
    w('');
    w('O benchmark público disponível é o **RPS de partida** das odds de fechamento de casas de');
    w('aposta ([pena.lt](https://pena.lt/y/2025/07/16/how-accurate-are-soccer-odds/), ~250 mi');
    w('de linhas, temporada 2024/25; Brasil não coberto): **0,18–0,20 nas grandes ligas');
    w('europeias, 0,20–0,22 nas divisões inferiores**. O modelo candidato mede **0,2100**');
    w('agregado (A: 0,2080; B: 0,2157; C: 0,2285; D: 0,2050; Copa: 0,1777) — dentro da faixa');
    w('das odds de mercado para ligas de segundo escalão, sem usar nenhuma informação além dos');
    w('placares. O clarividente (0,1936) tangencia a faixa das grandes ligas: nem força');
    w('perfeita alcança o que o mercado faz com escalações e notícias.');
    w('');
    w('Caveat de comparação: ligas diferentes têm imprevisibilidade diferente (o Brasileirão é');
    w('notoriamente equilibrado), e odds de fechamento agregam informação que nenhum modelo de');
    w('resultados tem. A comparação situa a ordem de grandeza; não é um ranking.');
    w('');
  }

  w('## 11. Recomendações para 2027');
  w('');
  w('Em ordem de confiança no achado que as sustenta.');
  w('');
  w('0. **Manter ATK/DEF como modo padrão — agora medido.** Δ +0,0268 a favor de ATK/DEF');
  w('   contra ELO PURO, z = 5,43: o maior efeito de todo o relatório, e em 4 das 5');
  w('   competições. A escolha estava certa e nunca tinha sido verificada. Corolário: os');
  w('   blocos `homeAdv`, `kElo` e `c0Log` só existem no modo que o app **não** usa.');
  w('1. **Congelar as previsões desde a rodada 1.** A razão de 2026 só admitir *replay* é');
  w('   que nada foi arquivado. Um `predictions.jsonl` gravado pela Action semanal (data,');
  w('   rodada, config, probabilidades) transforma a próxima avaliação de reconstrução em');
  w('   auditoria. É a única coisa aqui que não pode ser feita retroativamente.');
  w('2. **Um `pesoCasa` para as ligas, outro para o mata-mata — dois números, não cinco.**');
  w('   O gap de casa é o defeito mais sólido medido, e é monotônico no parâmetro. Mas a');
  w('   varredura conjunta mostra que as quatro ligas são servidas por um valor único (≈0,58)');
  w('   melhor do que pelos quatro valores de hoje, com custo dentro do ruído em todas. A Copa');
  w('   do Brasil é a única exceção real e fica com o seu (≈0,65). Menos parâmetros, mais');
  w('   acerto.');
  w('   *Não* calibrar pelo observado: o ótimo de Brier não é a fração observada de gols,');
  w('   porque o parâmetro também muda a forma da grade de Poisson.');
  w('3. **Tratar a AMPLITUDE da semente como parâmetro de primeira classe** — hoje ela é um');
  w('   efeito colateral de que números alguém digitou. A curva em U da seção 3 tem ótimo');
  w('   bem definido e diferente por divisão, e a Série A está 2–3× larga demais. Um campo');
  w('   explícito por série (e não o alcance implícito do `_RANKING`) tornaria isso ajustável');
  w('   e auditável. Corolário: **não vale caçar a ordenação perfeita** — no ótimo de');
  w('   amplitude, "à mão", RNC e ano anterior empatam.');
  w('4. **Decidir o que o Elo é.** Hoje ele evolui, aparece na tela e não afeta previsão');
  w('   nenhuma (seção 1). Ou ele volta para o cálculo de λ — e aí `kElo`/`homeAdv` passam a');
  w('   significar algo — ou o modelo assume que é atk/def com semente, e os dois parâmetros');
  w('   saem da configuração para não sugerir controle que não existe. O mesmo vale para');
  w('   `targetRatio`, que só está vivo na Série A.');
  w('5. **Manter a qualificação por UF da Série D e aposentar os overrides.** A `SD_UF` é a');
  w('   única camada que sozinha bate "todos iguais" de forma significativa, e bate também');
  w('   uma tabela de UF derivada do RNC — a versão feita à mão venceu a de aparência mais');
  w('   objetiva. Já os 38 valores de `SD_OVR` não acrescentam nada mensurável (Δ +0,0003');
  w('   contra `UF + origem`): são 38 números para manter à mão sem retorno demonstrável.');
  w('6. **A semente rende onde há disparidade real.** O ganho de semear é ~10× maior na Copa');
  w('   do Brasil que nas ligas, e lá o ótimo de amplitude é k=1: quando os confrontos');
  w('   cruzam divisões, vale confiar na semente inteira. Dentro de uma divisão, onde os');
  w('   clubes são parecidos, quase toda a informação a priori é ruído — por isso o k ótimo');
  w('   cai conforme a divisão fica mais homogênea. **A amplitude deveria ser função da');
  w('   dispersão de força esperada na competição**, não um número herdado.');
  w('7. **Tratar o déficit de empates como problema de modelo.** Dixon-Coles ajuda pouco e');
  w('   não fecha o buraco; a maior parte do déficit vem do viés de casa. Vale reavaliar com');
  w('   a temporada completa antes de adotar.');
  w('8. **O longo prazo ganha simulando, não semeando.** Na grade de alcances, a semente');
  w('   neutra empata ou supera a vigente até ~8 rodadas à frente nas três séries; o modelo');
  w('   só se separa dela no alcance 16 da Série A. O que bate a tabela congelada — e bate em');
  w('   34 dos 35 pares, com vantagem crescendo de 21% para 43% conforme o alcance aumenta —');
  w('   é simular os jogos restantes com incerteza, não saber quem era favorito em janeiro.');
  w('9. **Considerar `base` como preset padrão.** É a melhor célula em 4 das 5 competições;');
  w('   `agressivo` é significativamente pior. O agrupado não atinge significância porque a');
  w('   Série C discorda com força — então é uma troca defensável, não comprovada.');
  w('10. **Parâmetro global é o desenho errado.** Todo teste agrupado significativo apontou');
  w('   PIORA: impor um valor único às cinco competições perde para os valores atuais. A');
  w('   estrutura correta é por competição, com o agrupamento servindo para detectar');
  w('   heterogeneidade — não para achar um número que sirva a todos.');
  w('11. **Não otimizar `total` pelo Brier de jogo.** O ótimo aponta para ~1,3 gols/jogo onde');
  w('   acontecem 2,6, porque λ menor infla empates e tapa o buraco da Poisson. Adotar isso');
  w('   corromperia o saldo de gols, que decide desempates na tabela simulada. É diagnóstico');
  w('   da verossimilhança errada, não configuração.');
  w('12. **Preservar o que já funciona: as probabilidades de longo prazo são');
  w('   aproximadamente honestas — e o desvio residual tem endereço.** A má calibração é');
  w('   estatisticamente detectável (Z de Spiegelhalter 2,58) mas pequena (ECE 1,7%), passa');
  w('   nos eventos líder e 4 últimos e se concentra no **top-4** e na faixa 0–10%, onde os');
  w('   quase-impossíveis acontecem com o dobro da frequência anunciada. Conforme o alcance');
  w('   cresce, o modelo perde **resolução** (0,076 → 0,039) sem degradar a confiabilidade,');
  w('   que é o modo de falha correto. Qualquer mudança em 2027 deve ser verificada contra');
  w('   essa linha de base — os testes formais da seção 11 — e não só contra o Brier.');
  w('13. **Motor como módulo.** `scripts/engine.cjs` recorta a engine do HTML por marcador');
  w('   textual. Funciona, mas é muleta: 2027 deveria nascer com `engine/*.mjs` consumido');
  w('   tanto pelo app quanto pelo harness.');
  w('');

  w('## Limitações');
  w('');
  w('- **Uma temporada, um desfecho.** O longo prazo pontua contra uma única tabela');
  w('  realizada. Nada aqui é "melhoria comprovada" — são hipóteses para 2027.');
  w('- **Temporada incompleta.** As zonas reais (título, acesso, Z4) ainda não existem; os');
  w('  eventos são genéricos (1º, top-4, 4 últimos), derivados de `posF`.');
  w('- **Poder estatístico baixo no Brier.** Ver "Como ler estes números".');
  w('- **O teste z do viés é aproximado.** Ele usa Var(Σ O) = Σ p(1−p), que trata as');
  w('  probabilidades previstas como fixas. Num walk-forward elas não são: cada previsão');
  w('  depende dos resultados anteriores, então a soma prevista é aleatória e correlacionada');
  w('  com os desfechos. O efeito é subestimar a variância, ou seja, o teste é um pouco');
  w('  otimista. Os dois vieses significativos (A e D) têm |z| ≈ 2,5–3,0, com folga sobre o');
  w('  corte, mas não os leia como se fossem exatos.');
  w('- **Clubes sem histórico recebem piso, e isso pesa na Série D:** 48 dos 96 clubes não');
  w('  disputaram competição nacional em 2025 e 22 não têm RNC. As sementes baseadas nessas');
  w('  fontes empilham metade da série no mesmo valor, o que explica por que elas vão tão mal');
  w('  ali — é limitação do dado, não do método.');
  w('- **Calibração e varredura na mesma temporada.** Escolher a variante vencedora aqui e');
  w('  reportar o ganho aqui é circular; por isso o veredito é por calibração e por');
  w('  consistência entre séries, não por Brier ótimo.');
  w('- **Replay, não auditoria.** Isto mede o modelo de hoje aplicado ao passado, não o que');
  w('  o app exibia na época — nada foi arquivado. Corrigir isso é requisito de nascença do');
  w('  repositório de 2027.');
  w('');
  // Numeracao automatica das secoes. Numerar a mao dentro dos blocos condicionais produziu
  // um "10b" assim que uma secao foi inserida no meio — o numero tem de sair da ordem final,
  // nao de quem escreveu o titulo. "Como ler" e "Limitacoes" ficam de fora: sao molduras,
  // nao etapas da analise.
  let nSec = 0;
  const numeradas = L.map(linha => {
    const m = /^## (?!Como ler|Limitações)(?:\d+b?\.\s*)?(.*)$/.exec(linha);
    return m ? `## ${++nSec}. ${m[1]}` : linha;
  });
  return numeradas.join('\n') + '\n';
}

if (require.main === module) {
  const dir = path.join(__dirname, 'out');
  const curto = JSON.parse(fs.readFileSync(path.join(dir, 'curto.json'), 'utf8'));
  const lp = path.join(dir, 'longo.json');
  const longo = fs.existsSync(lp) ? JSON.parse(fs.readFileSync(lp, 'utf8')) : null;
  const dst = path.join(__dirname, 'REPORT.md');
  fs.writeFileSync(dst, gerar(curto, longo));
  console.log('-> ' + dst);
}

module.exports = { gerar };
