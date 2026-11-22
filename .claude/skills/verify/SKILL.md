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
- (v4.80) Trabalho em `requestAnimationFrame` disparado DEPOIS do mount (ex.: a varredura da
  aba Evolução) não avança sob `--virtual-time-budget` — o auto-run do dashboard completa, mas
  um rAF encadeado iniciado por clique fica em 0%. Na CÓPIA de teste, polyfillar antes do
  script principal: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`.
  Drivers que fazem polling: usar poucos sims (500/ponto) — há um teto real de ~18 s por captura.
  Para mudar um `<select>` controlado pelo React: `s.value = v; s.dispatchEvent(new Event('change', {bubbles: true}))`.

## Receita (Linux / sandbox sem acesso aos CDNs)

No ambiente de nuvem o Chrome não alcança cdnjs nem cdn.tailwindcss.com, então a página abre em
branco. Monte a cópia de teste com os dois trocados por arquivos locais e sirva por HTTP (o
`results.json` é buscado por caminho relativo; `file://` bloqueia o fetch):

- `npm install react@18.2.0 react-dom@18.2.0 tailwindcss@3` numa pasta de rascunho; copie
  `react/umd/react.development.js` e `react-dom/umd/react-dom.development.js` (o build de
  desenvolvimento ainda acusa key duplicada e filho inválido) e troque as duas tags `<script>`;
- gere o CSS com `npx tailwindcss -i in.css -o tw.css --content copia.html` (`in.css` = as três
  diretivas `@tailwind`) e troque a tag do Play CDN por `<link rel="stylesheet" href="tw.css">`.
  REGERE o CSS a cada mudança de classe — ele só contém o que estava no HTML naquele momento;
- copie o `results.json` para a mesma pasta, `python3 -m http.server`, e dirija com o Playwright
  (`chromium.launch({ executablePath: '/usr/bin/google-chrome' })`). Viewport de celular de verdade
  sai de `newContext({ viewport: { width: 375, height: 812 }, isMobile: true })` — aqui não precisa
  do truque do iframe. O "Simular Tudo" automático (10k sims) fecha em ~15 s; espere por um seletor
  da aba em vez de um tempo fixo.
