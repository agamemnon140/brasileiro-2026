# Revisão de novembro de 2026

Escrito em 14/11/2026, com o `results.json` de 13/11 (commit `ec62119`, v4.90). Séries C e D
encerradas; a B fechou a fase de liga em 14/11; a A estava na rodada 34.

O `REPORT.md` foi gerado com os jogos até 19/08. Esta nota registra o que o resto da
temporada fez com as conclusões dele e o que foi decidido a partir disso. Ela não substitui
o relatório: a seção de lições será reescrita quando o estudo multi-temporada fechar.

## O que mudou de veredito

**A config candidata perdeu no teste fora da amostra.** `node eval/holdout.cjs` pontua a
candidata de setembro (`pesoCasa` 0,58 nas ligas e semente da Série A encolhida para k=0,4)
só nos jogos disputados depois de 19/08.

| Série A | Brier dentro (225 jogos) | Brier fora (114 jogos) | Viés de casa fora |
|---|---|---|---|
| vigente | 0,6572 | 0,5265 | −0,9 pp |
| candidata | 0,6277 | 0,5462 | +8,3 pp |

A diferença fora da amostra é +0,0197 (IC95 de −0,008 a +0,045): não é significativa, mas
tem o sinal contrário ao ganho de −0,0295 medido dentro. O mandante venceu 45,3% dos
primeiros 225 jogos e 55,3% dos 114 seguintes. Nas Séries B e C a candidata quase não difere
da vigente, dentro ou fora.

**A ordenação das sementes da Série A virou.** No horizonte da rodada 23 a semente feita à
mão era a 5ª de 6 em RPS (0,1020, contra 0,0908 do RNC por posição). No horizonte da rodada
34 é a 1ª: 0,0797, contra 0,0846 a 0,0872 das baseadas no RNC e 0,0913 de "todos iguais".
Esses números vêm de uma execução de `node eval/run.cjs` interrompida depois da Série A
(5 mil simulações, 5 sementes); a corrida completa fica para dezembro.

**O histórico dá razão à candidata no mando, apesar do teste.** Na Série A, a fração de gols
em casa ficou entre 0,570 e 0,590 em 2021–24 e em 0,576 em 2026. O `pesoCasa` configurado
(0,652) está acima de toda temporada desde 2012. Na Série D, os gols por jogo da fase de
grupos ficaram entre 2,24 e 2,49 em 2021–25 e em 2,34 em 2026, contra `total` de 2,65. Fonte:
`campeonatobrasileirofull.csv` e `serie_d_2021_2025_jogos.csv`, que estão no projeto do
Claude e ainda não neste repo.

A leitura conjunta: 100 a 200 jogos não arbitram parâmetro em nenhuma direção. O z = −3 de
agosto e a reversão de novembro cabem ambos no ruído de uma temporada.

Atualização de 15/11: com os 1.520 jogos da Série A de 2022–2025 no repo, o viés de casa
aparece com z = 6 e nos quatro anos. O trecho de 2026 depois de 19/08 foi a exceção. Ver
"Mando, gols, preset e Dixon-Coles em 2022–2025".

## O que se confirmou

**O replay equivale ao publicado.** `node eval/paridade.cjs` mostra que `DEFAULT_CFG`,
`calcL`, `updR`, `initLeague`, `applyDrift` e as sementes de A/B/C são idênticos nas 64
versões do `index.html` desde 05/06, e que os motores de 05/06, de 19/08 e de hoje dão
projeções idênticas para os mesmos resultados. A limitação "replay, não auditoria" do
relatório vale só para janeiro a maio, para o mata-mata da D e para a Copa do Brasil.

**O modelo bate a taxa-base com os ratings aquecidos.** Nos 284 jogos de A, B e C depois de
19/08: Brier 0,5659 contra 0,6248 (IC95 da diferença de −0,086 a −0,029).

**A projeção de tabela bate a tabela congelada.** RPS de 0,0797 contra 0,1407 na A (rodada
34), 0,0898 contra 0,1395 na B (rodada 37) e 0,1267 contra 0,1947 na C (completa); o modelo
vence em 28 de 29 cortes. Corrida compacta: 3 mil simulações, 1 semente.

## O que foi decidido

| Tema | Decisão |
|---|---|
| Escopo | Só aprender com o modelo atual; nenhum modelo novo agora |
| Evidência | Multi-temporada: escolher em 2022–2025, confirmar em 2026 por série, assim que cada uma fecha |
| Base | Séries A, B, C e D; coletar B e C e recoletar a D com rodada. Série A de 2012 a 2021 como checagem de robustez |
| Régua | Eventos de zona, com os cortes reais de cada ano aplicados à fase de liga |
| Semente | Só regras derivadas de resultado: tabela do ano anterior, rating herdado do modelo, classificação final do estadual do ano e força do estado. Semente à mão e RNC entram só como referência em 2026 |
| Veredito | Lição confirmada se melhora o Brier de zona em pelo menos 12 de 16 células temporada×série (4 de 4 em lição de uma série só) e não piora em 2026 |
| Varreduras | Todas as que o `eval/` já tem rodam na base histórica |
| Lições | Seção reescrita à mão, cada lição com rótulo: confirmada multi-temporada, só 2026, revertida ou fato de código |

## O que está em revisão no REPORT.md

- **Recomendação 2** (`pesoCasa` único de 0,58): o histórico apoia, o teste de 2026 não.
  Atualização de 15/11: na base 2022–2025 a estrutura se sustenta jogo a jogo, com 0,60 no
  lugar de 0,58, e não tem efeito na tabela. Ver a seção de 15/11.
