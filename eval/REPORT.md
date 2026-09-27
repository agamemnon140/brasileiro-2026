# Avaliação retroativa das previsões — Brasileirão 2026

Gerado do `results.json` de **2026-08-19T18:09:57.554Z**. Reexecutar com `node eval/run.cjs`.

> **Temporada incompleta.** As séries A/B/C estão em curso, então o longo prazo usa
> horizonte encurtado — prever a tabela da rodada H a partir da rodada r < H — e não a
> classificação final. Rodar de novo em dezembro troca H por 38 sozinho.

## Como ler estes números

Brier e calibração têm poderes estatísticos **muito** diferentes com ~220 jogos por série:

- O **Brier** é dominado pela variância irredutível do resultado. Diferenças de 0,005 a
  0,015 entre configurações não se distinguem de ruído: o IC95 do bootstrap pareado
  cruza zero em quase todas as variantes testadas. Ranquear configs por Brier nesta
  temporada é ler ruído.
- O **viés marginal** — quanto o modelo prevê de vitórias em casa vs. quantas houve — é
  estimável com precisão bem maior, e é onde os defeitos reais aparecem.

Daí a hierarquia adotada no relatório: **calibração decide, Brier confirma.**

### Cobertura

| Competição | jogos | curto prazo | longo prazo |
|---|---|---|---|
| Série A | 225 | sim | sim |
| Série B | 223 | sim | sim |
| Série C | 170 | sim | sim |
| Série D | 480 | sim | não |
| Copa do Brasil | 48 | sim | não |

O longo prazo cobre só as ligas de pontos corridos: nas competições de mata-mata não
existe "tabela final" a prever, e a classificação depende de fase alcançada. A Copa do
Brasil é reconstruída com nome de time a partir de `CB_TEAMS`/`CB_R32` (a R32 é
guardada posicionalmente, como `{ga, gb}`) mais as fases nomeadas do `results.json`.

## 1. Parâmetros inertes — o achado estrutural

No modo que o app roda (`eo = false`, ATK/DEF, o padrão explícito da UI), `calcL`
calcula λ **só** a partir de `atk`/`def`. O Elo corrente nunca volta para λ: `updR`
atualiza Elo e atk/def em trilhos separados. O Elo é calculado, exibido e usado no
ranking da tela, mas **não participa da previsão** depois da inicialização.

Consequência medida, não suposta — delta de Brier **exatamente zero**:

| Parâmetro | Variação testada | Δ Brier (A) | Δ Brier (B) | Δ Brier (C) | Δ Brier (D) | Δ Brier (CB) |
|---|---|---|---|---|---|---|
| `kElo` | 16 → 64 | 0.0e+0 | 0.0e+0 | 0.0e+0 | 0.0e+0 | 0.0e+0 |
| `homeAdv` | 100 → 400 | 0.0e+0 | 0.0e+0 | 0.0e+0 | 0.0e+0 | 0.0e+0 |
| `targetRatio` | 3 → 8 | 4.8e-3 | 0.0e+0 | 0.0e+0 | 0.0e+0 | 3.9e-2 |

Os dois parâmetros mais visíveis de um modelo "Elo + Poisson" não afetam previsão
nenhuma. O único canal pelo qual a força a priori entra é o **Elo inicial**, via
`initLeague → initAD`, que fixa o atk/def de partida. As únicas taxas de aprendizado
vivas são `alphas.atk` e `alphas.def`.

`targetRatio` é um caso mais sutil: ele governa a amplitude de atk/def, mas só enquanto
`rawSpread = log(targetRatio)/log(max/min)` ficar abaixo do teto `maxSpread`. Nas séries
de Elo inicial estreito o teto morde primeiro e o parâmetro fica inerte — parece global,
e não é (ver a seção 3).

## 2. Curto prazo — o modelo acerta jogo a jogo?

| Série | n | Brier modelo | taxa-base (walk-fwd) | uniforme | supera a taxa-base? |
|---|---|---|---|---|---|
| A | 225 | 0.6585 | 0.6541 | 0.6667 | indistinguível |
| B | 223 | 0.6390 | 0.6662 | 0.6667 | **sim** |
| C | 170 | 0.6526 | 0.6513 | 0.6667 | indistinguível |
| D | 480 | 0.6254 | 0.6558 | 0.6667 | **sim** |
| CB | 48 | 0.5486 | 0.6454 | 0.6667 | indistinguível |

A taxa-base walk-forward prevê apenas a frequência histórica de casa/empate/fora, sem
olhar quem joga.

### Viés marginal

| Série | desfecho | previsto | observado | gap | z | significativo |
|---|---|---|---|---|---|---|
| A | casa | 54.4% | 45.3% | -9.1 pp | -2.99 | **sim** |
| A | empate | 22.6% | 29.8% | +7.2 pp | 2.61 | **sim** |
| A | fora | 23.0% | 24.9% | +1.9 pp | 0.72 | não |
| B | casa | 44.8% | 41.7% | -3.1 pp | -0.93 | não |
| B | empate | 28.3% | 29.6% | +1.3 pp | 0.42 | não |
| B | fora | 26.9% | 28.7% | +1.8 pp | 0.61 | não |
| C | casa | 45.2% | 47.1% | +1.9 pp | 0.49 | não |
| C | empate | 28.4% | 26.5% | -1.9 pp | -0.54 | não |
| C | fora | 26.4% | 26.5% | +0.0 pp | 0.01 | não |
| D | casa | 49.1% | 43.5% | -5.6 pp | -2.48 | **sim** |
| D | empate | 25.7% | 30.4% | +4.7 pp | 2.36 | **sim** |
| D | fora | 25.2% | 26.0% | +0.9 pp | 0.44 | não |
| CB | casa | 53.6% | 52.1% | -1.5 pp | -0.24 | não |
| CB | empate | 22.5% | 27.1% | +4.6 pp | 0.78 | não |
| CB | fora | 23.9% | 20.8% | -3.1 pp | -0.56 | não |

λ configurado vs. observado:

| Série | total cfg | total obs | pesoCasa cfg | pesoCasa obs | ECE |
|---|---|---|---|---|---|
| A | 2.50 | 2.604 | 0.652 | 0.565 | 7.82% |
| B | 2.20 | 2.256 | 0.583 | 0.549 | 2.56% |
| C | 2.20 | 2.282 | 0.583 | 0.572 | 3.19% |
| D | 2.65 | 2.337 | 0.604 | 0.584 | 2.87% |
| CB | 2.50 | 2.146 | 0.652 | 0.602 | 7.61% |

### O viés de casa acompanha o `pesoCasa` configurado

Ordenando as séries pelo `pesoCasa` que cada uma tem no `DEFAULT_CFG`, o gap de
vitórias em casa é monotônico — e as significativas são exatamente as de peso inflado:

| Série | `pesoCasa` cfg | `pesoCasa` observado | gap de casa | z | significativo |
|---|---|---|---|---|---|
| A | 0.652 | 0.565 | -9.1 pp | -2.99 | **sim** |
| CB | 0.652 | 0.602 | -1.5 pp | -0.24 | não |
| D | 0.604 | 0.584 | -5.6 pp | -2.48 | **sim** |
| B | 0.583 | 0.549 | -3.1 pp | -0.93 | não |
| C | 0.583 | 0.572 | +1.9 pp | 0.49 | não |

Esse é o defeito mais bem estabelecido do relatório: não depende de escolha de métrica,
aparece nas duas séries com poder estatístico, e tem uma causa nomeável no código.

### Varredura do `pesoCasa`

É o único canal de vantagem de casa no modo que o app roda — `homeAdv` não entra em λ
(seção 1). Vale varrer, e não apenas testar "igual ao observado": o ótimo de Brier **não**
coincide com a fração observada de gols, porque `pesoCasa` move também a forma da grade
de Poisson, não só a média.

| competição | config. | observado | ótimo (Brier) | 0.50 | 0.53 | 0.55 | 0.57 | 0.59 | 0.61 | 0.63 | 0.65 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Série A | 0.652 | 0.565 | **0.59** | 0.6731 | 0.6612 | 0.6557 | 0.6522 | **0.6507** | 0.6511 | 0.6535 | 0.6580 |
| Série B | 0.583 | 0.549 | **0.55** | 0.6459 | 0.6392 | **0.6374** | 0.6377 | 0.6401 | 0.6446 | 0.6513 | 0.6601 |
| Série C | 0.583 | 0.572 | **0.59** | 0.6747 | 0.6628 | 0.6573 | 0.6539 | **0.6523** | 0.6528 | 0.6553 | 0.6598 |
| Série D | 0.604 | 0.584 | **0.57** | 0.6380 | 0.6274 | 0.6235 | **0.6221** | 0.6232 | 0.6267 | 0.6327 | 0.6411 |
| Copa | 0.652 | 0.602 | **0.65** | 0.6039 | 0.5846 | 0.5740 | 0.5652 | 0.5583 | 0.5532 | 0.5500 | **0.5487** |

Três leituras que a variante única não daria:

- **A Série A está claramente alta** (0,652 contra ótimo 0,59) e a **D também** (0,604
  contra 0,57) — as duas do viés significativo.
- **A Série C está ligeiramente baixa** (0,583 contra 0,59), no sentido oposto. Não é
  "todas altas": é cada uma no seu lugar.
- **A Copa valida o 0,652.** É a única competição onde o valor alto é o ótimo, e ela quer
  até mais peso de casa do que os gols observados sugerem.

### Variantes de parâmetro testadas

**Série A**

| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6585 | 7.82% | — | — |
| lambda:pesoCasa=observado | 0.6529 | 6.14% | -0.0056 [-0.0263, 0.0173] | não |
| lambda:total=observado | 0.6597 | 7.78% | +0.0012 [0.0002, 0.0021] | **sim** |
| lambda:ambos=observado | 0.6540 | 6.10% | -0.0045 [-0.0253, 0.0184] | não |
| dixon-coles rho=-0.05 | 0.6572 | 7.29% | -0.0013 [-0.0031, 0.0006] | não |
| dixon-coles rho=-0.11 | 0.6562 | 7.57% | -0.0023 [-0.0064, 0.0017] | não |
| dixon-coles rho=-0.18 | 0.6555 | 7.33% | -0.0030 [-0.0096, 0.0037] | não |
| targetRatio=1.5 | 0.6438 | 6.80% | -0.0147 [-0.0334, 0.0038] | não |
| targetRatio=2 | 0.6461 | 6.08% | -0.0124 [-0.0232, -0.0016] | **sim** |
| targetRatio=4.5 | 0.6634 | 7.74% | +0.0048 [0.0020, 0.0077] | **sim** |

**Série B**

| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6390 | 2.56% | — | — |
| lambda:pesoCasa=observado | 0.6375 | 1.71% | -0.0016 [-0.0099, 0.0070] | não |
| lambda:total=observado | 0.6394 | 2.95% | +0.0003 [-0.0002, 0.0009] | não |
| lambda:ambos=observado | 0.6377 | 1.81% | -0.0014 [-0.0097, 0.0073] | não |
| dixon-coles rho=-0.05 | 0.6388 | 2.03% | -0.0003 [-0.0027, 0.0021] | não |
| dixon-coles rho=-0.11 | 0.6390 | 2.76% | -0.0000 [-0.0054, 0.0051] | não |
| dixon-coles rho=-0.18 | 0.6402 | 2.09% | +0.0012 [-0.0076, 0.0096] | não |
| targetRatio=1.5 | 0.6390 | 2.56% | +0.0000 [0.0000, 0.0000] | não |
| targetRatio=2 | 0.6390 | 2.56% | +0.0000 [0.0000, 0.0000] | não |
| targetRatio=4.5 | 0.6390 | 2.56% | +0.0000 [0.0000, 0.0000] | não |

**Série C**

| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6526 | 3.19% | — | — |
| lambda:pesoCasa=observado | 0.6536 | 3.16% | +0.0009 [-0.0021, 0.0039] | não |
| lambda:total=observado | 0.6523 | 4.25% | -0.0003 [-0.0011, 0.0005] | não |
| lambda:ambos=observado | 0.6532 | 4.02% | +0.0006 [-0.0024, 0.0033] | não |
| dixon-coles rho=-0.05 | 0.6536 | 4.11% | +0.0010 [-0.0015, 0.0033] | não |
| dixon-coles rho=-0.11 | 0.6555 | 4.58% | +0.0028 [-0.0028, 0.0078] | não |
| dixon-coles rho=-0.18 | 0.6585 | 4.91% | +0.0059 [-0.0033, 0.0140] | não |
| targetRatio=1.5 | 0.6526 | 3.19% | +0.0000 [0.0000, 0.0000] | não |
| targetRatio=2 | 0.6526 | 3.19% | +0.0000 [0.0000, 0.0000] | não |
| targetRatio=4.5 | 0.6526 | 3.19% | +0.0000 [0.0000, 0.0000] | não |

**Série D**

| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6254 | 2.87% | — | — |
| lambda:pesoCasa=observado | 0.6226 | 2.94% | -0.0028 [-0.0065, 0.0005] | não |
| lambda:total=observado | 0.6227 | 3.28% | -0.0027 [-0.0051, -0.0004] | **sim** |
| lambda:ambos=observado | 0.6207 | 2.42% | -0.0047 [-0.0101, 0.0002] | não |
| dixon-coles rho=-0.05 | 0.6239 | 3.17% | -0.0015 [-0.0031, -0.0000] | **sim** |
| dixon-coles rho=-0.11 | 0.6227 | 3.15% | -0.0027 [-0.0062, 0.0005] | não |
| dixon-coles rho=-0.18 | 0.6221 | 3.05% | -0.0033 [-0.0091, 0.0019] | não |
| targetRatio=1.5 | 0.6278 | 4.30% | +0.0024 [0.0002, 0.0048] | **sim** |
| targetRatio=2 | 0.6254 | 2.87% | +0.0000 [0.0000, 0.0000] | não |
| targetRatio=4.5 | 0.6254 | 2.87% | +0.0000 [0.0000, 0.0000] | não |

**Série CB**

| variante | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.5486 | 7.61% | — | — |
| lambda:pesoCasa=observado | 0.5550 | 8.35% | +0.0064 [-0.0184, 0.0312] | não |
| lambda:total=observado | 0.5446 | 8.20% | -0.0040 [-0.0171, 0.0082] | não |
| lambda:ambos=observado | 0.5518 | 6.17% | +0.0032 [-0.0253, 0.0318] | não |
| dixon-coles rho=-0.05 | 0.5473 | 6.64% | -0.0014 [-0.0059, 0.0028] | não |
| dixon-coles rho=-0.11 | 0.5461 | 7.52% | -0.0026 [-0.0125, 0.0066] | não |
| dixon-coles rho=-0.18 | 0.5453 | 9.36% | -0.0034 [-0.0196, 0.0117] | não |
| targetRatio=1.5 | 0.5635 | 5.42% | +0.0149 [-0.0385, 0.0692] | não |
| targetRatio=2 | 0.5486 | 6.15% | +0.0000 [-0.0305, 0.0300] | não |
| targetRatio=4.5 | 0.5652 | 8.45% | +0.0166 [-0.0101, 0.0436] | não |

## 3. Elos de partida

Como o Elo inicial é o único canal de força a priori (seção 1), é aqui que está a
alavanca real. Δ negativo = melhor que os Elos atribuídos à mão.

**Série A** (curto prazo)

| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6585 | 7.82% | — | — |
| semente:iguais | 0.6519 | 6.99% | -0.0066 [-0.0379, 0.0238] | não |
| semente:rnc_pontos | 0.6433 | 7.15% | -0.0152 [-0.0457, 0.0135] | não |
| semente:rnc_log | 0.6447 | 7.68% | -0.0139 [-0.0443, 0.0145] | não |
| semente:rnc_posicao | 0.6440 | 7.57% | -0.0145 [-0.0448, 0.0140] | não |
| semente:rnc_recencia | 0.6582 | 7.50% | -0.0003 [-0.0250, 0.0242] | não |
| semente:ano_anterior | 0.6607 | 7.40% | +0.0021 [-0.0113, 0.0141] | não |
| semente:ano_anterior_reg50 | 0.6441 | 6.03% | -0.0145 [-0.0307, 0.0009] | não |
| semente:ano_anterior_reg25 | 0.6443 | 5.97% | -0.0142 [-0.0368, 0.0078] | não |

**Série B** (curto prazo)

| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6390 | 2.56% | — | — |
| semente:iguais | 0.6394 | 1.78% | +0.0003 [-0.0068, 0.0086] | não |
| semente:rnc_pontos | 0.6642 | 7.08% | +0.0252 [-0.0046, 0.0510] | não |
| semente:rnc_log | 0.6649 | 6.52% | +0.0258 [-0.0041, 0.0525] | não |
| semente:rnc_posicao | 0.6679 | 6.60% | +0.0289 [-0.0028, 0.0575] | não |
| semente:rnc_recencia | 0.6269 | 3.14% | -0.0121 [-0.0408, 0.0160] | não |
| semente:ano_anterior | 0.6544 | 6.56% | +0.0153 [-0.0194, 0.0477] | não |
| semente:ano_anterior_reg50 | 0.6324 | 1.76% | -0.0066 [-0.0233, 0.0094] | não |
| semente:ano_anterior_reg25 | 0.6315 | 1.91% | -0.0076 [-0.0157, 0.0004] | não |

**Série C** (curto prazo)

| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6526 | 3.19% | — | — |
| semente:iguais | 0.6528 | 3.66% | +0.0001 [-0.0055, 0.0057] | não |
| semente:rnc_pontos | 0.6931 | 11.88% | +0.0404 [-0.0007, 0.0788] | não |
| semente:rnc_log | 0.6942 | 11.11% | +0.0415 [0.0036, 0.0784] | **sim** |
| semente:rnc_posicao | 0.6927 | 10.29% | +0.0401 [0.0034, 0.0765] | **sim** |
| semente:rnc_recencia | 0.6782 | 6.60% | +0.0256 [-0.0036, 0.0575] | não |
| semente:ano_anterior | 0.7046 | 11.13% | +0.0520 [0.0119, 0.0932] | **sim** |
| semente:ano_anterior_reg50 | 0.6633 | 4.33% | +0.0107 [-0.0083, 0.0301] | não |
| semente:ano_anterior_reg25 | 0.6533 | 4.45% | +0.0007 [-0.0066, 0.0080] | não |

**Série D** (curto prazo)

| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.6254 | 2.87% | — | — |
| semente:iguais | 0.6354 | 3.65% | +0.0100 [0.0033, 0.0171] | **sim** |
| semente:rnc_pontos | 0.6633 | 7.58% | +0.0379 [0.0142, 0.0603] | **sim** |
| semente:rnc_log | 0.7080 | 10.69% | +0.0826 [0.0499, 0.1133] | **sim** |
| semente:rnc_posicao | 0.7378 | 11.67% | +0.1124 [0.0758, 0.1496] | **sim** |
| semente:rnc_recencia | 0.7132 | 10.45% | +0.0878 [0.0539, 0.1197] | **sim** |
| semente:ano_anterior | 0.6796 | 9.78% | +0.0542 [0.0216, 0.0875] | **sim** |
| semente:ano_anterior_reg50 | 0.6342 | 4.84% | +0.0088 [-0.0092, 0.0273] | não |
| semente:ano_anterior_reg25 | 0.6263 | 3.27% | +0.0009 [-0.0093, 0.0116] | não |

