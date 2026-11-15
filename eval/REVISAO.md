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
- **Recomendação 3** (amplitude da semente da Série A 2–3× larga demais): k=0,4 sozinho
  piorou o Brier fora da amostra em +0,0123.
- **Recomendação 8** (a semente neutra empata com a vigente): no horizonte da rodada 34 a
  vigente ganha da neutra por 0,0797 a 0,0913.

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

## O que falta

1. Feito em 14/11: jogos das quatro séries em 2021–2025. A API do site da CBF serve as
   edições de 2018 a 2026; `eval/data/hist/cbf_jogos_2021_2025.csv` tem os 7.428 jogos com
   grupo, rodada, data, ids dos clubes e pênaltis. `eval/hist/coletar_cbf.browser.js` é o
   coletor e `eval/hist/ingerir.cjs` normaliza e confere. As tabelas de A e B de 2025
   reconstruídas dos jogos batem, campanha por campanha, com as classificações finais da
   Wikipedia.
2. Classificação final dos estaduais (cerca de 135 tabelas, 2022–2026) e a força do estado.
3. Carregador de temporadas passadas, candidatas de semente, zonas reais.
4. Veredito pela regra de células e a seção de lições reescrita.
5. A corrida completa de dezembro (`node eval/run.cjs --full`), depois do fim da Série A.
