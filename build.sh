#!/usr/bin/env bash
# build.sh — regera o JS transpilado e o HTML standalone após editar app.jsx
#
# Requisitos (instala 1x na primeira execução):
#   npm install --no-save @babel/core @babel/preset-react @babel/preset-env
#   pip install cairosvg pillow   # apenas se for regerar ícones a partir do SVG

set -e
cd "$(dirname "$0")"

echo "==> Transpilando app.jsx -> app.transpiled.js"
node -e "
const babel = require('@babel/core');
const fs = require('fs');
const src = fs.readFileSync('app.jsx', 'utf8');
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

echo "==> Gerando brasileirao-2026.html (standalone)"
python3 << 'PY'
import base64, os
js = open('app.transpiled.js').read()
html = open('index.html').read()
old = '<script src="app.transpiled.js"></script>'
new = '<script>\n' + js + '\n</script>'
assert old in html, 'tag <script src="app.transpiled.js"> não encontrada em index.html'
out = html.replace(old, new)
out = out.replace("if ('serviceWorker' in navigator) {", "if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {")
out = out.replace('<link rel="manifest" href="manifest.json">', '<!-- manifest removido na versão standalone -->')
def datauri(path):
    return 'data:image/png;base64,' + base64.b64encode(open(path,'rb').read()).decode()
out = out.replace('<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">',
                  '<link rel="icon" type="image/png" sizes="32x32" href="'+datauri('icons/favicon-32.png')+'">')
out = out.replace('<link rel="icon" type="image/png" sizes="16x16" href="icons/favicon-16.png">',
                  '<link rel="icon" type="image/png" sizes="16x16" href="'+datauri('icons/favicon-16.png')+'">')
out = out.replace('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
                  '<link rel="apple-touch-icon" href="'+datauri('icons/apple-touch-icon.png')+'">')
out = out.replace('<title>Brasileirão 2026 — Simulador</title>', '<title>Brasileirão 2026 — Simulador (Standalone)</title>')
open('brasileirao-2026.html', 'w').write(out)
print('  brasileirao-2026.html:', os.path.getsize('brasileirao-2026.html'), 'bytes')
PY

echo "==> Pronto."
echo ""
echo "Lembrete: atualize VERSION em service-worker.js após adicionar dados"
echo "          (ex: v4.15.1 -> v4.16.0) para forçar refresh do cache."
