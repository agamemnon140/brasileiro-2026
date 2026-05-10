# Brasileirão 2026 — Simulador

PWA (Progressive Web App) do simulador Monte Carlo do Campeonato Brasileiro 2026. Cobre Séries A, B, C, D e Copa do Brasil. Motor Poisson + ELO + ATK/DEF com drift estocástico opcional.

## Como funciona o build

O **único arquivo fonte** é `simulador_unificado.jsx` (com `import React, ... from 'react'` e `export default`). Funciona em qualquer bundler React (Vite, Webpack, Create React App, artifact do Claude, etc.).

O script `./build.sh` lê esse arquivo e gera 3 artefatos:

```
simulador_unificado.jsx  (fonte — você edita só esse)
     |
     | build.sh
     v
+---------------------+  +-------------+  +-------------------------+
| app.transpiled.js   |  | tailwind.css|  | brasileirao-2026.html   |
| (JS puro p/ browser)|  | (utilitários|  | (standalone com tudo    |
|                     |  | usados)     |  | inline — abre file://)  |
+---------------------+  +-------------+  +-------------------------+
```

**Versão PWA** (`index.html` + `app.transpiled.js` + `tailwind.css` + ícones + service worker + manifest) → o que vai pro GitHub Pages e instala no iPhone.

**Versão standalone** (`brasileirao-2026.html`, ~600 KB único arquivo com React, ReactDOM, Tailwind, app, ícones — tudo inline) → abre direto em `file://` sem servidor.

## Pré-requisitos (1x)

```bash
cd brasileirao-2026
npm install --no-save @babel/core @babel/preset-react @babel/preset-env \
                       tailwindcss@3 react@18 react-dom@18
```

## Fluxo de edição

1. Edita `simulador_unificado.jsx` (adiciona resultados, ajusta motor, etc.)
2. Atualiza `VERSION` em `service-worker.js` (ex: `v4.15.2` → `v4.16.0`) — invalida o cache antigo nos browsers dos usuários
3. Roda `./build.sh`
4. `git add . && git commit -m "atualização dd/mm" && git push`

GitHub Pages serve a versão nova automaticamente em 1-2 min após o push.

## O que carregar no git

**Tudo do repo, exceto `node_modules/`** (que está no `.gitignore`). Mais especificamente:

| Arquivo | Origem | Comitar? |
|---|---|---|
| `simulador_unificado.jsx` | fonte (você edita) | ✅ |
| `app.transpiled.js` | gerado por build.sh | ✅ (GitHub Pages precisa) |
| `tailwind.css` | gerado por build.sh | ✅ (GitHub Pages precisa) |
| `brasileirao-2026.html` | gerado por build.sh | ✅ (versão standalone) |
| `index.html` | mantido manualmente | ✅ |
| `service-worker.js` | mantido manualmente | ✅ |
| `manifest.json` | mantido manualmente | ✅ |
| `build.sh` | script de build | ✅ |
| `icons/*.png`, `icons/*.svg` | gerados 1x dos SVG masters | ✅ |
| `README.md`, `.gitignore` | — | ✅ |
| `node_modules/` | npm install local | ❌ (ignorado) |

Resumindo: depois de `npm install` + `./build.sh`, faça `git add .` e os arquivos certos vão automaticamente (o .gitignore cuida do que não deve ir).

## Deploy no GitHub Pages

```bash
cd brasileirao-2026
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:<seu-user>/brasileirao-2026.git
git push -u origin main
```

Depois em **GitHub → Settings → Pages**: source = `main`, folder = `/ (root)`. Aguarda 1-2 min. App fica em `https://<seu-user>.github.io/brasileirao-2026/`.

## Instalação no iPhone

1. Abra a URL no **Safari** (não funciona em Chrome no iOS pra "Adicionar à Tela de Início").
2. Toque no botão **Compartilhar** (quadrado com seta pra cima).
3. Role para baixo e toque em **"Adicionar à Tela de Início"**.
4. Confirme o nome ("Brasileirão 26") e toque em **Adicionar**.
5. O ícone aparece na tela inicial. Abre em modo standalone (sem barra do navegador).

## Instalação em Android

1. Abra no Chrome.
2. Menu (3 pontinhos) → **"Adicionar à tela inicial"** ou **"Instalar app"**.
3. Confirme.

## Estrutura do repositório

```
brasileirao-2026/
├── simulador_unificado.jsx  # FONTE — único arquivo que você edita
├── build.sh                 # Gera os arquivos abaixo
├── app.transpiled.js        # [gerado] JS puro pro browser
├── tailwind.css             # [gerado] CSS utilitário
├── brasileirao-2026.html    # [gerado] Standalone (tudo inline)
├── index.html               # Entry point da PWA
├── manifest.json            # Web App Manifest (PWA config)
├── service-worker.js        # Cache offline (network-first)
├── icons/
│   ├── logo.svg
│   ├── logo-square.svg
│   ├── logo-maskable.svg
│   ├── icon-{192,512}.png
│   ├── icon-maskable-{192,512}.png
│   ├── apple-touch-icon.png   # 180x180 iOS
│   └── favicon-{16,32}.png
├── README.md
└── .gitignore
```

## Funcionalidades do app

- **Tabelas e simulações** das 4 séries + Copa do Brasil
- **Probabilidades** de título, acesso/Libertadores, rebaixamento (Z4)
- **Aba Evolução**: como a probabilidade de cada time evoluiu rodada-a-rodada
- **Aba Ao Vivo**: simulação de partidas com placar parcial
- **Cruzamentos**: probabilidade de confrontos por fase
- **Preset α global** (Conservador / Base / Agressivo) controla sensibilidade do motor
- **Drift estocástico** opcional para refletir evolução do nível dos times ao longo do campeonato
- **Funciona offline** após primeira carga (service worker)

## Detalhes técnicos

- **React 18** via UMD inline (sem CDN — máxima compatibilidade)
- **JSX pré-transpilado**: `build.sh` roda `@babel/preset-env` + `preset-react` localmente. O browser nunca executa Babel — o app carrega em <1s.
- **Tailwind CSS** gerado com `tailwindcss` CLI escaneando o JSX → apenas as classes usadas (~25 KB)
- **Fonte**: stack `'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- **Motor de simulação**: Poisson para gols + atualização de ratings ATK/DEF + Elo (K configurável)

## Atualizando os dados

Os resultados reais estão hardcoded em `simulador_unificado.jsx` nos arrays `SA_RES`, `SB_RES`, `SC_RES`, `SD_RES`. Workflow padrão descrito acima.

## Licença

Uso pessoal/educacional.