- **Recomendação 3** (amplitude da semente da Série A 2–3× larga demais): k=0,4 sozinho
  piorou o Brier fora da amostra em +0,0123.
- **Recomendação 8** (a semente neutra empata com a vigente): no horizonte da rodada 34 a
  vigente ganha da neutra por 0,0797 a 0,0913.

- **Recomendação 9** (preset `base` como padrão), desde 15/11: não se sustenta em 2022–2025
  nem na temporada de 2026 completa, fora da Série D.
- **Recomendação 7** (Dixon-Coles ajuda pouco) e o diagnóstico de gols da **11**: confirmados
  em 2022–2025. O `total` da Série D está 0,34 gol alto.

As recomendações 0, 4, 10 e 13 são fatos de código ou de desenho e não dependem da amostra.

## Primeiro resultado multi-temporada (14/11)

`node eval/hist/sementes.cjs` roda o motor de hoje nas Séries A, B, C e D de 2022 a 2025 e
compara a semente "tabela do ano anterior" com "todos iguais", pelo Brier dos eventos de
zona em quatro cortes (pré-temporada, 25%, 50% e 75% das rodadas; 2 mil simulações por ponto).

| Amplitude k | Células em que melhora (de 16) | A | B | C | D | Ganho médio | Só pré-temporada |
|---|---|---|---|---|---|---|---|
| 0,25 | 10 | 3 | 3 | 2 | 2 | +1,9% | 12 de 16, +3,7% |
| 0,5 | 7 | 3 | 2 | 1 | 1 | 0,0% | 8 de 16, +1,6% |
| 1,0 | 5 | 3 | 1 | 1 | 0 | −9,7% | 5 de 16, −8,3% |

Pela regra fixada (pelo menos 12 de 16), **nenhuma amplitude passa**. Amplitude cheia piora
em quase toda parte; a pequena ajuda um pouco na A e na B e não ajuda na C nem na D. Isso
concorda com o relatório de setembro num ponto: a semente rende mais quando é tímida.

Ressalvas: é uma só construção de semente (Elo linear no posto dentro da série); na D quase
metade dos clubes não tem posto no ano anterior; a regra conta diferenças pequenas e grandes
do mesmo jeito; faltam o rating herdado, os estaduais e a força do estado.

A CBF troca o id do clube quando ele vira SAF. `sementes.cjs` religa 26 ids pelo nome; sem
isso, Fortaleza (4º em 2024) e Atlético Mineiro (7º em 2022) entravam como "sem histórico".

## Estaduais: o que a Wikipedia entrega (14/11)

`eval/hist/estaduais.py` lê as seções "Classificação geral/final" das páginas dos estaduais
na Wikipedia pt e grava `eval/data/hist/estaduais_classificacao.json` (clubes em ordem de
colocação). Cobertura na janela 2022–2025: **58 de 108** tabelas.

- Completos (4 anos): AM, BA, GO, PA, PE, RJ, RN, RR, RS, SC, SP.
- Parciais: MG (3), CE, DF, PR, SE (2), AP, MS, PB (1). Ou a página não tem a seção, ou a
  tabela é irregular (CE 2024–26, MG 2023).
- Sem nada: AC, AL, ES, MA, MT, PI, RO, TO. A Wikipedia pt não tem página da primeira
  divisão desses estados para 2022–2025 (conferido por prefixo de título e por busca).

Os oito estados sem cobertura são justamente os de clubes quase só de Série D, onde este
input mais pesa. Faltam também a UF de cada clube (a API da CBF não traz) e o casamento dos
nomes da Wikipedia com os ids da CBF. As tabelas são os nomes como a Wikipedia os escreve.

## Força do estado na Série D (14/11)

`node eval/hist/sementes.cjs --uf` testa, só na Série D de 2022 a 2025, a força do estado
como semente: o aproveitamento dos clubes de cada UF na fase de grupos de anos anteriores,
puxado para a média nacional. Régua: 1º e top-4 do grupo, quatro cortes, 3 mil simulações.

| Semente | Células em que melhora (de 4) | Ganho médio |
|---|---|---|
| UF, só o ano anterior, k=0,25 | 0 | −4,6% |
| UF, só o ano anterior, k=0,5 | 0 | −14,7% |
| UF, só o ano anterior, k=1 | 0 | −37,3% |
| UF acumulada desde 2021, k=0,1 | 3 | +0,4% |
| UF acumulada desde 2021, k=0,25 | 2 | −1,3% |
| Tabela do ano anterior, k=0,25 | 2 | +1,2% |
| Média das duas, k=0,25 | 2 | −0,2% |

**Nenhuma passa** (lição de uma série só pede 4 de 4). A força de um estado medida num ano
só é ruído: o Pará sai como o mais forte na base de 2021 e entre os mais fracos na de 2022.
Acumulando anos ela fica neutra. Isso não contradiz o relatório de setembro, em que a
tabela de UF feita à mão bateu "todos iguais" em 2026: diz apenas que uma regra simples,
derivada de um a quatro anos de Série D, não reproduz esse ganho em 2022–2025.

A UF de cada clube está em `eval/data/hist/serie_d_clubes.json` (64 clubes por ano, 2021 a
2025), junto com a via de classificação. Veio das tabelas de participantes da Wikipedia pt,
casadas com os ids da CBF por nome; 16 pares foram casados à mão e 5 ids corrigidos (dois
"Operário" e dois "São Raimundo" no mesmo ano). Os scripts desse casamento não estão no repo.

