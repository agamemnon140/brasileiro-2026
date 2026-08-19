# Pipeline do Ranking Nacional de Clubes

Gera a constante `RNC_2026` do `index.html` — 235 clubes com pontos, colocação e
`s5 = Σ(P2021..P2025)`.

**O `s5` não é publicado pela CBF.** Ele é reconstruído das classificações gerais das
Séries A/B/C/D e das Copas do Brasil de 2021-2025, aplicando a Convenção de Pontos.
Sem este pipeline os valores viram números mágicos, impossíveis de auditar ou de
regenerar quando o RNC 2027 sair (dezembro de 2026).

## Como rodar

```bash
mkdir -p wiki
# 1. RNC 2026 oficial (PDF da CBF) + espelho em HTML da Band
curl -o rnc2026.pdf "https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/RNC_Ranking_Nacional_dos_Clubes_2026_27e24418e7.pdf"
pdftotext -layout -enc UTF-8 rnc2026.pdf rnc2026.txt
curl -A "Mozilla/5.0" -o band.html "https://www.band.com.br/esportes/ranking-nacional-de-clubes-da-cbf-2026-veja-lista-completa-com-235-times-202512241029"
# 2. wikitext: 20 classificações de liga + 6 Copas do Brasil (ver parse_liga.py/parse_cb.py)
python parse_band.py     # -> band.json   (nome, UF, pontos)
python ranks.py          # -> posCBF      (empate REPETE a posição, ao contrário da Band)
python parse_liga.py     # -> liga_raw.json
python parse_cb.py       # -> cb_raw.json
python build_sigma.py    # -> rnc_sigma.json + validação
python gen_js.py         # -> rnc_const.js  (colar no index.html)
```

## A validação que fecha tudo

`build_sigma.py` reconstrói o RNC 2026 publicado a partir dos dados ano a ano:

```
RNC2026 = 5·P25 + 4·P24 + 3·P23 + 2·P22 + 1·P21
```

Se algum valor anual estivesse errado, a soma ponderada não bateria. **Ela bate para
os 235 clubes, sem uma única divergência** — o que valida de uma vez a escala de pontos,
o parsing das 20 classificações, o das 5 Copas do Brasil e toda a reconciliação de nomes.

Use isso como teste de regressão: qualquer mudança no pipeline tem de manter 235/235.

## Armadilhas descobertas (todas custaram tempo)

| Armadilha | Detalhe |
|---|---|
| PDF em 2 colunas | `Fed.`+`Pontos` da coluna da direita saem na linha **anterior** ao nome. O ABC (46º) aparece com "MA" quando é do RN. Por isso a Band é a fonte primária e o PDF só confere. |
| Empates | A CBF **repete** a posição (161 aparece 7×); a Band renumera. `ranks.py` recalcula no padrão da CBF e bate com o PDF em 117/117 nomes conferidos. |
| Série C | De 2022 em diante o template transcluído é a tabela da **1ª fase**, não a classificação final. Usá-lo poria o Caxias em 1º em 2025, quando ele foi 5º na geral. |
| Fase preliminar 2021 | Obs. (h) da Convenção: em 2020/2021 a Série D teve fase preliminar de 8 clubes e os 4 que não avançaram valem **10 pontos**, não os 51 do piso. São as 4 últimas linhas das 68 de 2021. |
| Copa do Brasil 2021-2022 | O divisor da 1ª fase vem como cabeçalho (`!colspan="12"`), não como célula. Ancorar no **rótulo** da fase, nunca no número do colspan. |
| Homônimos | `Rio Branco` sem sufixo é o do **ES** (AC e PR levam sufixo). `União AC` é o do **TO** — a aritmética fecha: 5×(51+50) = 505, o valor publicado. |
| Nomes | Três `Operário`, cinco `Atlético`, dois `Rio Branco`, dois `Primavera`. O join é sempre por **(nome normalizado, UF)**; com UF conhecida e sem par, o clube está ausente — nunca adivinhar. |