Sem par no RNC (recebem piso, não média): 22 clubes.

Sem competição nacional em 2025 (recebem piso nas sementes `ano_anterior*`): 48 clubes. Quanto maior esse número, mais a semente empilha clubes no mesmo valor — é por isso que essas variantes vão mal na Série D, e é limitação do dado, não do método.

**Série CB** (curto prazo)

| semente | Brier | ECE | Δ vs. atual (IC95) | significativo |
|---|---|---|---|---|
| atual | 0.5486 | 7.61% | — | — |
| semente:iguais | 0.6091 | 2.85% | +0.0604 [-0.0289, 0.1513] | não |
| semente:rnc_pontos | 0.5587 | 6.74% | +0.0101 [-0.0414, 0.0619] | não |
| semente:rnc_log | 0.5302 | 5.57% | -0.0185 [-0.0656, 0.0267] | não |
| semente:rnc_posicao | 0.5285 | 5.99% | -0.0201 [-0.0701, 0.0263] | não |
| semente:rnc_recencia | 0.5636 | 3.76% | +0.0150 [-0.0404, 0.0675] | não |
| semente:ano_anterior | 0.5250 | 5.95% | -0.0237 [-0.0531, 0.0077] | não |
| semente:ano_anterior_reg50 | 0.5478 | 4.80% | -0.0009 [-0.0530, 0.0491] | não |
| semente:ano_anterior_reg25 | 0.5733 | 5.90% | +0.0246 [-0.0447, 0.0936] | não |

Sem competição nacional em 2025 (recebem piso nas sementes `ano_anterior*`): Jacuipense. Quanto maior esse número, mais a semente empilha clubes no mesmo valor — é por isso que essas variantes vão mal na Série D, e é limitação do dado, não do método.

### A AMPLITUDE da semente importa muito mais que a ordenação

Reescalando cada semente para o mesmo alcance e depois encolhendo por um fator `k`
(k=1 é o alcance cheio, k=0 é "todos iguais"), toda série mostra uma curva em U — e no
ótimo as ordenações **convergem para quase o mesmo Brier**. Escolher entre "à mão",
"RNC" e "ano anterior" mexe pouco; escolher o quanto acreditar na semente mexe muito.

| Série A — k | 1 | 0.75 | 0.5 | 0.35 | 0.25 | 0.15 | 0.05 |
|---|---|---|---|---|---|---|---|
| atual | 0.6585 | 0.6493 | 0.6441 | **0.6437** | 0.6447 | 0.6468 | 0.6500 |
| rnc_log | 0.6447 | 0.6385 | **0.6366** | 0.6383 | 0.6408 | 0.6444 | 0.6491 |
| ano_anterior | 0.6607 | 0.6503 | 0.6441 | **0.6433** | 0.6443 | 0.6464 | 0.6498 |

| Série B — k | 1 | 0.75 | 0.5 | 0.35 | 0.25 | 0.15 | 0.05 |
|---|---|---|---|---|---|---|---|
| atual | 0.6837 | 0.6656 | 0.6494 | 0.6428 | 0.6400 | **0.6386** | 0.6387 |
| rnc_log | 0.6649 | 0.6512 | 0.6413 | 0.6381 | **0.6372** | 0.6373 | 0.6384 |
| ano_anterior | 0.6544 | 0.6410 | 0.6324 | **0.6309** | 0.6315 | 0.6335 | 0.6371 |

| Série C — k | 1 | 0.75 | 0.5 | 0.35 | 0.25 | 0.15 | 0.05 |
|---|---|---|---|---|---|---|---|
| atual | 0.7245 | 0.6958 | 0.6711 | 0.6607 | 0.6561 | 0.6533 | **0.6524** |
| rnc_log | 0.6942 | 0.6746 | 0.6593 | 0.6536 | 0.6515 | **0.6509** | 0.6518 |
| ano_anterior | 0.7046 | 0.6817 | 0.6633 | 0.6562 | 0.6533 | **0.6519** | 0.6521 |

| Série D — k | 1 | 0.75 | 0.5 | 0.35 | 0.25 | 0.15 | 0.05 |
|---|---|---|---|---|---|---|---|
| atual | **0.6234** | 0.6239 | 0.6260 | 0.6281 | 0.6298 | 0.6318 | 0.6341 |
| rnc_log | 0.7080 | 0.6782 | 0.6524 | 0.6417 | 0.6371 | 0.6346 | **0.6345** |
| ano_anterior | 0.6796 | 0.6545 | 0.6342 | 0.6276 | **0.6263** | 0.6278 | 0.6321 |

| Série CB — k | 1 | 0.75 | 0.5 | 0.35 | 0.25 | 0.15 | 0.05 |
|---|---|---|---|---|---|---|---|
| atual | 0.5507 | **0.5480** | 0.5551 | 0.5655 | 0.5751 | 0.5870 | 0.6012 |
| rnc_log | **0.5302** | 0.5370 | 0.5516 | 0.5647 | 0.5755 | 0.5878 | 0.6016 |
| ano_anterior | **0.5250** | 0.5322 | 0.5478 | 0.5618 | 0.5733 | 0.5864 | 0.6011 |

E o `k` que cada série **já usa** hoje, para comparar com o ótimo acima:

| Série | Elo min–max | k vigente | rawSpread | spread efetivo | no teto `maxSpread`? |
|---|---|---|---|---|---|
| A | 1350–1720 | 1.06 | 4.54 | 4.54 | não |
| B | 1340–1400 | 0.17 | 25.08 | 5.00 | **sim** |
| C | 1280–1310 | 0.09 | 47.42 | 5.00 | **sim** |
| D | 1125–1273 | 0.42 | 8.89 | 5.00 | **sim** |
| CB | 1180–1720 | 1.54 | 2.92 | 2.92 | não |

Duas leituras saem daqui:

- **A Série A é a única com a amplitude errada** — usa k≈1,06 quando o ótimo medido
  está entre 0,35 e 0,50. B e C já estão perto do próprio ótimo. É a mesma série do
  viés de casa significativo: dois defeitos independentes, ambos na A.
- **`targetRatio` só funciona onde o teto não morde.** Nas séries cujo `rawSpread`
  passa de `maxSpread`, quem manda é o teto, e `targetRatio` fica inerte (ver a tabela
  de inércia da seção 1). O parâmetro parece global e não é.

## 4. Longo prazo — o modelo acerta a tabela?

### O que é o RPS

*Ranked Probability Score.* A previsão de longo prazo não é uma aposta única: é uma
distribuição sobre as colocações possíveis de cada clube — e o RPS a pontua por cortes
acumulados da tabela (1º; 1º–2º; 1º–3º; …). Em cada corte, compara-se a probabilidade de
o clube estar ali dentro com o que de fato aconteceu, e eleva-se a diferença ao quadrado:

`RPS = média sobre k de ( P(colocação ≤ k) − [colocação real ≤ k] )²`, com `[…]` valendo 1 quando a condição é verdadeira.

Comparar **acumulados** é o que torna a métrica ordinal: errar por uma posição custa pouco,
errar por dez custa muito. Um Brier sobre colocações trataria 2º e 20º como categorias
igualmente distintas do 1º, o que para uma tabela de classificação é absurdo. Menor é
melhor; 0 é a previsão perfeita.

Réguas, calculadas para 20 clubes:

| previsão | RPS |
|---|---|
| perfeita (toda a massa na posição certa) | 0.0000 |
| pontual, errando por 1 posição | 0.0500 |
| pontual, errando por 3 posições | 0.1421 |
| uniforme (1/20 em cada posição) | 0.1750 |
| pontual, errando por 5 posições | 0.2237 |
| pontual, errando por 10 posições | 0.3816 |
| invertida (1º ↔ 20º) | 1.0000 |

Para situar: o modelo mede **0.1020** na Série A. Em termos da régua
acima, isso custa o equivalente a cravar a posição de cada clube e errar por cerca de
duas colocações — e é melhor que ignorar os jogos disputados
(0.1548) e que a previsão uniforme (0.1750).


RPS sobre a distribuição de colocação, média de 3 sementes de Monte Carlo
a 5000 simulações por ponto. Menor é melhor.

**Série A** — horizonte H=23 (encurtado), 225 jogos conhecidos, cortes 3, 6, 9, 12, 15, 18, 21

| semente | RPS médio | Brier líder | Brier top-4 | Brier 4 últimos |
|---|---|---|---|---|
| rnc_posicao | 0.09076 | 0.0226 | 0.0618 | 0.0583 |
| rnc_log | 0.09116 | 0.0247 | 0.0638 | 0.0582 |
| rnc_pontos | 0.09146 | 0.0268 | 0.0629 | 0.0607 |
| rnc_recencia | 0.10136 | 0.0225 | 0.0851 | 0.0897 |
| atual | 0.10198 | 0.0158 | 0.0736 | 0.0818 |
| iguais | 0.10258 | 0.0217 | 0.0736 | 0.0915 |
| _ignorando os jogos disputados_ | 0.15480 | — | — | — |

RPS por corte:

| semente | r3 | r6 | r9 | r12 | r15 | r18 | r21 |
|---|---|---|---|---|---|---|---|
| rnc_posicao | 0.1189 | 0.1129 | 0.1082 | 0.0914 | 0.0976 | 0.0559 | 0.0504 |
| rnc_log | 0.1206 | 0.1139 | 0.1083 | 0.0915 | 0.0978 | 0.0559 | 0.0500 |
| rnc_pontos | 0.1211 | 0.1133 | 0.1082 | 0.0911 | 0.0984 | 0.0565 | 0.0517 |
| rnc_recencia | 0.1474 | 0.1301 | 0.1137 | 0.1028 | 0.1021 | 0.0583 | 0.0552 |
| atual | 0.1394 | 0.1355 | 0.1210 | 0.1093 | 0.1068 | 0.0542 | 0.0477 |
| iguais | 0.1489 | 0.1461 | 0.1229 | 0.1023 | 0.0964 | 0.0560 | 0.0453 |

