#!/usr/bin/env bash
# build.sh — pipeline completo de build a partir de simulador_unificado.jsx
#
# Workflow: edita simulador_unificado.jsx -> ./build.sh -> commita tudo
#
# Requisitos (instala 1x na primeira vez):
#   npm install --no-save @babel/core @babel/preset-react @babel/preset-env \
#                          tailwindcss@3 react@18 react-dom@18

set -e
cd "$(dirname "$0")"

SRC=simulador_unificado.jsx

if [ ! -f "$SRC" ]; then
  echo "ERRO: arquivo fonte $SRC não encontrado." >&2
  exit 1
fi

echo "==> [1/3] Adaptando $SRC e transpilando -> app.transpiled.js"
node -e "
const babel = require('@babel/core');
const fs = require('fs');

// 1. Lê fonte
let src = fs.readFileSync('$SRC', 'utf8');

// 2. Adapta para ambiente UMD inline:
//    - Remove o import (React/hooks via global) e usa destructuring do React global.
//    - Remove o export default.
//    - Anexa o mount no fim.
const importLine = \"import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';\";
if (!src.includes(importLine)) {
  console.error('  [warn] linha de import esperada não encontrada — abortando.');
  process.exit(1);
}
src = src.replace(importLine, 'const { useState, useMemo, useCallback, useEffect, useRef } = React;');
src = src.replace('export default function SimuladorUnificado(){', 'function SimuladorUnificado(){');
src += '\n\n// === Mount (anexado pelo build) ===\n';
src += 'ReactDOM.createRoot(document.getElementById(\"root\")).render(React.createElement(SimuladorUnificado));\n';

// 3. Transpila pra JS clássico (compatível com iOS 12+, Safari 12+).
const result = babel.transformSync(src, {
  presets: [
    ['@babel/preset-env', { targets: '> 0.5%, last 2 versions, Firefox ESR, not dead, ios >= 12, safari >= 12', modules: false }],
    ['@babel/preset-react', { runtime: 'classic' }],
  ],
  compact: false, babelrc: false, configFile: false,
});

fs.writeFileSync('app.transpiled.js', result.code);
console.log('  app.transpiled.js:', result.code.length, 'chars');
"

echo "==> [2/3] Gerando tailwind.css (escaneando $SRC)"
cat > /tmp/tailwind.config.js <<EOF
module.exports = {
  content: ['$(pwd)/$SRC'],
  theme: { extend: {} },
  plugins: [],
}
EOF
cat > /tmp/tailwind-input.css <<EOF
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF
npx tailwindcss -c /tmp/tailwind.config.js -i /tmp/tailwind-input.css -o tailwind.css --minify 2>&1 | tail -1
echo "  tailwind.css: $(wc -c < tailwind.css) bytes"

echo "==> [3/3] Gerando brasileirao-2026.html (standalone 100% inline)"
python3 <<'PY'
import base64, os
app_js = open('app.transpiled.js').read()
tw_css = open('tailwind.css').read()
react_umd = open('node_modules/react/umd/react.production.min.js').read()
reactdom_umd = open('node_modules/react-dom/umd/react-dom.production.min.js').read()

def datauri(p): return 'data:image/png;base64,' + base64.b64encode(open(p,'rb').read()).decode()
fav32 = datauri('icons/favicon-32.png')
fav16 = datauri('icons/favicon-16.png')
apple = datauri('icons/apple-touch-icon.png')

html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#022c22">
<meta name="description" content="Simulador Monte Carlo do Brasileirão 2026 — Séries A, B, C, D e Copa do Brasil.">
<title>Brasileirão 2026 — Simulador (Standalone)</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Brasileirão 26">
<link rel="apple-touch-icon" href="{apple}">
<link rel="icon" type="image/png" sizes="32x32" href="{fav32}">
<link rel="icon" type="image/png" sizes="16x16" href="{fav16}">
<style>
{tw_css}
html,body,#root{{background:#020617;min-height:100vh;-webkit-tap-highlight-color:transparent;overscroll-behavior-y:none}}
body{{margin:0;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}}
.boot{{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#a7f3d0;background:radial-gradient(ellipse at center,#064e3b 0%,#022c22 70%,#020617 100%);z-index:9999;transition:opacity .4s ease}}
.boot.hide{{opacity:0;pointer-events:none}}
.boot__logo{{width:88px;height:88px;border-radius:22px;background:linear-gradient(135deg,#022c22 0%,#064e3b 55%,#022c22 100%);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;letter-spacing:-2px;color:#fff;box-shadow:0 8px 32px rgba(16,185,129,.25),0 0 0 1px rgba(16,185,129,.15);margin-bottom:18px}}
.boot__logo sub{{font-size:16px;font-weight:700;vertical-align:super;margin-left:2px;color:#a7f3d0}}
.boot__title{{font-size:18px;font-weight:600;margin-bottom:4px}}
.boot__subtitle{{font-size:12px;opacity:.7;margin-bottom:20px}}
.boot__bar{{width:200px;height:3px;background:rgba(16,185,129,.2);border-radius:99px;overflow:hidden}}
.boot__bar::after{{content:'';display:block;width:40%;height:100%;background:linear-gradient(90deg,transparent,#10b981,transparent);animation:slide 1.4s ease-in-out infinite}}
@keyframes slide{{0%{{transform:translateX(-100%)}}100%{{transform:translateX(350%)}}}}
</style>
</head>
<body>
<div class="boot" id="boot"><div class="boot__logo">B<sub>26</sub></div><div class="boot__title">Brasileirão 2026</div><div class="boot__subtitle">Carregando simulador…</div><div class="boot__bar"></div></div>
<div id="root"></div>
<script>{react_umd}</script>
<script>{reactdom_umd}</script>
<script>{app_js}</script>
<script>
var bootEl=document.getElementById('boot');var rootEl=document.getElementById('root');
var obs=new MutationObserver(function(){{if(rootEl.children.length>0){{bootEl.classList.add('hide');setTimeout(function(){{bootEl.remove();}},500);obs.disconnect();}}}});
obs.observe(rootEl,{{childList:true}});
</script>
</body>
</html>
"""
open('brasileirao-2026.html', 'w').write(html)
print(f'  brasileirao-2026.html: {os.path.getsize("brasileirao-2026.html"):,} bytes')
PY

echo ""
echo "==> Pronto."
echo "    Lembrete: atualize VERSION em service-worker.js após editar simulador_unificado.jsx"
echo "    para forçar o cache a renovar (ex: v4.15.2 -> v4.16.0)."