## Rating herdado e via de classificação (14/11)

`node eval/hist/sementes.cjs --herdado` testa as duas candidatas que não pediam coleta nova.

- **Rating herdado**: o motor roda a temporada anterior partindo de todos iguais e o clube
  entra no ano seguinte com o Elo em que terminou, mais um degrau por divisão trocada
  (2 desvios-padrão do Elo final, cerca de 100 pontos por nível). Quem não jogou série
  nacional no ano anterior recebe o piso da série.
- **Via de classificação** (só Série D): o caminho de entrada, que é a colocação no estadual
  do ano anterior. Ordem: rebaixado da C, campeão estadual, vice ou melhor colocado, copa
  ou 2º melhor, e assim por diante.

Mesma régua dos testes anteriores (zonas reais, quatro cortes, 2 mil simulações, contra
"todos iguais"). O `k` do rating herdado multiplica o desvio bruto; a amplitude resultante
entre o melhor e o pior clube vai de 60–115 pontos de Elo (k=0,5) a 245–455 (k=2).

| Semente | Células em que melhora | Por série (de 4) | Ganho médio | Só pré-temporada |
|---|---|---|---|---|
| Herdado, k=0,5 | 9 de 16 | A 3, B 2, C 3, D 1 | +1,1% | 11 de 16, +2,7% |
| Herdado, k=1 | 6 de 16 | A 3, B 1, C 1, D 1 | −2,0% | 8 de 16, −0,4% |
| Herdado, k=2 | 3 de 16 | A 1, B 1, C 1, D 0 | −12,2% | 4 de 16, −10,4% |
| Via, k=0,25 (D) | 3 de 4 | D 3 | +0,9% | 3 de 4, −0,5% |
| Via, k=0,5 (D) | 3 de 4 | D 3 | −3,0% | 1 de 4, −7,1% |
| Herdado k=0,5 + via (D) | 2 de 4 | D 2 | +0,3% | 2 de 4, −0,5% |
| Herdado k=1 + via (D) | 1 de 4 | D 1 | −7,5% | 1 de 4, −8,2% |

**Nenhuma passa.** A via de classificação melhora em 2022, 2024 e 2025 e piora 6,3% em
2023, e a regra de série única pede 4 de 4.

## Leitura conjunta das cinco construções (14/11)

Tabela do ano anterior, rating herdado, força do estado de um ano, força do estado
acumulada e via de classificação: nenhuma foi confirmada pela regra fixada antes (12 de 16
células, ou 4 de 4 para lição de uma série). O que os três testes dizem juntos:

1. **A amplitude decide mais que a construção.** Duas sementes diferentes dão a mesma curva:
   até cerca de 115 pontos de Elo entre o melhor e o pior, ganho pequeno (+1% a +2%); entre
   125 e 230, neutro a levemente negativo; acima de 245, perda clara (−10% a −12%).
2. **O risco é assimétrico.** Nas duas sementes testadas nas 16 células, a melhor célula
   ganha 13% e a pior perde 33%; na força do estado de um ano a pior perde 51%. Errar para o
   lado largo custa mais do que errar para o lado "todos iguais".
3. **O ganho mora antes da 1ª rodada.** Na tabela do ano anterior com k=0,25, +3,7% no corte
   de pré-temporada e +0,9% na média dos três cortes com jogos; no herdado com k=0,5, +2,7%
   e +0,1%. Com um quarto do campeonato jogado a semente já quase não importa.
4. **A Série A é a única em que o passado carrega sinal.** Ganho médio por série da tabela
   do ano anterior (média dos cortes | só pré-temporada):

   | Amplitude | A | B | C | D |
   |---|---|---|---|---|
   | k=0,25 (88 pontos) | +4,2% \| +7,9% | +1,0% \| +3,0% | +1,2% \| +2,0% | +1,2% \| +1,8% |
   | k=0,5 (175) | +5,2% \| +10,0% | −0,6% \| +1,0% | −1,9% \| −2,1% | −2,9% \| −2,6% |
   | k=1 (350) | +0,1% \| +5,3% | −7,4% \| −6,7% | −12,5% \| −13,7% | −19,2% \| −18,3% |

   Na A a semente melhora em 3 dos 4 anos nas três amplitudes e 2023 é o ano em que piora em
   todas. Na D, onde 26 a 32 dos 64 clubes não têm histórico nacional no ano anterior,
   qualquer amplitude acima da mínima piora.
5. **Contagem de células tem ruído de ±2.** Tratando diferença menor que 1% como empate, a
   tabela do ano anterior com k=0,25 fica em 8 vitórias, 3 empates e 5 derrotas, e o herdado
   com k=0,5 em 7, 4 e 5. Nenhuma chega perto de 12 por qualquer contagem.

O que isso diz sobre a recomendação 3 de setembro (encolher a semente da Série A para
k=0,4): a base de 2022–2025 aponta para a mesma vizinhança, com o melhor resultado em
k=0,5 e amplitude cheia neutra, mas com 3 de 4 anos e não 4 de 4. O teste fora da amostra
de 2026 foi na direção contrária (encolher só a amplitude: −0,015 nos jogos até 19/08,
+0,012 [−0,001; +0,026] nos de depois). São objetos diferentes: aqui a semente é uma regra,
em 2026 é a nota dada à mão. A recomendação segue como hipótese, sem confirmação.

