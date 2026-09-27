# `eval/` — avaliação retroativa das previsões

Mede **quanto o modelo do app realmente acerta**, em dois estágios independentes:

- **curto prazo** — probabilidades V/E/D jogo a jogo, walk-forward honesto
- **longo prazo** — a tabela projetada, via Monte Carlo, a partir de cada rodada

Existe porque nenhuma previsão de 2026 foi jamais medida contra a realidade, e nenhuma foi
arquivada: o app recalcula tudo no navegador a cada carga e as probabilidades evaporam.

## Rodar

```bash
node eval/run.cjs              # curto + longo (5k sims, 5 sementes) + REPORT.md
node eval/run.cjs --curto      # só curto prazo — segundos
node eval/run.cjs --selftest   # só as checagens de integridade
node eval/run.cjs --full       # 10k sims, 8 sementes — a corrida de dezembro
```

Saída: `eval/out/curto.json`, `eval/out/longo.json` (canônicos, diffáveis entre execuções) e
`eval/REPORT.md` (formatação, nunca cálculo).

## Regra de ouro: este diretório só LÊ o app

O `eval/` lê `index.html` e `results.json` e escreve **apenas** em `eval/out/` e
`eval/REPORT.md`. Nunca edita o app, nunca roda `build_html.js`. O fatiamento do HTML
acontece em memória.

`run.cjs` aborta se o checkout estiver atrás de `origin/main` ou com `index.html`/
`results.json` sujos. Não é zelo: a Action commita em `main` no próprio horário, e avaliar
uma cópia velha mede um modelo que não está no ar — erro que o `CLAUDE.md` do repo registra
como já cometido. `--allow-dirty` dispensa a checagem quando a defasagem é intencional.

## Como o motor é carregado

Via `scripts/engine.cjs` (`loadEngine`/`runWithEngine`), que já existia e faz exatamente o
necessário: recorta a engine do `index.html` por **marcadores textuais** (nunca números de
linha) e avalia com um shim de `localStorage`.

Duas funções — `normName` e `findRod` — são declaradas *dentro* do componente React, então
não são bindings de topo e `loadEngine` não as alcança. `lib/appdata.cjs` fatia o texto das
duas e as reavalia no escopo do motor, com a mesma disciplina de marcadores.

## Autoteste — a checagem que sustenta tudo

`lib/walkforward.cjs` reimplementa o laço do `backtestSeries` do app para poder **guardar os
λ** de cada jogo (o original só devolve probabilidades, o que impediria testar mapeamentos
alternativos como Dixon-Coles). Reimplementação é risco: se ela divergir, o harness estaria
medindo um primo do modelo, não o modelo.

Por isso `run.cjs --selftest` compara as duas, jogo a jogo, e **aborta acima de 1e-12**.
Hoje o desvio é ~2e-16 (erro de arredondamento de ponto flutuante), nas três séries.

## Estrutura

| arquivo | papel |
|---|---|
| `run.cjs` | ponto de entrada; sincronia, autoteste, orquestração |
| `rodar_curto.cjs` / `shortterm.cjs` | estágio de curto prazo |
| `rodar_longo.cjs` / `lib/longterm.cjs` | estágio de longo prazo (MC, RPS) |
| `relatorio.cjs` | JSON → `REPORT.md`; só formata |
| `lib/appdata.cjs` | reconstrói os resultados que o app enxerga (`mergeRes` + `results.json`) |
| `lib/walkforward.cjs` | walk-forward com captura de λ + Dixon-Coles |
| `lib/metrics.cjs` | Brier, logloss, calibração, ECE, bootstrap pareado |
| `lib/seeds.cjs` | estratégias de Elo inicial |
| `lib/rncjoin.cjs` | join app ↔ `RNC_2026` por (nome normalizado, UF) |

## Decisões de desenho que não são óbvias

**Horizonte por filtro de rodada.** `simMC` não tem parâmetro de horizonte — simula até o
fim da fixture que recebe. Filtrar a fixture por `rodada <= H` faz o MC tratar H como o fim
do campeonato. Com H = 38 (dezembro) isso é a temporada inteira e o comportamento é o
nativo.

**Eventos derivados de `posF`.** Os campos `titulo`/`g4`/`z4` embutem a regra de zona de
cada série. Em horizonte encurtado essas zonas não existem — "rebaixado na rodada 22" não é
coisa. Então todo evento sai da distribuição de colocação `posF`, que é bem definida em
qualquer H e comparável entre séries. Isso também neutraliza as fases finais de B e C: elas
continuam rodando dentro do `simMC`, mas não entram na pontuação.

**Corte por rodada, não por data.** Os resultados de liga em `results.json` não têm data —
só `rodada`. As datas vivem num array separado e incompleto (A: 121 de 380). Cortar por
data exigiria imputar data para a maioria dos jogos, introduzindo erro justamente na
fronteira do corte.

**Ausência de RNC vira piso, não média.** Clube sem histórico nacional (entrou na Série D
por vaga estadual) recebe o menor valor do grupo. Tratá-lo como mediano inventaria força
que ninguém mediu.

**Monte Carlo semeado.** `lib/longterm.cjs` troca `Math.random` por um PRNG semeado durante
a simulação e restaura depois, para que duas execuções com a mesma semente coincidam.

## Calibração decide, Brier confirma

Com ~220 jogos por série, o Brier é dominado pela variância irredutível do resultado:
diferenças de 0,005 a 0,015 entre configurações têm IC95 (bootstrap pareado) cruzando zero.
O viés marginal — quanto o modelo prevê de vitórias em casa vs. quantas houve — é estimável
com precisão muito maior.

Por isso nenhum resultado é reportado como "melhoria comprovada". A varredura e a avaliação
acontecem na mesma temporada, o que é circular por construção; o veredito sai da calibração
e da consistência entre séries, não do Brier ótimo.