**Série B** — horizonte H=22 (encurtado), 220 jogos conhecidos, cortes 3, 6, 9, 12, 15, 18, 21

| semente | RPS médio | Brier líder | Brier top-4 | Brier 4 últimos |
|---|---|---|---|---|
| rnc_recencia | 0.07725 | 0.0321 | 0.1087 | 0.0275 |
| rnc_log | 0.09631 | 0.0341 | 0.0843 | 0.0613 |
| rnc_pontos | 0.09691 | 0.0381 | 0.0805 | 0.0584 |
| rnc_posicao | 0.09747 | 0.0346 | 0.0874 | 0.0643 |
| iguais | 0.10581 | 0.0354 | 0.1211 | 0.0613 |
| atual | 0.10729 | 0.0362 | 0.1143 | 0.0601 |
| _ignorando os jogos disputados_ | 0.17508 | — | — | — |

RPS por corte:

| semente | r3 | r6 | r9 | r12 | r15 | r18 | r21 |
|---|---|---|---|---|---|---|---|
| rnc_recencia | 0.1278 | 0.1009 | 0.0902 | 0.0892 | 0.0549 | 0.0475 | 0.0302 |
| rnc_log | 0.1765 | 0.1451 | 0.1181 | 0.0904 | 0.0557 | 0.0538 | 0.0347 |
| rnc_pontos | 0.1727 | 0.1435 | 0.1214 | 0.0938 | 0.0576 | 0.0546 | 0.0348 |
| rnc_posicao | 0.1809 | 0.1503 | 0.1174 | 0.0896 | 0.0555 | 0.0545 | 0.0341 |
| iguais | 0.1876 | 0.1514 | 0.1317 | 0.1102 | 0.0700 | 0.0562 | 0.0336 |
| atual | 0.1868 | 0.1551 | 0.1363 | 0.1135 | 0.0699 | 0.0557 | 0.0337 |

**Série C** — horizonte H=17 (encurtado), 170 jogos conhecidos, cortes 3, 6, 9, 12, 15

| semente | RPS médio | Brier líder | Brier top-4 | Brier 4 últimos |
|---|---|---|---|---|
| iguais | 0.11427 | 0.0350 | 0.1107 | 0.0693 |
| atual | 0.11519 | 0.0342 | 0.1150 | 0.0675 |
| rnc_posicao | 0.13192 | 0.0217 | 0.1307 | 0.0621 |
| rnc_log | 0.13273 | 0.0228 | 0.1296 | 0.0620 |
| rnc_recencia | 0.13347 | 0.0329 | 0.1408 | 0.0800 |
| rnc_pontos | 0.13551 | 0.0202 | 0.1368 | 0.0647 |
| _ignorando os jogos disputados_ | 0.17198 | — | — | — |

RPS por corte:

| semente | r3 | r6 | r9 | r12 | r15 |
|---|---|---|---|---|---|
| iguais | 0.1505 | 0.1374 | 0.1286 | 0.1012 | 0.0537 |
| atual | 0.1511 | 0.1374 | 0.1300 | 0.1037 | 0.0538 |
| rnc_posicao | 0.1737 | 0.1609 | 0.1471 | 0.1201 | 0.0578 |
| rnc_log | 0.1739 | 0.1616 | 0.1486 | 0.1216 | 0.0579 |
| rnc_recencia | 0.1872 | 0.1737 | 0.1486 | 0.1098 | 0.0481 |
| rnc_pontos | 0.1783 | 0.1665 | 0.1517 | 0.1238 | 0.0573 |

Piso de ruído do Monte Carlo (série A, corte 9, H=22): desvio 0,00097 a 1k simulações,
0,00059 a 3k e 0,00017 a 10k. Diferenças menores que isso não são diferenças.

## 5. A qualificação usada para semear se justificou?

Pergunta diferente de "qual semente é a melhor". Aqui cada ordenação é avaliada **no
seu próprio ótimo de amplitude** antes de comparar — senão a comparação seria entre
amplitudes, não entre qualificações — e o confronto é sempre contra "todos iguais",
que é a ausência de opinião.

| Competição | Spearman com a escada 2025 | ordenação | Brier | k* | Δ vs. todos iguais | signif. |
|---|---|---|---|---|---|---|
| Série A | 0.943 | atual | 0.6437 | 0.35 | -0.0082 [-0.0196, 0.0042] | não |
|  |  | ano_anterior | 0.6433 | 0.35 | -0.0086 [-0.0215, 0.0046] | não |
|  |  | rnc_log | 0.6366 | 0.5 | -0.0153 [-0.0311, 0.0024] | não |
| Série B | 0.627 | atual | 0.6386 | 0.15 | -0.0008 [-0.0070, 0.0048] | não |
|  |  | ano_anterior | 0.6309 | 0.35 | -0.0085 [-0.0234, 0.0049] | não |
|  |  | rnc_log | 0.6372 | 0.25 | -0.0022 [-0.0109, 0.0057] | não |
| Série C | 0.902 | atual | 0.6524 | 0.05 | -0.0003 [-0.0030, 0.0024] | não |
|  |  | ano_anterior | 0.6519 | 0.15 | -0.0008 [-0.0084, 0.0068] | não |
|  |  | rnc_log | 0.6509 | 0.15 | -0.0018 [-0.0087, 0.0050] | não |
| Série D | 0.306 | atual | 0.6234 | 1 | -0.0120 [-0.0242, -0.0003] | **sim** |
|  |  | ano_anterior | 0.6263 | 0.25 | -0.0091 [-0.0188, 0.0005] | não |
|  |  | rnc_log | 0.6345 | 0.05 | -0.0008 [-0.0026, 0.0008] | não |
| Copa do Brasil | 0.983 | atual | 0.5480 | 0.75 | -0.0611 [-0.1339, 0.0111] | não |
|  |  | ano_anterior | 0.5250 | 1 | -0.0841 [-0.1601, -0.0097] | **sim** |
|  |  | rnc_log | 0.5302 | 1 | -0.0789 [-0.1520, -0.0019] | **sim** |

**A qualificação se justifica onde dá para provar, e só lá.** Em A, B e C todas as
estimativas apontam na direção certa (Δ negativo) e nenhuma atinge significância: com
~220 jogos e efeitos de 0,001–0,015, não há poder. A Copa do Brasil atinge, com apenas
48 jogos, porque o efeito ali é dez vezes maior — ela cruza clubes de divisões
diferentes, então saber quem é mais forte vale muito, e o ótimo de amplitude é k=1.
A Série D atinge pelo caminho oposto: efeito pequeno, mas 480 jogos.

A coluna Spearman confirma a premissa declarada: os Elos de A (0,94), C (0,90) e da
Copa (0,98) são essencialmente a classificação do ano anterior. Na B (0,63) a semente
se afasta dela — e é justamente onde `ano_anterior` supera o valor à mão.

### Série D: qual camada da semente trabalha?

A Série D é semeada por `SD_UF[estado] + SD_ADJ[origem]`, com `SD_OVR`
sobrescrevendo 38 clubes à mão. Ligando e desligando cada camada:

| variante | Brier (no ótimo de amplitude) | k* |
|---|---|---|
| iguais | 0.6354 | — |
| so UF | 0.6264 | 0.75 |
| so origem | 0.6324 | 0.15 |
| UF mais origem | 0.6245 | 0.75 |
| completo com overrides | 0.6234 | 1 |
| UF derivada do RNC | 0.6350 | 0.05 |
| RNC do clube | 0.6345 | 0.05 |

| comparação | Δ | IC95 | significativo |
|---|---|---|---|
| so UF vs. iguais | -0.0090 | [-0.0182, 0.0004] | não |
| so origem vs. iguais | -0.0030 | [-0.0092, 0.0032] | não |
| UF mais origem vs. so UF | -0.0019 | [-0.0110, 0.0071] | não |
| completo com overrides vs. UF mais origem | -0.0011 | [-0.0098, 0.0081] | não |
| so UF vs. UF derivada do RNC | -0.0086 | [-0.0177, 0.0005] | não |
| completo com overrides vs. iguais | -0.0120 | [-0.0242, -0.0003] | **sim** |

Três leituras:

- **A qualificação por UF se justificou** e carrega a maior parte do sinal — é a
  única camada que sozinha bate "todos iguais" de forma significativa.
- **A `SD_UF` feita à mão bate significativamente uma tabela de UF derivada do RNC.**
  A alternativa de aparência mais objetiva é pior.
- **Os 38 overrides do `SD_OVR` não acrescentam nada** — o Δ contra `UF + origem` é
  levemente positivo e o IC cruza zero. O ajuste por origem também não se separa do
  ruído sozinho.

## 6. Modo de simulação e preset de evolução

Duas escolhas que a configuração expõe e que nunca tinham sido medidas: `eo` (ELO PURO
vs. ATK/DEF) e o preset de evolução (conservador / base / agressivo).

| competição | atkdef/conservador | atkdef/base | atkdef/agressivo | elo/conservador | elo/base | elo/agressivo |
|---|---|---|---|---|---|---|
| Série A | 0.6585 | **0.6571** | 0.6690 | 0.6690 | 0.6686 | 0.6687 |
| Série B | 0.6390 | **0.6379** | 0.6538 | 0.6667 | 0.6623 | 0.6604 |
| Série C | 0.6526 | 0.6665 | 0.6972 | **0.6498** | 0.6543 | 0.6586 |
| Série D | 0.6254 | **0.6201** | 0.6271 | 0.6737 | 0.6692 | 0.6665 |
| Copa | 0.5486 | **0.5472** | 0.5535 | 0.5759 | 0.5785 | 0.5813 |