Para 2027, o que se sustenta até aqui: semente por regra é sinal fraco, vale na Série A com
amplitude moderada e some depressa; nas séries B, C e D "todos iguais" não perde nada que
se meça a partir de um quarto do campeonato. A nota à mão foi a melhor das seis sementes na
Série A de 2026 no horizonte de 34 rodadas e a quinta no de 23; é um caso só e não há como
reproduzi-la em 2022–2025.

## Mando, gols, preset e Dixon-Coles em 2022–2025 (15/11)

`node eval/hist/parametros.cjs` põe as recomendações de setembro que não são de semente
contra a config vigente nas 16 células. São três estágios: jogo a jogo (5.592 jogos, Brier
de vitória, empate e derrota, bootstrap pareado), `--zona` (a régua combinada, 2 mil
simulações) e `--2026` (a confirmação).

A candidata é montada fora da amostra. Para cada ano, o `pesoCasa` único que minimiza o
Brier das quatro séries nos outros três anos e o total de gols observado na mesma série nos
outros três. O `pesoCasa` escolhido foi 0,60 nas quatro dobras.

O que os jogos de 2022–2025 mostram (viés = vitória do mandante prevista menos a observada):

| Série | Jogos | Mandante vence | Gols por jogo: real · config | Fração dos gols em casa: real · config | Viés de casa da vigente |
|---|---|---|---|---|---|
| A | 1.520 | 47,2% | 2,46 · 2,50 | 0,585 · 0,652 | +7,5 pp (z 6,0) |
| B | 1.520 | 48,5% | 2,13 · 2,20 | 0,606 · 0,583 | −4,8 pp (z −3,9) |
| C | 760 | 48,0% | 2,23 · 2,20 | 0,592 · 0,583 | −3,5 pp (z −1,9) |
| D | 1.792 | 46,1% | 2,31 · 2,65 | 0,599 · 0,604 | +2,8 pp (z 2,4) |

Na A o modelo superestima o mandante nos quatro anos (+10,0, +8,2, +7,5 e +4,4 pp); na B
subestima nos quatro (−7,1, −2,4, −8,4 e −1,4 pp).

Jogo a jogo, variante menos vigente (negativo é melhor; "sig" quando o IC95 exclui zero):

| Variante | A | B | C | D | Geral | Células melhores |
|---|---|---|---|---|---|---|
| `pesoCasa` 0,60, fora da amostra | −0,0094 sig | −0,0026 sig | −0,0020 | −0,0003 | −0,0036 sig | 15 de 16 |
| Total observado, fora da amostra | −0,0002 | +0,0002 | 0,0000 | −0,0020 sig | −0,0006 sig | 10 de 16 (D 4 de 4) |
| Os dois juntos | −0,0094 sig | −0,0025 sig | −0,0019 | −0,0021 sig | −0,0042 sig | 16 de 16 |
| `pesoCasa` 0,58 (rec. 2) | −0,0089 sig | +0,0006 | +0,0005 | −0,0005 | −0,0023 sig | 4 de 16 |
| Preset `base` (rec. 9) | +0,0012 | +0,0075 sig | +0,0043 | −0,0047 sig | +0,0015 | 6 de 16 |
| Preset `agressivo` | +0,0185 sig | +0,0308 sig | +0,0286 sig | +0,0064 | +0,0193 sig | 1 de 16 |
| Dixon-Coles ρ=−0,05 (rec. 7) | −0,0004 | +0,0004 | −0,0001 | −0,0009 sig | −0,0003 | 13 de 16 |
| Dixon-Coles ρ=−0,10 | −0,0004 | +0,0012 | +0,0002 | −0,0013 | −0,0002 | 11 de 16 |

Os números são com "todos iguais"; com a tabela do ano anterior em k=0,25 mudam na quarta
casa (os dois juntos: 16 de 16, −0,0041). O Brier da vigente nos 5.592 jogos é 0,6244 contra
0,6372 da taxa-base.

Eventos de zona (`--zona`), contra a vigente:

| Variante | Células melhores | Ganho médio |
|---|---|---|
| `pesoCasa` 0,60 | 6 de 16 | −0,1% |
| Total observado | 8 de 16 | 0,0% |
| Os dois juntos | 10 de 16 | +0,1% |
| `pesoCasa` 0,58 | 5 de 16 | −0,3% |
| Preset `base` | 6 de 16 | +0,2% |

Nenhuma passa, e todas ficam dentro de ±0,3%, que é o ruído de 2 mil simulações.

Em 2026 (`--2026`, com a semente do app; `pesoCasa` 0,60 e totais A 2,46, B 2,13, C 2,23 e
D 2,31 tirados dos quatro anos), jogo a jogo:

| Variante | A (339) | B (373) | C (190) | D (480) | Quatro ligas (1.382) |
|---|---|---|---|---|---|
| Os dois juntos | −0,0043 | +0,0013 | −0,0003 | −0,0034 sig | −0,0019 [−0,0050; +0,0013] |
| Preset `base` | +0,0048 | +0,0036 | +0,0089 | −0,0053 | +0,0015 [−0,0024; +0,0057] |
| Dixon-Coles ρ=−0,05 | −0,0008 | +0,0008 | +0,0009 | −0,0015 sig | −0,0004 [−0,0012; +0,0005] |

O viés de casa da Série A em 2026 cai de +6,3 pp para zero e o da D de +5,6 para +3,6 pp.

