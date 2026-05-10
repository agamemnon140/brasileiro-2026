# Brasileirão 2026 — Simulador

PWA (Progressive Web App) do simulador Monte Carlo do Campeonato Brasileiro 2026. Cobre Séries A, B, C, D e Copa do Brasil. Motor Poisson + ELO + ATK/DEF com drift estocástico opcional.

## Funcionalidades

- **Tabelas e simulações** das 4 séries + Copa do Brasil
- **Probabilidades** de título, acesso/Libertadores, rebaixamento (Z4)
- **Aba Evolução**: mostra como a probabilidade de cada time evoluiu rodada-a-rodada
- **Aba Ao Vivo**: simulação de partidas com placar parcial
- **Cruzamentos**: probabilidade de confrontos por fase
- **Preset α global** (Conservador / Base / Agressivo) controla sensibilidade do motor
- **Drift estocástico** opcional para refletir evolução real do nível dos times ao longo do campeonato
- **Funciona offline** após primeira carga (service worker)

## Versão standalone (`brasileirao-2026.html`)

Há também um arquivo **`brasileirao-2026.html`** na raiz que é uma versão *self-contained*: todo o JSX, o loader e os ícones essenciais estão inline. Vantagens:

- **Funciona sem servidor**: dá pra abrir direto no Finder/Explorer (`file://`) — não precisa nem de `python -m http.server`.
- **Backup completo**: 1 arquivo de ~327 KB que carrega o app inteiro.
- **Fácil distribuição**: mandar por email, AirDrop, USB.

Limitações da versão standalone:
- Sem service worker (não funciona offline em PWA install).
- Sem manifest (não dá pra "instalar" como app — abre como página normal).
- Babel sempre transpila no cliente (não há cache offline persistente).

A versão "completa" (`index.html` + `app.jsx` + `manifest.json` + service worker + ícones) é a recomendada pra deploy no GitHub Pages e instalação no iPhone.

## Deploy

### GitHub Pages

1. Crie repositório `brasileirao-2026` (público) e faça push deste conteúdo.
2. Em Settings → Pages, escolha branch `main` (ou `gh-pages`) e diretório `/` (root).
3. Aguarde o deploy (1-2 min). O app fica disponível em `https://<seu-user>.github.io/brasileirao-2026/`.

### Outros provedores

Funciona em qualquer host estático: Netlify, Vercel, Cloudflare Pages, Firebase Hosting. Basta servir o diretório como HTML estático com HTTPS (obrigatório pra service worker).

## Instalação no iPhone

1. Abra a URL no **Safari** (não funciona em Chrome no iOS pra "Adicionar à Tela de Início").
2. Toque no botão **Compartilhar** (quadrado com seta apontando pra cima).
3. Role para baixo e toque em **"Adicionar à Tela de Início"** (Add to Home Screen).
4. Confirme o nome ("Brasileirão 26") e toque em **Adicionar**.
5. O ícone aparece na tela inicial. Ao abrir, roda em modo standalone (sem barra do navegador).

## Instalação em Android

1. Abra no Chrome.
2. Menu (3 pontinhos) → **"Adicionar à tela inicial"** ou **"Instalar app"**.
3. Confirme.

## Atualizações

O simulador é atualizado regularmente com novos resultados. O service worker usa estratégia **network-first**: quando online, sempre tenta carregar a versão mais recente; se offline, usa o cache.

Para forçar atualização imediata no iPhone:
1. Abra o app.
2. Mantenha pressionado e arraste de cima pra baixo (puxe pra atualizar) — funciona no Safari standalone mode.
3. Ou simplesmente feche e reabra após estar online.

## Estrutura do repositório

```
brasileirao-2026/
├── index.html              # Entry point (carrega app.transpiled.js)
├── app.jsx                 # Código React fonte (~2350 linhas)
├── app.transpiled.js       # Versão JS pura (gerada por build.sh — É o que o browser usa)
├── brasileirao-2026.html   # Versão standalone (tudo embutido, abre em file://)
├── manifest.json           # Web App Manifest (PWA config)
├── service-worker.js       # Cache offline (network-first)
├── build.sh                # Regera app.transpiled.js e brasileirao-2026.html
├── icons/
│   ├── logo.svg            # Logo master (com squircle)
│   ├── logo-square.svg     # Versão quadrada (iOS apple-touch-icon)
│   ├── logo-maskable.svg   # Versão com safe zone (Android maskable)
│   ├── icon-192.png        # PWA Android 192x192
│   ├── icon-512.png        # PWA Android 512x512
│   ├── icon-maskable-192.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png  # 180x180 iOS
│   ├── favicon-32.png
│   └── favicon-16.png
└── README.md
```

## Detalhes técnicos

- **React 18** via UMD (sem build step de bundler)
- **JSX pré-transpilado**: `build.sh` roda `@babel/preset-env` + `preset-react` localmente para gerar `app.transpiled.js`. O browser nunca executa Babel em runtime — o app carrega em <1s.
- **Tailwind CSS** via CDN (JIT mode, observa o DOM)
- **Fonte**: Outfit (Google Fonts)
- **Motor de simulação**: Poisson para gols + atualização de ratings ATK/DEF + Elo (K configurável)

## Atualizando os dados

O simulador armazena os resultados reais hardcoded no `app.jsx` em arrays `SA_RES`, `SB_RES`, `SC_RES`, `SD_RES`. Workflow:

1. Edita `app.jsx` (adiciona novos jogos; incrementa o número da versão no header)
2. Atualiza `VERSION` em `service-worker.js` (ex: `v4.15.1` → `v4.16.0`)
3. Roda `./build.sh` (gera `app.transpiled.js` e `brasileirao-2026.html` atualizados)
4. `git add . && git commit && git push`

Cada usuário pega a nova versão automaticamente no próximo open quando online.

### Pré-requisitos do build

```bash
npm install --no-save @babel/core @babel/preset-react @babel/preset-env
```

(Apenas se for regerar os ícones a partir dos SVGs também: `pip install cairosvg pillow`)

## Licença

Uso pessoal/educacional.