**ATK/DEF vence ELO PURO com folga.** Agrupado: Δ +0.0268 a favor de ATK/DEF, z = 5.43 — o maior efeito medido em todo o relatório.
Por competição: A +0.0105, B +0.0276, C -0.0028, D +0.0483, CB +0.0273.
Só a Série C prefere ELO PURO, e por pouco. O padrão do app estava certo — agora medido.

| preset (agrupado) | Δ | z | I² | significativo |
|---|---|---|---|---|
| atkdef: base vs conservador | -0.0009 | 0.42 | 60% | não |
| atkdef: agressivo vs conservador | +0.0117 | 2.26 | 48% | **sim** |
| elo: base vs conservador | -0.0012 | 1.19 | 72% | não |
| elo: agressivo vs conservador | -0.0014 | 0.81 | 70% | não |

`base` é a melhor célula em 4 das 5 competições, mas o agrupado não atinge
significância (I² alto) porque a Série C discorda com força. `agressivo` é
significativamente **pior** em ATK/DEF. Trocar o padrão de `conservador` para `base` é
defensável, e não comprovado.

### A inércia é uma propriedade do MODO, não do parâmetro

| parâmetro | em ATK/DEF (o modo do app) | em ELO PURO |
|---|---|---|
| homeAdv 100->400 | **inerte em todas** | A +0.1074, B +0.0944, C +0.0624, D +0.1178, CB +0.0872 |
| kElo 16->64 | **inerte em todas** | A +0.0002, B -0.0068, C +0.0130, D -0.0088, CB +0.0084 |
| c0Log ligado | **inerte em todas** | A +0.0188, B +0.0044, C +0.0055, D +0.0058, CB +0.0040 |

Em ELO PURO `homeAdv` é o parâmetro mais potente do modelo; em ATK/DEF não faz
literalmente nada. `c0Log` — o bloco inteiro de favoritismo dependente do Elo — também
só existe em ELO PURO. Como o app roda ATK/DEF, três blocos de configuração estão
inertes na prática, mas passam a valer se alguém ligar o outro modo.

## 7. Um `pesoCasa` só, ou um por competição?

O `DEFAULT_CFG` carrega cinco `lambdas`, um por competição. Isso é escolha de
modelagem, não fato: manter valores separados só se paga se as competições diferirem
mais que o ruído. O teste acha o valor único ótimo para cada agrupamento e mede o custo
de impô-lo, competição por competição.

O critério não é "custo zero" — o ótimo livre é ótimo por construção, então o custo é
sempre positivo. É se o custo cabe no intervalo de confiança: quando o ótimo livre não
é significativamente melhor que o compartilhado, manter números separados é ajustar
ruído — e ajustar ruído custa generalização.

Ótimo livre por competição: **A** 0.60 (vigente 0.652) · **B** 0.56 (vigente 0.583) · **C** 0.60 (vigente 0.583) · **D** 0.57 (vigente 0.604) · **CB** 0.65 (vigente 0.652).

**ligas A-D → valor compartilhado 0.58** — Brier agrupado 0.63628 contra 0.63869 dos valores vigentes (ganho de 0.00240).

| competição | ótimo livre | vigente | custo de compartilhar | IC95 do ótimo livre vs. compartilhado | separar se justifica? |
|---|---|---|---|---|---|
| A | 0.60 | 0.652 | +0.00055 | [-0.00575, 0.00437] | não |
| B | 0.56 | 0.583 | +0.00135 | [-0.00621, 0.00366] | não |
| C | 0.60 | 0.583 | +0.00052 | [-0.00599, 0.00516] | não |
| D | 0.57 | 0.604 | +0.00024 | [-0.00210, 0.00143] | não |

**B-D → valor compartilhado 0.57** — Brier agrupado 0.63226 contra 0.63372 dos valores vigentes (ganho de 0.00146).

| competição | ótimo livre | vigente | custo de compartilhar | IC95 do ótimo livre vs. compartilhado | separar se justifica? |
|---|---|---|---|---|---|
| B | 0.56 | 0.583 | +0.00041 | [-0.00285, 0.00209] | não |
| C | 0.60 | 0.583 | +0.00152 | [-0.00972, 0.00700] | não |
| D | 0.57 | 0.604 | +0.00000 | [0.00000, 0.00000] | não |

**todas → valor compartilhado 0.58** — Brier agrupado 0.63315 contra 0.63492 dos valores vigentes (ganho de 0.00177).

| competição | ótimo livre | vigente | custo de compartilhar | IC95 do ótimo livre vs. compartilhado | separar se justifica? |
|---|---|---|---|---|---|
| A | 0.60 | 0.652 | +0.00055 | [-0.00575, 0.00437] | não |
| B | 0.56 | 0.583 | +0.00135 | [-0.00621, 0.00366] | não |
| C | 0.60 | 0.583 | +0.00052 | [-0.00599, 0.00516] | não |
| D | 0.57 | 0.604 | +0.00024 | [-0.00210, 0.00143] | não |
| CB | 0.65 | 0.652 | +0.01285 | [-0.04723, 0.02176] | não |

**Um único `pesoCasa` serve as quatro ligas, e serve melhor que os valores de hoje.**
Nenhum ótimo livre é significativamente melhor que o compartilhado, o custo máximo é da
ordem de 0,001, e o valor único bate os quatro valores vigentes. A Copa do Brasil é a
exceção real: seu ótimo é bem mais alto e forçá-la ao valor das ligas custa dez vezes
mais que qualquer liga. A estrutura que os dados sustentam é **dois valores — ligas e
mata-mata — não cinco.**

### O `total` é uma armadilha de otimização

`total` é o número de gols esperados por **jogo**, somando os dois times: `getML` devolve
`mc + mf = total`, com `mc` para o mandante e `mf` para o visitante.

**Os valores vigentes acertam bem os gols.** Comparando o que o modelo prevê, em média,
com o que aconteceu:

| série | `total` config. | gols observados/jogo | gols previstos/jogo | erro |
|---|---|---|---|---|
| A | 2.50 | 2.604 | 2.603 | -0.002 |
| B | 2.20 | 2.256 | 2.196 | -0.060 |
| C | 2.20 | 2.282 | 2.208 | -0.074 |
| D | 2.65 | 2.337 | 2.488 | +0.151 |
| CB | 2.50 | 2.146 | 2.516 | +0.370 |

A Série A está praticamente exata. A D é a única com desvio material.

O problema aparece ao **otimizar**: a varredura dá ótimos livres de A 1.30, B 1.55, C 2.90, D 1.85, CB 1.95 — muito abaixo dos gols reais. O mecanismo é claro: baixar λ **infla empates**, tapando o
déficit estrutural da Poisson (seção 2). Na Série A, ir de 2,50 para 1,30 leva os empates
previstos de 22,6% para 28,4% — quase os 29,8% observados — e melhora o Brier de 1X2. Mas
passa a prever 1,99 gols por jogo onde acontecem 2,60.

**Não é uma configuração a adotar.** O Monte Carlo simula placares, e o saldo de gols é
critério de desempate na tabela: otimizar `total` pelo 1X2 corromperia o saldo, um custo
que o Brier de curto prazo não enxerga. O ótimo aqui é sintoma de verossimilhança errada,
não parâmetro a mover — o conserto é a distribuição de placares, e o `total` vigente já
está no lugar certo.

## 8. Juntar competições aumenta o poder estatístico?

Só quando o efeito aponta na mesma direção em todas. O ganho abaixo é o |z| agrupado
dividido pelo maior |z| individual — um denominador severo de propósito, já que o
máximo entre cinco é otimista por seleção. I² mede quanto da divergência entre
competições não é ruído amostral.

| hipótese (global) | efeito por competição | Δ agrupado | ganho de poder | I² |
|---|---|---|---|---|
| targetRatio 3 -> 1.5 | A -0.015, B +0.000, C +0.000, D +0.002, CB +0.015 | +0.0022 | 0.93× | 29% |
| dixon-coles rho = -0.11 | A -0.002, B -0.000, C +0.003, D -0.003, CB -0.003 | -0.0014 | 0.81× | 0% |
| alphas atk/def x0.5 | A +0.005, B +0.006, C -0.006, D +0.007, CB +0.002 | +0.0035 | 0.78× | 73% |
| amplitude da semente k=0.35 | A -0.015, B +0.004, C +0.008, D +0.003, CB +0.017 | +0.0028 | 1.16× | 0% |
| semente RNC (log) no lugar da vigente | A -0.014, B +0.026, C +0.042, D +0.083, CB -0.018 | +0.0257 | 0.66× | 83% |

**Juntar rendeu em uma das cinco hipóteses**, e é justamente a de I² = 0. Onde as
competições discordam (I² de 73% e 83%), agrupar detecta *menos* que a melhor
competição sozinha — o efeito médio é uma média sem referente.

E o sinal importa: **todo agrupado significativo aqui é uma PIORA.** O que o
agrupamento prova não é que existe um valor global melhor, e sim o contrário — que um
valor único imposto às cinco competições é pior que os atuais. Os parâmetros são
genuinamente por competição.

## 9. Longo prazo: até onde o modelo enxerga?

O estágio de longo prazo fixa um horizonte e varia o corte, o que dá uma única tabela
realizada por série. Mas **todo par (r, H) com r < H é uma previsão com desfecho
observado** — "sabendo até a rodada r, como estará a tabela na rodada H?". Varrendo a
grade, as partidas já disputadas rendem centenas de pares, decompostos pelo **alcance**
(H − r), que é a pergunta de verdade.

