# Verify — Simulador Brasileirão 2026

App = HTML standalone (`brasileirao-2026.html` / `index.html`, idênticos). Superfície = browser.
Sem test runner. Verificação = Edge headless + screenshots.

## Receita (Windows, Git Bash)

1. Gerar uma CÓPIA do HTML no scratchpad com:
   - seed de localStorage (opcional) injetado como `<script>` ANTES do `<script>` principal
     (o app lê localStorage nos inicializadores de useState) — chaves úteis: `simUni_userRes`,
     `simUni_fetchedRes`, `simUni_cbR16`, `simUni_sdMM`, `simUni_bPO`, `simUni_cQuad`;
   - driver de cliques injetado antes de `</body>`:
     `clickByText('Série D')` etc. via `[...document.querySelectorAll('button')].find(b=>b.textContent.includes(txt)).click()`
     em `setTimeout`s (2500ms+ para o mount; CDN React/Tailwind precisa de rede).

2. Rodar (caminho do URL precisa ser Windows-style — usar `cygpath -m`):
   ```bash
   EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
   "$EDGE" --headless=new --disable-gpu --no-first-run --window-size=1440,1600 \
     --virtual-time-budget=20000 --user-data-dir="$WD/profile_X" \
     --screenshot="$WD/shot.png" "file:///$WD/teste.html"
   ```

## Gotchas

- O msedge.exe DESANEXA e escreve o PNG de forma assíncrona → fazer poll do arquivo
  (`while [ ! -s shot.png ]; do sleep 2; done`). `--dump-dom` NÃO funciona (stdout perdido).
- Perfil (`--user-data-dir`) fica travado por processos headless zumbis → usar nome novo por
  rodada; matar só os headless:
  `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -match 'headless' } | % { Stop-Process -Id $_.ProcessId -Force }`
- `--virtual-time-budget` avança rAF/timers: o "Simular Tudo" (auto-roda no load!) completa
  10k sims dentro do budget.
- O app AUTO-RODA o Monte Carlo do dashboard no mount — todo screenshot já exercita
  runAll/simMC de todas as séries.

## Fluxos que valem dirigir

- Seed `simUni_userRes` com placar de jogo REALMENTE pendente (ex.: adiados da R4 da Série A)
  e placar absurdo (0×6) → título% do dashboard deve mudar visivelmente. Cuidado: par com
  resultado embutido é DEDUPADO (embutido > manual > buscado) e não influencia nada.
- Série D: tab Série D → Mata-mata → botão Árvore (bracket FIFA).
- Copa BR: tab Copa BR → sub-aba Árvore; seed `simUni_cbR16` muda vencedor das oitavas na
  árvore E o título% da CB no dashboard.
- Probe: localStorage corrompido (`'{{{'`) não pode derrubar o app (try/catch em todo seed).
