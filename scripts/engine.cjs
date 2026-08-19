// Extrai a ENGINE PURA (simulação + dados) do index.html, que é a fonte da verdade do
// app desde a v4.48. Antes deste módulo os harnesses liam simulador_unificado.jsx, que
// está congelado na v4.47 — ou seja, validavam código morto.
//
// O HTML é JS já transpilado (React.createElement, não JSX), então o trecho é JavaScript
// válido e pode ser avaliado direto: não é preciso excisar Badge/TN como era no .jsx.
//
// O corte vai do topo do changelog até o bootstrap do ReactDOM. Precisa ir ATÉ LÁ, e não
// parar no primeiro símbolo de UI: SD_C_CODES / SD_D_CODES / SD_BRK_PAIRS são declarados
// depois dos componentes (L15299+) mas usados pela engine (simMC_D_single), que só roda
// depois de o script inteiro ter sido avaliado. Cortar antes deles dá ReferenceError.
//
// Os limites são marcadores TEXTUAIS, nunca números de linha: o index.html cresce a cada
// versão e um `slice(0, 1146)` apodrece em silêncio.
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');
const START = '// SIMULADOR UNIFICADO BRASILEIR'; // 1ª linha do changelog = topo da engine
const END = 'ReactDOM.createRoot';                // bootstrap = fim do código avaliável

// localStorage não existe em node; a engine só o toca dentro de try/catch, mas o shim
// evita depender desse detalhe.
const SHIM = 'var localStorage={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};\n';

function extractEngine() {
  const html = fs.readFileSync(HTML, 'utf8');
  const i = html.indexOf(START);
  if (i < 0) throw new Error('engine.cjs: marcador de inicio nao encontrado: ' + START);
  const j = html.indexOf(END, i);
  if (j < 0) throw new Error('engine.cjs: marcador de fim nao encontrado: ' + END);
  return html.slice(i, j);
}

// Avalia a engine e devolve os símbolos pedidos.
function loadEngine(exportNames) {
  const ret = '\n;return {' + exportNames.join(',') + '};';
  return new Function(SHIM + extractEngine() + ret)();
}

// Avalia a engine seguida de um harness, no mesmo escopo (o harness enxerga todos os
// símbolos da engine). É o formato que os harnesses históricos já usavam.
function runWithEngine(harnessSrc) {
  return new Function(SHIM + extractEngine() + '\n' + harnessSrc)();
}

module.exports = { extractEngine, loadEngine, runWithEngine, HTML, SHIM };