Os pares compartilham jogos, então isto não multiplica a amostra efetiva — dá
resolução, não poder. Uma temporada nunca dará IC honesto sobre "quem será campeão";
dá, sim, a forma da curva de habilidade contra o alcance.

Referências: **tabela congelada** (a colocação de r se mantém — o que qualquer leitor
faz de graça) e **semente neutra** (mesmo motor, todos os Elos iguais).

**Série A** (H máx 23)

| alcance (rodadas) | pares | RPS modelo | tabela congelada | semente neutra | habilidade vs. congelada | modelo vence em |
|---|---|---|---|---|---|---|
| 2 | 7 | 0.0618 | 0.0782 | 0.0560 | 20.9% | 6/7 |
| 4 | 6 | 0.0818 | 0.1184 | 0.0773 | 30.9% | 6/6 |
| 8 | 5 | 0.1100 | 0.1695 | 0.1056 | 35.1% | 5/5 |
| 16 | 2 | 0.1280 | 0.2263 | 0.1393 | 43.4% | 2/2 |

**Série B** (H máx 22)

| alcance (rodadas) | pares | RPS modelo | tabela congelada | semente neutra | habilidade vs. congelada | modelo vence em |
|---|---|---|---|---|---|---|
| 2 | 6 | 0.0808 | 0.1149 | 0.0805 | 29.7% | 6/6 |
| 4 | 6 | 0.1015 | 0.1632 | 0.1005 | 37.8% | 6/6 |
| 8 | 4 | 0.1398 | 0.2197 | 0.1363 | 36.4% | 4/4 |
| 16 | 2 | 0.1730 | 0.2816 | 0.1692 | 38.6% | 2/2 |

**Série C** (H máx 17)

| alcance (rodadas) | pares | RPS modelo | tabela congelada | semente neutra | habilidade vs. congelada | modelo vence em |
|---|---|---|---|---|---|---|
| 2 | 5 | 0.0799 | 0.1189 | 0.0805 | 32.9% | 5/5 |
| 4 | 4 | 0.1151 | 0.1763 | 0.1143 | 34.7% | 4/4 |
| 8 | 3 | 0.1483 | 0.2404 | 0.1497 | 38.3% | 3/3 |

## 10. O `drift` — o parâmetro que o curto prazo não enxerga

`applyDrift` só é chamado dentro do Monte Carlo, uma vez por rodada **simulada**, e só
para rodadas além da última disputada. O walk-forward caminha apenas sobre jogos reais,
então todo o estágio de curto prazo é cego a este parâmetro — nas tabelas da seção 1
ele aparece com delta zero **por construção**, não por inércia.

E ele não é decorativo em ATK/DEF: o ruído atinge `atk`/`def` junto com o Elo
(σ_ad = drift × 0,008), e é `atk`/`def` que alimenta λ. Como o ruído se acumula a cada
rodada simulada, o efeito cresce com o alcance. Na prática, é o botão que regula a
largura das distribuições de longo prazo.

Valor vigente: **15**.

| série | drift 0 | drift 5 | drift 15 | drift 30 | drift 60 |
|---|---|---|---|---|---|
| A | 0.10779 | 0.10685 | 0.10205 | **0.09836** | 0.09959 |
| B | 0.11019 | 0.10960 | 0.10706 | 0.10604 | **0.10577** |
| C | 0.11706 | 0.11647 | 0.11510 | **0.11437** | 0.11461 |

RPS sobre a distribuição de colocação. Menor é melhor.

### Calibração dos eventos binários — o instrumento certo para o drift

O RPS é pouco sensível à largura da distribuição; a calibração é o que denuncia
excesso ou falta de confiança. Agregando líder, top-4 e 4 últimos em todos os cortes e
séries:

| drift | Brier | previsto | observado | viés | ECE | confiança |
|---|---|---|---|---|---|---|
| 0 | 0.06637 | 15.00% | 15.00% | -0.00 pp | 3.005% | 41.14% |
| 5 | 0.06622 | 15.00% | 15.00% | +0.00 pp | 2.953% | 40.98% |
| 15 | 0.06581 | 15.00% | 15.00% | -0.00 pp | 2.498% | 40.22% |
| 30 | 0.06656 | 15.00% | 15.00% | -0.00 pp | 2.902% | 39.27% |
| 60 | 0.06868 | 15.00% | 15.00% | +0.00 pp | 3.474% | 38.52% |

A coluna **confiança** é a distância média da previsão em relação à indecisão: ela cai
conforme o drift sobe, que é exatamente o mecanismo esperado. A leitura útil é onde o
Brier e o ECE param de melhorar — abaixo disso o modelo está confiante demais.

### O ótimo está fora do que a interface permite

O seletor do dashboard oferece quatro valores: 0 (Off), 5 (Baixo), 10 (Médio) e
15 (**Alto**). O teto rotulado como "Alto" é justamente o valor vigente — e o ótimo
medido está acima dele. Não é um ajuste de configuração: é um valor que ninguém
consegue selecionar pela tela.

### Um mesmo viés, por três caminhos independentes

Três medições feitas por vias distintas apontam para a mesma direção — **o modelo é
sistematicamente confiante demais**:

- a **amplitude da semente** é larga demais na Série A (k≈1,06 contra ótimo 0,35–0,50):
  confiança excessiva na força a priori;
- o **`pesoCasa`** prevê 54,4% de vitórias em casa onde houve 45,3%: confiança excessiva
  na vantagem de mando;
- o **`drift`** está abaixo do ótimo **pelo RPS** em todas as séries testadas: confiança
  excessiva na estabilidade da força ao longo da temporada.

Os dois primeiros foram medidos com instrumentos diferentes — Brier no curto prazo e
teste z do viés marginal — e concordam. O terceiro **só concorda por uma das duas
métricas**, e essa ressalva está na subseção abaixo. A convergência dos dois primeiros
é o achado sólido; o drift é um caso mais interessante que isso.

### As duas métricas discordam sobre o drift

O RPS quer drift **alto** (ótimo 30 em A e C, 60 em B). A calibração dos eventos
binários quer **15** — exatamente o valor vigente, que minimiza tanto o Brier quanto o
ECE. Não é ruído: as duas curvas têm mínimos claros em lugares diferentes.

A explicação está no que cada métrica cobra. O RPS pontua a distribuição de colocação
inteira e pune previsões confiantes e erradas ao longo de toda a ordem — alargar a
distribuição ajuda. Os eventos binários (líder, top-4, 4 últimos) são grosseiros e
recompensam nitidez; alargar demais só apaga o sinal.

Isso é uma escolha de produto, não de estatística: **se o app existe para dizer quem
cai e quem sobe, 15 está certo. Se existe para projetar a tabela inteira, está baixo.**
O relatório não decide isso.

Nota metodológica: nas tabelas de calibração acima, "previsto" e "observado" coincidem
em 15,00% por construção — as probabilidades somam sobre os times, então a média
marginal é fixa em (1+4+4)/20/3. O teste de viés marginal, útil no curto prazo, é vazio
aqui; quem informa são o Brier, o ECE e a confiança.

## 11. A visão de longo prazo é confiável?

O RPS mede a qualidade da distribuição inteira e a habilidade mede se vale simular.
Nenhum dos dois responde o que um leitor pergunta ao ver "62% de título": **esse 62%
quer dizer 62%?**

Aqui cada trinca (corte, competição, clube) gera uma previsão para três eventos
binários e um desfecho observado. Decomposição de Murphy:
`Brier = confiabilidade − resolução + incerteza`. Confiabilidade baixa = as
probabilidades são honestas. Resolução alta = o modelo separa os casos. Um modelo pode
ter Brier bom por ser honesto e inútil, ou por ser informativo e desonesto — só o Brier
não distingue os dois.

| recorte | n | Brier | confiabilidade | resolução | incerteza | skill |
|---|---|---|---|---|---|---|
| **geral** | 10800 | 0.0712 | 0.00044 | 0.05587 | 0.1275 | 44.2% |
| lider | 3600 | 0.0327 | 0.00085 | 0.01527 | 0.0475 | 31.2% |
| top4 | 3600 | 0.0984 | 0.00117 | 0.06128 | 0.1600 | 38.5% |
| ultimos4 | 3600 | 0.0825 | 0.00208 | 0.07881 | 0.1600 | 48.4% |
| alcance 1-3 rodadas | 3720 | 0.0513 | 0.00072 | 0.07643 | 0.1275 | 59.7% |
| alcance 4-7 rodadas | 3240 | 0.0729 | 0.00153 | 0.05484 | 0.1275 | 42.9% |
| alcance 8-20 rodadas | 3720 | 0.0891 | 0.00105 | 0.03883 | 0.1275 | 30.1% |

### O número da confiabilidade é um teto, não um valor exato

A identidade `Brier = confiabilidade − resolução + incerteza` só é exata quando cada
faixa contém um único valor previsto. Com previsões contínuas sobra um resíduo, e ele
depende da largura das faixas — então a confiabilidade reportada também depende:

| nº de faixas | confiabilidade | resolução | resíduo da identidade |
|---|---|---|---|
| 5 | 0.000297 | 0.05466 | 1.94e-3 |
| 10 | 0.000436 | 0.05587 | 8.72e-4 |
| 20 | 0.000819 | 0.05701 | 1.20e-4 |
| 50 | 0.001368 | 0.05759 | 8.69e-5 |

A leitura honesta: a confiabilidade está em algum lugar até ~0,0014 — o valor exato é
artefato do agrupamento. O que sustenta a conclusão é a **ordem de grandeza**: mesmo o
teto é ~90× menor que a incerteza (0,1275) e ~40× menor que a resolução. As
probabilidades são honestas por qualquer granulação.