Leitura:

1. **O mando da Série A está alto, e o das Séries B e C está baixo.** Cinco temporadas
   apontam o mesmo lado na A: o mandante venceu 47,2% em 2022–2025 e 48,7% em 2026, contra
   cerca de 55% previstos. O z = −3 de agosto era real; o trecho depois de 19/08 (55,3% em
   114 jogos) foi o ponto fora da curva. Na B e na C a correção vai no sentido contrário ao
   da recomendação 2: 0,583 já subestima o mandante, e 0,58 piora um pouco.
2. **Um número serve às quatro ligas, e ele é 0,60.** A estrutura da recomendação 2 ("dois
   números, não cinco") se sustenta; o valor sai de quatro temporadas em vez de dois terços
   de uma.
3. **Nada disso muda a tabela.** Pela régua combinada, tudo é neutro. Em turno e returno
   todo clube tem o mesmo número de jogos em casa, então o mando se cancela na classificação
   final. Ele pesa na probabilidade de cada jogo, que o app mostra, e no mata-mata, onde quem
   decide em casa não é simétrico. O mata-mata não foi medido aqui.
4. **O `total` da Série D está 0,34 gol acima do real** há cinco temporadas seguidas (2,31
   em 2022–2025 e 2,34 em 2026, contra 2,65). Corrigir melhora o jogo a jogo nos quatro anos
   e em 2026 e reduz o déficit de empates da D de −2,8 para −1,2 pp. Os totais de A, B e C
   estão certos a menos de 0,07.
5. **Preset `base` como padrão: revertida.** Pior na B (significativo) e na C e neutro na A
   em 2022–2025, e de novo pior nas três com a temporada de 2026 completa. A Série D é a
   exceção: `base` é melhor em 3 dos 4 anos (−0,0047, significativo) e em 2026 (−0,0053, com
   o IC encostando em zero), mas os eventos de zona não confirmam (2 de 4). `agressivo`
   perde em quase toda parte.
6. **Dixon-Coles: confirmado que ajuda pouco.** ρ=−0,05 melhora em 13 das 16 células, por
   0,0003, e o agrupado não se distingue de zero. Não paga a mudança no motor.

**Veredito.** Pela régua fixada (eventos de zona), nada passa. Jogo a jogo, mando e gols
passam em 16 de 16 fora da amostra e não pioram 2026. A regra foi escrita para lições que
mudam a tabela, e a régua de zona é cega ao mando por construção. O rótulo que descreve o
achado é "confirmada multi-temporada jogo a jogo, sem efeito na tabela"; a decisão de
adotá-lo é do dono do projeto.

Ressalvas: 2022–2025 roda sem a nota à mão; o teste z do viés é aproximado, como no
relatório; nada aqui mede o mata-mata nem a Copa do Brasil.

## Zonas rodada a rodada em 2026: precisão e calibração (15/11)

`node eval/zonas2026.cjs` responde a duas perguntas sobre o que o app dizia ao longo do ano
de quem terminaria em cada zona: quanto acertou, e se um evento anunciado com 50%
aconteceu em metade das vezes. Em cada rodada, da pré-temporada à penúltima, o Monte Carlo
roda sabendo só os resultados até ali (5 mil simulações, config e semente do app) e a
probabilidade de cada clube em cada zona é comparada com a tabela final da fase de liga.
São 8.820 previsões de 156 clubes.

**Calibração: sim, na média.** As quatro séries juntas:

| Faixa anunciada | Previsões | Casos | Previsto | Aconteceu | Diferença (IC95, pp) |
|---|---|---|---|---|---|
| 0% | 2.349 | 244 | 0% | 0% | +0,2 [−0,1; +0,7] |
| 0,5–10% | 2.247 | 273 | 4% | 3% | −0,9 [−3,2; +2,4] |
| 10–20% | 1.110 | 245 | 15% | 13% | −1,3 [−6,7; +5,0] |
| 20–30% | 721 | 188 | 25% | 24% | −0,4 [−8,1; +8,1] |
| 30–40% | 434 | 156 | 35% | 34% | −0,4 [−9,6; +9,3] |
| 40–60% | 633 | 171 | 50% | 50% | +0,4 [−9,8; +10,0] |
| 60–70% | 293 | 129 | 65% | 64% | −1,1 [−11,9; +8,5] |
| 70–80% | 264 | 122 | 75% | 83% | +7,5 [−0,5; +14,3] |
| 80–90% | 236 | 102 | 85% | 92% | +7,2 [+1,0; +12,1] |
| 90–99,5% | 266 | 85 | 95% | 95% | −0,6 [−7,2; +4,1] |
| 100% | 267 | 71 | 100% | 100% | +0,1 [0,0; +0,1] |

"Casos" são pares clube-zona distintos. As previsões de um clube ao longo das rodadas
apontam para o mesmo desfecho, então o intervalo vem de um bootstrap que reamostra clubes
inteiros. O erro médio de calibração é de 1,0 ponto. A única faixa em que o intervalo exclui
zero é a de 80–90%, onde o modelo é tímido: o que ele dá com 70% a 90% acontece em 83% a 92%
das vezes.

Na faixa de 40–60%, por série: A 50% previsto e 45% ocorrido (27 casos), B 50% e 56% (29),
C 49% e 51% (23), D 51% e 50% (92). No topo as séries divergem: de 70% a 99,5%, a A acertou
97% contra 87% anunciados, a B 100% contra 86%, a D 89% contra 85% e a C só 65% contra 84%
(72 previsões de poucos clubes: Guarani com 97% de G8 na rodada 10, Amazonas com 91% na
rodada 4 e Anápolis com 91% de Z2 na rodada 14 não se confirmaram).

**Precisão: varia muito por série e por zona.**

| Série | Zona | Brier: modelo · taxa-base | Habilidade | Acerto dos apontados: modelo · tabela do momento · acaso | Na pré-temporada |
|---|---|---|---|---|---|
| A (prévia) | título | 0,028 · 0,048 | 42% | 45% · 27% · 5% | 100% |
| A (prévia) | G4 | 0,062 · 0,160 | 61% | 76% · 66% · 20% | 75% |
| A (prévia) | G6 | 0,082 · 0,210 | 61% | 80% · 83% · 30% | 67% |
| A (prévia) | Z4 | 0,091 · 0,160 | 43% | 61% · 52% · 20% | 50% |
| B | 1º | 0,043 · 0,048 | 9% | 16% · 11% · 5% | 0% |
| B | acesso direto (top-2) | 0,067 · 0,090 | 26% | 41% · 34% · 10% | 0% |
| B | G6 | 0,116 · 0,210 | 45% | 70% · 68% · 30% | 50% |
| B | Z4 | 0,058 · 0,160 | 64% | 82% · 82% · 20% | 50% |
| C | 1º | 0,052 · 0,048 | −10% | 0% · 0% · 5% | 0% |
| C | G8 | 0,203 · 0,240 | 15% | 60% · 63% · 40% | 50% |
| C | Z2 | 0,065 · 0,090 | 28% | 44% · 44% · 10% | 0% |
| D | 1º do grupo | 0,084 · 0,139 | 39% | 60% · 62% · 17% | 31% |
| D | top-4 do grupo | 0,138 · 0,222 | 38% | 85% · 85% · 67% | 70% |

Habilidade é 1 menos a razão entre o Brier do modelo e o de dar a todos a mesma chance: 0%
é não saber nada além do tamanho da zona, 100% é acertar tudo. "Acerto dos apontados": em
cada rodada, dos k clubes que o modelo dava como mais prováveis na zona, a fração que
terminou nela, na média das rodadas a partir da primeira; a tabela do momento aponta quem
ocupava a zona naquela rodada.

Leitura:

1. **As probabilidades são honestas, com leve timidez entre 70% e 90%.** A afirmação do
   relatório de setembro de que os quase impossíveis aconteciam com o dobro da frequência
   anunciada não se repete com as zonas reais e a temporada completa: 4% previstos, 3%
   ocorridos.
2. **Para dizer quem está na zona, o modelo empata com a tabela do momento.** Ganha no
   título, no G4 e no Z4 da A e no topo da B, e empata ou perde por pouco no resto. O que
   ele acrescenta é a medida da incerteza: conforme a zona, o Brier da tabela congelada é de
   1,3 a 2,7 vezes o dele.
3. **A Série C é a mais fraca.** No 1º lugar o modelo perde para a taxa-base, e o clube que
   terminou em 1º (Botafogo-PB) tinha menos de 0,5% na rodada 10. Turno único de 19 rodadas
   e semente quase plana deixam pouco para o modelo aprender.
4. **Campeão é o evento mais difícil.** Na B, o Novorizontino tinha 2% de título na rodada 3.
5. **Antes da bola rolar o modelo sabe pouco fora da Série A.** Na pré-temporada acertou 3
   dos 4 do G4 da A, mas nenhum dos dois de acesso direto da B, e na D ficou em 70% no top-4
   dos grupos contra 67% do acaso.

Ressalvas. A Série A é uma prévia: o desfecho é a tabela da rodada 34 e o Monte Carlo trata
essa rodada como o fim, que não é o que o app mostrava (ele projetava a rodada 38); o número
definitivo sai em dezembro. Na B, sete placares da rodada 38 vêm da imprensa
(`eval/data/serie_b_r38_imprensa.json`) até o `results.json` trazê-los. Na D o replay usa o
motor de hoje, e a paridade com o publicado só foi conferida para A, B e C desde 05/06. As
zonas são as da fase de liga; playoff da B, quadrangular da C e mata-mata da D não entram.

## Fases finais das Séries C e D em 2026 (15/11)

`node eval/matamata2026.cjs` estende a medida de zonas para depois da fase de liga: acesso,
final e título na Série C; cada fase do mata-mata, acesso e título na Série D. O eixo do
tempo começa na pré-temporada e continua pelas rodadas dos quadrangulares e pelas fases do
mata-mata, com a mesma máscara de fases da aba Evolução. Só entram previsões em aberto
(chance maior que zero e menor que 100%), e a referência divide as vagas que restam
igualmente entre os clubes ainda na disputa.

| Série | Evento | Vagas | Previsões abertas | Brier: modelo · referência | Habilidade |
|---|---|---|---|---|---|
| C | acesso à Série B | 4 | 408 | 0,172 · 0,175 | 2% |
| C | chegar à final | 2 | 405 | 0,107 · 0,105 | −2% |
| C | campeão | 1 | 408 | 0,067 · 0,059 | −13% |
| D | passar da 2ª fase | 32 | 704 | 0,233 · 0,250 | 7% |
| D | chegar às oitavas | 16 | 736 | 0,164 · 0,190 | 14% |
| D | chegar às quartas | 8 | 752 | 0,107 · 0,116 | 7% |
| D | chegar à semifinal | 4 | 760 | 0,059 · 0,065 | 10% |
| D | chegar à final | 2 | 764 | 0,040 · 0,036 | −11% |
| D | acesso à Série C | 6 | 764 | 0,089 · 0,093 | 5% |
| D | campeão | 1 | 757 | 0,022 · 0,020 | −11% |

**Calibradas, mas quase sem habilidade.** Juntando C e D (6.458 previsões abertas de 84
clubes), o erro médio de calibração é de 2,0 pontos e a faixa de 40–60% deu 49% previstos
e 50% ocorridos (596 previsões, 117 casos). Nenhuma faixa sai da margem no conjunto. Mas
nos quadrangulares da C o modelo não sabe mais do que o número de vagas, e na D ganha de 5%
a 14% para dizer quem passa de fase e perde para a referência em final e título. Os dois
campeões saíram de onde o modelo menos esperava: o Uberlândia venceu o grupo com 18 pontos
e, encerrada a fase de grupos, tinha 0,26% de título, seis vezes menos que o 1 em 64 do
acaso, porque a semente por estado punha o grupo dele entre os mais fracos.

**Erro encontrado no app: a final da Série C não é reconhecida.** A API da CBF entregou a
final como "GRUPO D", e o `results.json` guarda as duas partidas com `fase: "Q"` e
`grupo: "D"`. `applyQuadCAuto` só trata como final as linhas com `fase: "FINAL"`, então o
motor simula a final já disputada: com o `results.json` de 13/11, o app dá 64% de título à
Ferroviária e 36% ao Maringá, que foi o campeão (1×1 e 2×1). O comentário em
`scripts/fetch_tables.mjs` previa o grupo com o nome "FINAL", formato "ainda não visto".
Efeitos: o cartão da Série C não fecha como decidido, e a vaga de campeão da C na Copa do
Brasil 2027 segue como incerta. `matamata2026.cjs` renomeia as duas linhas antes de medir.
A correção é no app ou no coletor e fica fora deste PR.

## Os desfechos mais improváveis de 2026 (15/11)

Para cada clube e evento, o momento em que o modelo dava a menor chance ao que aconteceu
(ou a maior ao que não aconteceu). Com 5 mil simulações, o piso é 0,02%.

| Série | Clube | Evento | Quando | Chance dada | O que houve |
|---|---|---|---|---|---|
| C | Botafogo-PB | 1º da fase de liga | após a rodada 10 | menos de 0,02% | aconteceu |
| D | Uberlândia | campeão | grupos encerrados | 0,26% | aconteceu |
| A (prévia) | Corinthians | Z4 | após a rodada 22 | 0,52% | aconteceu |
| D | Uberlândia | chegar à final | grupos encerrados | 0,68% | aconteceu |
| C | Maringá | campeão | após a rodada 6 | 1,5% | aconteceu |
| B | Novorizontino | 1º | após a rodada 3 | 1,7% | aconteceu |
| D | ASA | chegar à final | após a rodada 5 | 2,1% | aconteceu |
| C | Guarani | G8 | após a rodada 10 | 97,3% | não aconteceu |
| A (prévia) | Athletico-PR | G6 | pré-temporada | 2,8% | aconteceu |
| D | Joinville | top-4 do grupo | após a rodada 4 | 97,1% | não aconteceu |
| D | Nacional-AM | acesso à Série C | após a rodada 7 | 3,5% | aconteceu |
| D | CSA | acesso à Série C | depois das oitavas | 91,0% | não aconteceu |

Num conjunto de 15 mil previsões, alguns eventos de 1% têm de acontecer: na faixa abaixo de
0,5% o modelo fez 2.349 previsões de zona na fase de liga e 0,2% delas se confirmaram. A
lista não acusa descalibração; mostra onde a informação faltou (viradas na C, semente por
estado na D).

## Drift e calibração em 2022–2025 (15/11)

A medida de 2026 mostrou timidez entre 70% e 90%. `node eval/hist/calibracao.cjs` repete a
medida nas 16 células de 2022 a 2025 (22.368 previsões de zona, semente "todos iguais") e
testa o parâmetro que controla a largura da projeção, o drift.

| Base | Drift | Brier | Erro médio de calibração | Anunciado 70–80%: aconteceu | Anunciado 80–90%: aconteceu | Anunciado 100%: aconteceu |
|---|---|---|---|---|---|---|
| 2022–2025 | 0 | 0,0929 | 1,10 pp | 70,8% | 79,1% (fora da margem) | 98,6% |
| 2022–2025 | 15 (app) | 0,0929 | 1,08 pp | 76,5% | 86,8% | 99,8% |
| 2022–2025 | 30 | 0,0944 | 2,02 pp | 80,6% | 90,6% (fora) | 100% |
| 2026, semente do app | 0 | 0,0843 | 1,70 pp | 75,3% | 80,9% | 100% |
| 2026, semente do app | 15 (app) | 0,0828 | 0,98 pp | 82,6% | 92,4% (fora) | 100% |
| 2026, semente do app | 30 | 0,0853 | 2,20 pp | 85,0% (fora) | 91,6% | 100% |

1. **A timidez de 2026 não se repete.** Com o drift do app, 2022–2025 fica dentro da margem
   do 10% ao 100%, e nas quatro séries: a C, que em 2026 pareceu confiante demais no topo,
   deu 91% para 85% anunciados e 97% para 96%.
2. **O drift está no lugar.** Sem ele o modelo fica confiante demais (85% anunciados viram
   79%, e o que ele dava como certo falhou em 1,4% das vezes); com o dobro fica tímido e o
   Brier piora. Em 2026 o drift de 15 também tem o menor Brier e
   o menor erro de calibração dos três.
3. **O único desvio que se repete é pequeno:** o que o modelo dá com 0,5% a 10% acontece
   menos do que ele diz (4,3% anunciados e 2,6% ocorridos em 2022–2025; 4,2% e 3,3% em 2026).

Nenhum ajuste de parâmetro sai da calibração. O intervalo de uma faixa em que tudo (ou
nada) aconteceu passou a ser o binomial exato com um ensaio por clube, porque o bootstrap
degenera nesse caso e acusava "fora da margem" faixas com 10 clubes e 10 acertos.

O painel interativo com as curvas por série e zona está em
<https://claude.ai/artifact/W9pUszM6skfX2FkxqMNbC1>; `eval/painel/` guarda a página e o
script que monta os dados dela.

## Por conjunto de rodadas (15/11)

`zonas2026.cjs` e `matamata2026.cjs` passaram a separar as mesmas medidas pelo momento da
previsão: metades e quartos da fase de liga de cada série (o 1º quarto de 38 rodadas são as
previsões feitas antes das rodadas 1 a 10) e, nas fases finais, o que foi previsto depois
dela. O painel ganhou o seletor "Rodadas" e um quadro por quarto.

Zonas da fase de liga, quatro séries juntas:

| Quarto | Previsões | Brier | Erro médio de calibração | Anunciado 40–60%: aconteceu | Anunciado 80–90%: aconteceu |
|---|---|---|---|---|---|
| 1º | 2.396 | 0,119 | 1,9 pp | 48% | 91% |
| 2º | 2.044 | 0,093 | 2,0 pp | 56% | 89% |
| 3º | 2.396 | 0,074 | 1,7 pp | 51% | 95% (fora da margem) |
| 4º | 1.984 | 0,039 | 1,0 pp | 46% | 96% (fora) |

Habilidade sobre a taxa-base, por quarto:

| Série | Zona | 1º | 2º | 3º | 4º |
|---|---|---|---|---|---|
| A (prévia) | título | 33% | 37% | 23% | 79% |
| A (prévia) | G4 | 54% | 57% | 63% | 72% |
| A (prévia) | G6 | 41% | 49% | 67% | 89% |
| A (prévia) | Z4 | 27% | 46% | 31% | 72% |
| B | 1º | −7% | 5% | 3% | 35% |
| B | acesso direto (top-2) | −7% | 7% | 39% | 67% |
| B | G6 | 1% | 31% | 68% | 80% |
| B | Z4 | 18% | 69% | 76% | 95% |
| C | 1º | −2% | −21% | −23% | 11% |
| C | G8 | 4% | −7% | 22% | 49% |
| C | Z2 | 7% | 28% | 28% | 53% |
| D | 1º do grupo | 14% | 28% | 47% | 77% |
| D | top-4 do grupo | 14% | 34% | 48% | 63% |

1. **A calibração vale em todo o campeonato**, não só na média: a faixa de 40–60% dá de 46%
   a 56% nos quatro quartos, e o erro médio fica entre 1,0 e 2,0 pontos.
2. **A habilidade é que muda.** No 1º quarto a Série A já sabe alguma coisa (27% a 54%), a
   Série B não sabe nada (−7% a 18%) e a C fica negativa no 1º lugar até o último quarto.
3. **A timidez de 2026 está na segunda metade** (85% anunciados, 95% a 96% ocorridos no 3º
   e no 4º quarto). Em 2022–2025, com o mesmo drift, a segunda metade dá 86% para 85%
   anunciados; continua sendo coisa de 2026.
4. **Nas fases finais, depois da fase de liga**, o modelo ganha no acesso da C (38%) e nas
   oitavas da D (23%) e perde em final e título nas duas (−26% a −31%).

## O que falta

1. Feito em 14/11: jogos das quatro séries em 2021–2025. A API do site da CBF serve as
   edições de 2018 a 2026; `eval/data/hist/cbf_jogos_2021_2025.csv` tem os 7.428 jogos com
   grupo, rodada, data, ids dos clubes e pênaltis. `eval/hist/coletar_cbf.browser.js` é o
   coletor e `eval/hist/ingerir.cjs` normaliza e confere. As tabelas de A e B de 2025
   reconstruídas dos jogos batem, campanha por campanha, com as classificações finais da
   Wikipedia.
2. Parcial: classificação final dos estaduais, 58 de 108 tabelas de 2022–2025 (oito estados
   sem página na Wikipedia pt; faltam também as de 2026). Força do estado: testada, não passa.
3. Feito em 14/11: carregador de temporadas passadas, zonas reais e quatro das cinco
   candidatas de semente. Falta a do estadual do mesmo ano, que depende do item 2 e de casar
   os nomes da Wikipedia com os ids da CBF.
4. Veredito pela regra de células: nenhuma semente passou. Mando e gols passam jogo a jogo
   e são neutros na tabela (seção de 15/11). Falta decidir o rótulo desse caso e reescrever
   a seção de lições.
5. Drift: medido em 15/11, fica como está. Não medido: o mando no mata-mata.
6. Corrigir no app o reconhecimento da final da Série C (seção de 15/11), em PR separado.
7. A corrida completa de dezembro (`node eval/run.cjs --full`), depois do fim da Série A.
