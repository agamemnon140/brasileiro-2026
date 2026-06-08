// build_html.js — gera brasileirao-2026.html standalone a partir do .jsx
const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'simulador_unificado.jsx');
const OUT = path.join(__dirname, 'brasileirao-2026.html');

let code = fs.readFileSync(SRC, 'utf8');

// 0) identidade visual / ícones (gerados por make_icon.py -> icon_b64.json, mesma pasta deste script)
let iconHead = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">`;
try {
  const ic = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon_b64.json'), 'utf8'));
  const apple = ic['apple-180.png'], fav = ic['favicon-32.png'], i192 = ic['icon-192.png'], i512 = ic['icon-512.png'];
  const manifest = {
    name: 'Simulador Unificado Brasileirão 2026', short_name: 'Brasileirão 26',
    start_url: '.', display: 'standalone', orientation: 'portrait',
    background_color: '#0f172a', theme_color: '#059669',
    icons: [
      { src: 'data:image/png;base64,' + i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'data:image/png;base64,' + i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  const manB64 = Buffer.from(JSON.stringify(manifest)).toString('base64');
  iconHead = [
    '<meta name="theme-color" content="#059669">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Brasileirão 26">',
    '<link rel="apple-touch-icon" href="data:image/png;base64,' + apple + '">',
    '<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,' + fav + '">',
    '<link rel="icon" type="image/png" sizes="192x192" href="data:image/png;base64,' + i192 + '">',
    '<link rel="manifest" href="data:application/manifest+json;base64,' + manB64 + '">',
  ].join('\n');
} catch (e) { console.log('aviso: icon_b64.json ausente — usando favicon emoji'); }

// 1) remover o import do React (será global via CDN) e o "export default"
code = code.replace(/^import React[^\n]*\n/, '');
code = code.replace(/export default function SimuladorUnificado/, 'function SimuladorUnificado');

// 2) disponibilizar os hooks como globais (vêm de React)
const hooksPrelude = 'const { useState, useMemo, useCallback, useEffect, useRef } = React;\n';

// 3) bootstrap de render
const bootstrap = '\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(SimuladorUnificado));\n';

// 4) transpilar JSX -> JS (runtime clássico, React global; mantém ES2020+ p/ navegadores modernos)
const transpiled = babel.transform(hooksPrelude + code + bootstrap, {
  presets: [['@babel/preset-react', { runtime: 'classic' }]],
  compact: false,
}).code;

// 5) ponto de injeção da API key (um GitHub Action pode trocar o placeholder pelo segredo).
//    Enquanto não for substituído, o valor começa com "__" e o app o ignora (cai p/ localStorage/manual).
const keyInjection = '<script>window.__ANTHROPIC_API_KEY__ = "__ANTHROPIC_API_KEY__";</script>';

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Simulador Unificado Brasileirão 2026</title>
${iconHead}
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
${keyInjection}
<style>body{background:#0f172a;margin:0;-webkit-font-smoothing:antialiased;}</style>
</head>
<body class="bg-slate-900 text-white">
<div id="root"></div>
<script>
${transpiled}
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('HTML gerado:', OUT, '(' + kb + ' KB)');