### Testes formais: a calibração publicada é boa?

Três testes com hipótese nula explícita — "as probabilidades são exatamente o que
dizem ser" — computados sobre os pares salvos. E um caveat obrigatório: os pares não
são independentes (cortes da mesma série compartilham o gabarito; dentro de um evento,
exatamente 4 dos 20 clubes terminam na zona), então os p-valores são aproximados e
tendem ao otimismo. Por isso cada teste roda também numa fatia quase-independente.

| grupo | n | Z (Spiegelhalter) | p | ECE obs. | ECE sob perfeição (média / p95) | percentil | faixas Wilson ok |
|---|---|---|---|---|---|---|---|
| todos os pares | 10800 | 2.58 | 0.010 | 1.73% | 0.59% / 0.86% | 100 | 7/10 |
| fatia quase-independente (1 alcance por série/evento) | 2760 | 2.86 | 0.004 | 2.89% | 1.18% / 1.70% | 100 | 7/10 |
| evento: lider | 3600 | 0.12 | 0.905 | 1.30% | 0.66% / 0.96% | 100 | 9/10 |
| evento: top4 | 3600 | 5.04 | <0,001 | 2.50% | 1.17% / 1.68% | 100 | 8/10 |
| evento: ultimos4 | 3600 | -0.98 | 0.325 | 3.45% | 1.16% / 1.66% | 100 | 5/10 |

**Leitura honesta: a calibração NÃO é estatisticamente perfeita.** Com n=10.800 o
desvio é detectável (Z=2,58, p=0,01; ECE no percentil 100 do seu nulo) e sobrevive à
fatia quase-independente. Mas os testes por evento localizam o problema: **líder e
4 últimos passam** (Z=0,12 e −0,98); quem falha é o **top-4** (Z=5,04). E a magnitude
é pequena — os desvios das faixas que falham são de 1 a 6 pontos percentuais.

O desvio mais relevante na prática está na faixa 0–10%: previsto 1,6%, observado
2,8%. Em termos absolutos é 1,2 pp; em termos relativos, os quase-impossíveis
acontecem com quase o dobro da frequência anunciada — é o preço da cauda.

E o duelo contra a tabela congelada, agora como métrica em vez de anedota: o modelo
vence em 49 de 50 células da grade de alcances — teste de sinal
p = 9.1e-14. Mesmo descontando generosamente a dependência entre células
(que compartilham jogos), a margem é de muitas ordens de grandeza.

### Diagrama de confiabilidade

| faixa prevista | n | previsto | observado | desvio |
|---|---|---|---|---|
| 0-10% | 7074 | 1.6% | 2.8% | +1.2 pp |
| 10-20% | 1108 | 14.7% | 12.5% | -2.3 pp |
| 20-30% | 691 | 24.6% | 21.4% | -3.2 pp |
| 30-40% | 477 | 34.4% | 28.3% | -6.1 pp |
| 40-50% | 313 | 44.8% | 44.4% | -0.4 pp |
| 50-60% | 263 | 55.2% | 53.2% | -2.0 pp |
| 60-70% | 225 | 65.2% | 62.7% | -2.5 pp |
| 70-80% | 147 | 74.8% | 71.4% | -3.3 pp |
| 80-90% | 171 | 85.3% | 88.9% | +3.6 pp |
| 90-100% | 331 | 97.2% | 98.2% | +1.0 pp |

Desvio positivo = aconteceu mais do que o previsto (modelo tímido nessa faixa);
negativo = aconteceu menos (otimista demais).

## 12. Quando o modelo discorda da tabela, quem ganha?

A demonstração de que a visão de longo prazo faz sentido não é uma métrica: é o duelo.
Se o modelo só repetisse a classificação corrente, seria inútil por construção —
qualquer um lê a tabela de graça. O valor dele está nos **desacordos francos**: casos em
que a tabela diz uma coisa (o time está na zona / está fora) e o modelo aponta para o
lado oposto com convicção (|p − tabela| > 0.5). No desfecho, um dos dois acertou.

**Placar geral: modelo 51 × 29 tabela** — 63.7% dos 80 desacordos para o modelo.

| recorte | duelos | vitórias do modelo | taxa |
|---|---|---|---|
| lider | 14 | 10 | 71% |
| top4 | 33 | 20 | 61% |
| ultimos4 | 33 | 21 | 64% |
| Série A | 31 | 20 | 65% |
| Série B | 29 | 18 | 62% |
| Série C | 20 | 13 | 65% |

### Vitórias mais nítidas do modelo

| série | rodada | clube | posição então | modelo dizia | desfecho (rodada H) |
|---|---|---|---|---|---|
| A | 3 | Cruzeiro | 20º | 2% de ultimos4 | 5º — fora |
| A | 6 | Cruzeiro | 19º | 7% de ultimos4 | 5º — fora |
| B | 3 | Goiás | 1º | 8% de lider | 10º — fora |
| B | 6 | Vila Nova | 1º | 10% de lider | 3º — fora |
| A | 6 | Botafogo | 17º | 11% de ultimos4 | 11º — fora |
| A | 6 | São Paulo | 1º | 12% de lider | 13º — fora |
| A | 9 | Cruzeiro | 17º | 13% de ultimos4 | 5º — fora |
| A | 6 | Flamengo | 5º | 87% de top4 | 2º — dentro |
| A | 3 | Internacional | 19º | 16% de ultimos4 | 16º — fora |
| B | 15 | Vila Nova | 1º | 16% de lider | 3º — fora |

### Derrotas mais nítidas

| série | rodada | clube | posição então | modelo dizia | desfecho (rodada H) |
|---|---|---|---|---|---|
| A | 9 | Mirassol | 19º | 14% de ultimos4 | 17º — dentro |
| A | 12 | Mirassol | 18º | 25% de ultimos4 | 17º — dentro |
| B | 6 | Criciúma | 4º | 26% de top4 | 1º — dentro |
| A | 21 | Fluminense | 4º | 28% de top4 | 4º — dentro |
| A | 18 | Athletico-PR | 4º | 31% de top4 | 3º — dentro |
| B | 9 | Vila Nova | 4º | 31% de top4 | 3º — dentro |

Ressalva de leitura: os duelos do mesmo clube em cortes vizinhos não são independentes —
um Fluminense que despenca gera vários desacordos que se resolvem juntos. O placar é
demonstração, não teste de hipótese; os testes estão nas seções anteriores.

## 13. E se 2026 tivesse rodado com os ajustes?

Contrafactual: a "configuração candidata" aplica só os achados sólidos —
`pesoCasa` único 0.58 nas quatro ligas e a amplitude da semente da Série A
encolhida para k=0.4 — e reprocessa a temporada inteira.

> **Este número é um teto, não uma expectativa.** Os ajustes foram derivados destes
> mesmos dados. Dois atenuantes declarados: os valores são redondos, vindos de curvas
> suaves (pouca capacidade de overfit em dois números), e o ganho é conferido também
> na segunda metade da temporada. O teste limpo é dezembro.

| competição | Brier atual → candidata | ECE | viés de casa | Δ (IC95) |
|---|---|---|---|---|
| A | 0.6585 → 0.6293 | 7.8% → 3.6% | -9.1 → -0.8 pp | -0.0293 [-0.0544, -0.0036] **sig.** |
| B | 0.6390 → 0.6387 | 2.6% → 2.6% | -3.1 → -2.7 pp | -0.0004 [-0.0011, 0.0004] |
| C | 0.6526 → 0.6528 | 3.2% → 2.8% | 1.9 → 2.2 pp | +0.0002 [-0.0006, 0.0010] |
| D | 0.6254 → 0.6223 | 2.9% → 2.7% | -5.6 → -2.5 pp | -0.0031 [-0.0075, 0.0009] |
| CB | 0.5486 → 0.5486 | 7.6% → 7.6% | -1.5 → -1.5 pp | +0.0000 [0.0000, 0.0000] |
| **agregado** | 0.6354 → 0.6283 | 2.78% → 1.39% | — | -0.0071 [-0.0123, -0.0014] **sig.** |

Longo prazo (RPS médio sobre os cortes): A 0.1022 → 0.0975 (4.6%) · B 0.1069 → 0.1072 (-0.3%) · C 0.1149 → 0.1150 (-0.1%).

A leitura: **o ganho é quase todo o conserto da Série A** — Brier −0,029 (significativo,
e ainda maior na segunda metade), viés de casa de −9,1 pp para −0,8 pp, ECE de 7,8%
para 3,6%. Com isso a Série A passa de indistinguível da taxa-base para claramente
melhor que ela. B, C e Copa já estavam certas e não mudam; a D melhora um pouco. O
ECE agregado cai à metade (2,78% → 1,39%): o modelo teria sido sobretudo mais
**honesto**, não mais vidente.

## 14. O Brier em escala: teto, piso e o mercado

"0,63 não é ruim?" — a pergunta certa, com resposta quantitativa: a escala do 1X2 é
**comprimida**. Um jogo típico com probabilidades verdadeiras 45/28/27 tem Brier
esperado de ~0,645 *mesmo para quem conhece essas probabilidades exatamente* — o acaso
do futebol impõe o piso. As âncoras, todas medidas nos mesmos jogos:

- **auto-esperado**: o Brier que o próprio modelo espera de si (média de 1 − Σp²). Se o
  realizado ≈ auto-esperado, o modelo entrega o que promete e o nível reflete falta de
  informação, não desonestidade.
- **clarividente**: previsão com os ratings *finais* da temporada — vazamento deliberado.
  É o teto de qualquer melhoria de estimativa de força nesta família de modelo; abaixo
  dele só com informação de jogo (escalação, desfalques, descanso).

| âncora | Brier | RPS/jogo | A (Brier) | B (Brier) | C (Brier) | D (Brier) | CB (Brier) |
|---|---|---|---|---|---|---|---|
| uniforme | 0,667 | — | 0,667 | 0,667 | 0,667 | 0,667 | 0,667 |
| taxa-base (walk-fwd) | 0.6564 | 0.2231 | 0.6541 | 0.6662 | 0.6513 | 0.6558 | 0.6454 |
| modelo vigente | 0.6354 | 0.2126 | 0.6585 | 0.6390 | 0.6526 | 0.6254 | 0.5486 |
| modelo candidato | 0.6283 | 0.2100 | 0.6293 | 0.6387 | 0.6528 | 0.6223 | 0.5486 |
| clarividente (teto de força) | 0.5923 | 0.1936 | 0.6016 | 0.6031 | 0.6259 | 0.5782 | 0.5210 |

O candidato realiza 0.6283 contra auto-esperado de 0.6244 — entrega o que promete. A distância até o
clarividente (0.5923) é o espaço capturável por melhor estimativa
de força: ~0,036, concentrado na Série D (0,044), onde 96 clubes têm ~10 jogos de grupo
para os ratings convergirem.

### Comparação externa, na métrica dos outros

O benchmark público disponível é o **RPS de partida** das odds de fechamento de casas de
aposta ([pena.lt](https://pena.lt/y/2025/07/16/how-accurate-are-soccer-odds/), ~250 mi
de linhas, temporada 2024/25; Brasil não coberto): **0,18–0,20 nas grandes ligas
europeias, 0,20–0,22 nas divisões inferiores**. O modelo candidato mede **0,2100**
agregado (A: 0,2080; B: 0,2157; C: 0,2285; D: 0,2050; Copa: 0,1777) — dentro da faixa
das odds de mercado para ligas de segundo escalão, sem usar nenhuma informação além dos
placares. O clarividente (0,1936) tangencia a faixa das grandes ligas: nem força
perfeita alcança o que o mercado faz com escalações e notícias.

Caveat de comparação: ligas diferentes têm imprevisibilidade diferente (o Brasileirão é
notoriamente equilibrado), e odds de fechamento agregam informação que nenhum modelo de
resultados tem. A comparação situa a ordem de grandeza; não é um ranking.

## 15. Recomendações para 2027

Em ordem de confiança no achado que as sustenta.

0. **Manter ATK/DEF como modo padrão — agora medido.** Δ +0,0268 a favor de ATK/DEF
   contra ELO PURO, z = 5,43: o maior efeito de todo o relatório, e em 4 das 5
   competições. A escolha estava certa e nunca tinha sido verificada. Corolário: os
   blocos `homeAdv`, `kElo` e `c0Log` só existem no modo que o app **não** usa.
1. **Congelar as previsões desde a rodada 1.** A razão de 2026 só admitir *replay* é
   que nada foi arquivado. Um `predictions.jsonl` gravado pela Action semanal (data,
   rodada, config, probabilidades) transforma a próxima avaliação de reconstrução em
   auditoria. É a única coisa aqui que não pode ser feita retroativamente.
2. **Um `pesoCasa` para as ligas, outro para o mata-mata — dois números, não cinco.**
   O gap de casa é o defeito mais sólido medido, e é monotônico no parâmetro. Mas a
   varredura conjunta mostra que as quatro ligas são servidas por um valor único (≈0,58)
   melhor do que pelos quatro valores de hoje, com custo dentro do ruído em todas. A Copa
   do Brasil é a única exceção real e fica com o seu (≈0,65). Menos parâmetros, mais
   acerto.
   *Não* calibrar pelo observado: o ótimo de Brier não é a fração observada de gols,
   porque o parâmetro também muda a forma da grade de Poisson.
3. **Tratar a AMPLITUDE da semente como parâmetro de primeira classe** — hoje ela é um
   efeito colateral de que números alguém digitou. A curva em U da seção 3 tem ótimo
   bem definido e diferente por divisão, e a Série A está 2–3× larga demais. Um campo
   explícito por série (e não o alcance implícito do `_RANKING`) tornaria isso ajustável
   e auditável. Corolário: **não vale caçar a ordenação perfeita** — no ótimo de
   amplitude, "à mão", RNC e ano anterior empatam.
4. **Decidir o que o Elo é.** Hoje ele evolui, aparece na tela e não afeta previsão
   nenhuma (seção 1). Ou ele volta para o cálculo de λ — e aí `kElo`/`homeAdv` passam a
   significar algo — ou o modelo assume que é atk/def com semente, e os dois parâmetros
   saem da configuração para não sugerir controle que não existe. O mesmo vale para
   `targetRatio`, que só está vivo na Série A.
5. **Manter a qualificação por UF da Série D e aposentar os overrides.** A `SD_UF` é a
   única camada que sozinha bate "todos iguais" de forma significativa, e bate também
   uma tabela de UF derivada do RNC — a versão feita à mão venceu a de aparência mais
   objetiva. Já os 38 valores de `SD_OVR` não acrescentam nada mensurável (Δ +0,0003
   contra `UF + origem`): são 38 números para manter à mão sem retorno demonstrável.
6. **A semente rende onde há disparidade real.** O ganho de semear é ~10× maior na Copa
   do Brasil que nas ligas, e lá o ótimo de amplitude é k=1: quando os confrontos
   cruzam divisões, vale confiar na semente inteira. Dentro de uma divisão, onde os
   clubes são parecidos, quase toda a informação a priori é ruído — por isso o k ótimo
   cai conforme a divisão fica mais homogênea. **A amplitude deveria ser função da
   dispersão de força esperada na competição**, não um número herdado.
7. **Tratar o déficit de empates como problema de modelo.** Dixon-Coles ajuda pouco e
   não fecha o buraco; a maior parte do déficit vem do viés de casa. Vale reavaliar com
   a temporada completa antes de adotar.
8. **O longo prazo ganha simulando, não semeando.** Na grade de alcances, a semente
   neutra empata ou supera a vigente até ~8 rodadas à frente nas três séries; o modelo
   só se separa dela no alcance 16 da Série A. O que bate a tabela congelada — e bate em
   34 dos 35 pares, com vantagem crescendo de 21% para 43% conforme o alcance aumenta —
   é simular os jogos restantes com incerteza, não saber quem era favorito em janeiro.
9. **Considerar `base` como preset padrão.** É a melhor célula em 4 das 5 competições;
   `agressivo` é significativamente pior. O agrupado não atinge significância porque a
   Série C discorda com força — então é uma troca defensável, não comprovada.
10. **Parâmetro global é o desenho errado.** Todo teste agrupado significativo apontou
   PIORA: impor um valor único às cinco competições perde para os valores atuais. A
   estrutura correta é por competição, com o agrupamento servindo para detectar
   heterogeneidade — não para achar um número que sirva a todos.
11. **Não otimizar `total` pelo Brier de jogo.** O ótimo aponta para ~1,3 gols/jogo onde
   acontecem 2,6, porque λ menor infla empates e tapa o buraco da Poisson. Adotar isso
   corromperia o saldo de gols, que decide desempates na tabela simulada. É diagnóstico
   da verossimilhança errada, não configuração.
12. **Preservar o que já funciona: as probabilidades de longo prazo são
   aproximadamente honestas — e o desvio residual tem endereço.** A má calibração é
   estatisticamente detectável (Z de Spiegelhalter 2,58) mas pequena (ECE 1,7%), passa
   nos eventos líder e 4 últimos e se concentra no **top-4** e na faixa 0–10%, onde os
   quase-impossíveis acontecem com o dobro da frequência anunciada. Conforme o alcance
   cresce, o modelo perde **resolução** (0,076 → 0,039) sem degradar a confiabilidade,
   que é o modo de falha correto. Qualquer mudança em 2027 deve ser verificada contra
   essa linha de base — os testes formais da seção 11 — e não só contra o Brier.
13. **Motor como módulo.** `scripts/engine.cjs` recorta a engine do HTML por marcador
   textual. Funciona, mas é muleta: 2027 deveria nascer com `engine/*.mjs` consumido
   tanto pelo app quanto pelo harness.

## Limitações

- **Uma temporada, um desfecho.** O longo prazo pontua contra uma única tabela
  realizada. Nada aqui é "melhoria comprovada" — são hipóteses para 2027.
- **Temporada incompleta.** As zonas reais (título, acesso, Z4) ainda não existem; os
  eventos são genéricos (1º, top-4, 4 últimos), derivados de `posF`.
- **Poder estatístico baixo no Brier.** Ver "Como ler estes números".
- **O teste z do viés é aproximado.** Ele usa Var(Σ O) = Σ p(1−p), que trata as
  probabilidades previstas como fixas. Num walk-forward elas não são: cada previsão
  depende dos resultados anteriores, então a soma prevista é aleatória e correlacionada
  com os desfechos. O efeito é subestimar a variância, ou seja, o teste é um pouco
  otimista. Os dois vieses significativos (A e D) têm |z| ≈ 2,5–3,0, com folga sobre o
  corte, mas não os leia como se fossem exatos.
- **Clubes sem histórico recebem piso, e isso pesa na Série D:** 48 dos 96 clubes não
  disputaram competição nacional em 2025 e 22 não têm RNC. As sementes baseadas nessas
  fontes empilham metade da série no mesmo valor, o que explica por que elas vão tão mal
  ali — é limitação do dado, não do método.
- **Calibração e varredura na mesma temporada.** Escolher a variante vencedora aqui e
  reportar o ganho aqui é circular; por isso o veredito é por calibração e por
  consistência entre séries, não por Brier ótimo.
- **Replay, não auditoria.** Isto mede o modelo de hoje aplicado ao passado, não o que
  o app exibia na época — nada foi arquivado. Corrigir isso é requisito de nascença do
  repositório de 2027.

