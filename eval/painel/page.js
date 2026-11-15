// Painel de calibração: desenha o que os dados decidem. Texto fixo mora no index.html.
const NF0 = new Intl.NumberFormat('pt-BR');
const NF1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const NF4 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pct = (v) => (v == null ? '—' : NF1.format(v) + '%');
const pp = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + NF1.format(Math.abs(v)));

function selecao() {
  const p = dash.params() || {};
  const serie = p.serie || 'Todas';
  const chave = String(p.zona || 'liga|Todas');
  const i = chave.indexOf('|');
  return { serie, fase: chave.slice(0, i), zona: chave.slice(i + 1), chave, bloco: p.rodadas || 'todas' };
}
function linhas(id) {
  const d = dash.data(id);
  return d.status === 'ok' && Array.isArray(d.data) ? d.data : null;
}
function faixasDe(s, bloco) {
  const rows = linhas('calibracao');
  if (!rows) return null;
  return rows.filter((r) => r.serie === s.serie && r.fase_id === s.fase && r.zona === s.zona && r.bloco_id === bloco).sort((a, b) => a.ordem - b.ordem);
}
function faixasDaSelecao() {
  const s = selecao();
  return faixasDe(s, s.bloco);
}
// os conjuntos de rodadas que existem para uma série, fase e zona
function recortesDe(s) {
  const rows = linhas('recortes');
  if (!rows) return null;
  return rows.filter((r) => r.serie === s.serie && r.fase_id === s.fase && r.zona === s.zona).sort((a, b) => a.bloco_ordem - b.bloco_ordem);
}
// ao trocar de zona, mantém o conjunto de rodadas se ele existir no novo recorte
function blocoValido(serie, chave, bloco) {
  const i = chave.indexOf('|');
  const rs = recortesDe({ serie, fase: chave.slice(0, i), zona: chave.slice(i + 1) });
  return rs && rs.some((r) => r.bloco_id === bloco) ? bloco : 'todas';
}
function celula(texto, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = texto;
  return td;
}
function linhaDe(id, celulas) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-key', id);
  tr.append(...celulas);
  return tr;
}

// Série: as opções estão no HTML; o script só ouve e mantém o valor.
document.querySelectorAll('.cal-page select[data-cal="serie"]').forEach((sel) => {
  sel.addEventListener('change', () => dash.setParams({ serie: sel.value, zona: 'liga|Todas', rodadas: blocoValido(sel.value, 'liga|Todas', selecao().bloco) }));
});

dash.onData(() => {
  const s = selecao();
  document.querySelectorAll('.cal-page').forEach((e) => e.style.setProperty('--cal-serie', dash.colors[0]));
  document.querySelectorAll('.cal-page select[data-cal="serie"]').forEach((sel) => {
    if (document.activeElement !== sel) sel.value = s.serie;
  });
  const fs = faixasDaSelecao();
  const semMeio = !!fs && !fs.some((r) => r.ordem === 5);
  document.querySelectorAll('.cal-page [data-cal="lead-com"]').forEach((e) => { e.hidden = semMeio; });
  document.querySelectorAll('.cal-page [data-cal="lead-sem"]').forEach((e) => { e.hidden = !semMeio; });
});

// Zona: as escolhas dependem da série e dos dados.
dash.draw('zona', (sel) => {
  const rows = linhas('calibracao') || [];
  const s = selecao();
  const vistos = new Map();
  rows.filter((r) => r.serie === s.serie).forEach((r) => {
    const k = r.fase_id + '|' + r.zona;
    if (!vistos.has(k)) vistos.set(k, r);
  });
  const grupos = new Map();
  [...vistos.entries()].sort((a, b) => a[1].zona_ordem - b[1].zona_ordem).forEach(([k, r]) => {
    if (!grupos.has(r.fase)) grupos.set(r.fase, []);
    grupos.get(r.fase).push([k, r.zona !== 'Todas' ? r.zona : r.fase_id === 'liga' ? 'Fase de liga: todas as zonas' : 'Fases finais: todos os eventos']);
  });
  const nos = [];
  grupos.forEach((ops, fase) => {
    const g = document.createElement('optgroup');
    g.label = fase;
    ops.forEach(([k, t]) => g.appendChild(new Option(t, k)));
    nos.push(g);
  });
  sel.replaceChildren(...nos);
  sel.value = s.chave;
  sel.onchange = () => dash.setParams({ zona: sel.value, rodadas: blocoValido(s.serie, sel.value, s.bloco) });
});

// Rodadas: os conjuntos que existem para a série, a fase e a zona escolhidas.
dash.draw('rodadas', (sel) => {
  const s = selecao();
  const rs = recortesDe(s) || [];
  sel.replaceChildren(...rs.map((r) => new Option(r.bloco, r.bloco_id)));
  sel.value = s.bloco;
  sel.onchange = () => dash.setParams({ rodadas: sel.value });
});

// Frase do topo: a faixa de 40–60% da seleção.
function meio() {
  const fs = faixasDaSelecao();
  return fs ? fs.find((r) => r.ordem === 5) || null : null;
}
function numeroDoMeio(campo, formato) {
  return (el) => {
    const r = meio();
    if (!r) { el.removeAttribute('data-where'); el.textContent = '—'; return; }
    el.setAttribute('data-where', 'id=' + r.id);
    el.textContent = formato(r[campo]);
  };
}
dash.draw('lead-obs', numeroDoMeio('aconteceu_pct', pct));
dash.draw('lead-prev', numeroDoMeio('previsto_pct', pct));
dash.draw('lead-n', numeroDoMeio('previsoes', (v) => NF0.format(v)));

// A curva de calibração.
dash.draw('curva', (el) => {
  const fs = faixasDaSelecao();
  if (!fs) { el.replaceChildren(document.createTextNode(dash.data('calibracao').status === 'error' ? 'Não carregou' : '—')); return; }
  el.replaceChildren();
  if (!fs.length) {
    const p = document.createElement('p');
    p.className = 'cal-vazio';
    p.textContent = 'Sem previsões nesta seleção.';
    el.appendChild(p);
    return;
  }
  const s = selecao();
  const W = Math.max(260, el.clientWidth || 600);
  const alto = Math.round(Math.max(260, Math.min(440, W * 0.62)));
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${alto + 64}`).attr('role', 'img')
    .attr('aria-label', `Curva de calibração: probabilidade anunciada contra frequência ocorrida, ${s.serie === 'Todas' ? 'todas as séries' : 'Série ' + s.serie}, ${s.zona === 'Todas' ? 'todas as zonas' : s.zona}${s.bloco === 'todas' ? '' : ', conjunto de rodadas escolhido'}. Os valores estão na tabela abaixo.`);
  // margens medidas do rótulo mais largo
  const sonda = svg.append('text').attr('class', 'cal-tick').text('100%');
  const larguraTick = sonda.node().getComputedTextLength() || 34;
  sonda.remove();
  const m = { top: 26, right: 16, bottom: 38, left: Math.ceil(larguraTick) + 10 };
  const x = d3.scaleLinear([0, 100], [m.left, W - m.right]);
  const y = d3.scaleLinear([0, 100], [m.top + alto, m.top]);
  const ticks = W < 420 ? [0, 25, 50, 75, 100] : [0, 20, 40, 60, 80, 100];

  const g = svg.append('g');
  g.selectAll('line.h').data(ticks).join('line').attr('class', 'cal-grid').attr('x1', m.left).attr('x2', W - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
  g.selectAll('line.v').data(ticks).join('line').attr('class', 'cal-grid').attr('y1', m.top).attr('y2', m.top + alto).attr('x1', (d) => x(d)).attr('x2', (d) => x(d));
  g.selectAll('text.ty').data(ticks).join('text').attr('class', 'cal-tick').attr('x', m.left - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d + '%');
  g.selectAll('text.tx').data(ticks).join('text').attr('class', 'cal-tick').attr('x', (d) => x(d)).attr('y', m.top + alto + 18).attr('text-anchor', 'middle').text((d) => d + '%');
  svg.append('text').attr('class', 'cal-tick').attr('x', m.left).attr('y', 12).text('Aconteceu');
  svg.append('text').attr('class', 'cal-tick').attr('x', W - m.right).attr('y', m.top + alto + 36).attr('text-anchor', 'end').text('Probabilidade anunciada');

  svg.append('line').attr('class', 'cal-diag').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(100)).attr('y2', y(100));

  const lim = (v) => Math.max(0, Math.min(100, v));
  const raio = d3.scaleSqrt([0, d3.max(fs, (r) => r.previsoes)], [4, W < 420 ? 8 : 10]);
  svg.append('g').selectAll('line').data(fs).join('line').attr('class', 'cal-margem')
    .attr('x1', (r) => x(r.previsto_pct)).attr('x2', (r) => x(r.previsto_pct))
    .attr('y1', (r) => y(lim(r.previsto_pct + r.margem_lo_pp))).attr('y2', (r) => y(lim(r.previsto_pct + r.margem_hi_pp)));
  svg.append('path').attr('class', 'cal-linha').attr('d', d3.line().x((r) => x(r.previsto_pct)).y((r) => y(r.aconteceu_pct))(fs));
  const fora = (r) => r.veredito !== 'dentro da margem';
  svg.append('g').selectAll('circle').data(fs).join('circle').attr('class', (r) => 'cal-ponto' + (fora(r) ? ' cal-fora' : ''))
    .attr('cx', (r) => x(r.previsto_pct)).attr('cy', (r) => y(r.aconteceu_pct)).attr('r', (r) => raio(r.previsoes));

  // rótulos diretos, poucos: a faixa de 40–60% e as que saem da margem
  const rotulos = fs.filter((r) => r.ordem === 5 || fora(r));
  const camada = svg.append('g');
  rotulos.forEach((r) => {
    const px = x(r.previsto_pct), py = y(r.aconteceu_pct), acima = r.aconteceu_pct >= r.previsto_pct;
    const t = camada.append('text').attr('class', 'cal-rot').text(pct(r.aconteceu_pct) + (fora(r) ? ' · fora da margem' : ''));
    const w = t.node().getComputedTextLength() || 60;
    let tx = px - w / 2;
    tx = Math.max(m.left + 2, Math.min(W - m.right - w, tx));
    t.attr('x', tx).attr('y', acima ? py - raio(r.previsoes) - 7 : py + raio(r.previsoes) + 15);
  });

  // alvos de toque e teclado, maiores que o ponto
  const tip = document.createElement('div');
  tip.className = 'cal-tip';
  tip.hidden = true;
  el.appendChild(tip);
  const mostra = (r, no) => {
    const linha = (tag, txt) => { const e = document.createElement(tag); e.textContent = txt; return e; };
    tip.replaceChildren(
      linha('strong', 'Aconteceu ' + pct(r.aconteceu_pct)),
      linha('span', 'Anunciado: ' + r.faixa + ', média de ' + pct(r.previsto_pct)),
      linha('span', NF0.format(r.previsoes) + ' previsões, ' + NF0.format(r.casos) + ' casos'),
      linha('span', 'Diferença ' + pp(r.diferenca_pp) + ' pp; margem de ' + pp(r.margem_lo_pp) + ' a ' + pp(r.margem_hi_pp)),
      linha('span', r.veredito.charAt(0).toUpperCase() + r.veredito.slice(1)),
    );
    tip.hidden = false;
    const escala = (el.clientWidth || W) / W;
    const px = x(r.previsto_pct) * escala, py = y(r.aconteceu_pct) * escala;
    const tw = tip.offsetWidth, th = tip.offsetHeight, largura = el.clientWidth || W;
    let left = px + 14;
    if (left + tw > largura) left = px - tw - 14;
    left = Math.max(0, Math.min(largura - tw, left));
    let top = py - th / 2;
    top = Math.max(0, Math.min(el.clientHeight - th, top));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    svg.selectAll('.cal-halo').classed('cal-on', false);
    d3.select(no.nextSibling).classed('cal-on', true);
  };
  const some = () => { tip.hidden = true; svg.selectAll('.cal-halo').classed('cal-on', false); };
  const alvos = svg.append('g');
  fs.forEach((r) => {
    const cx = x(r.previsto_pct), cy = y(r.aconteceu_pct);
    const a = alvos.append('circle').attr('class', 'cal-alvo').attr('cx', cx).attr('cy', cy).attr('r', Math.max(14, raio(r.previsoes) + 6))
      .attr('tabindex', 0).attr('role', 'img')
      .attr('aria-label', `Faixa ${r.faixa}: previsto ${pct(r.previsto_pct)}, aconteceu ${pct(r.aconteceu_pct)}, ${NF0.format(r.previsoes)} previsões, ${r.veredito}`);
    alvos.append('circle').attr('class', 'cal-halo').attr('cx', cx).attr('cy', cy).attr('r', raio(r.previsoes) + 4);
    const no = a.node();
    no.addEventListener('pointerenter', () => mostra(r, no));
    no.addEventListener('pointerdown', () => mostra(r, no));
    no.addEventListener('focus', () => mostra(r, no));
    no.addEventListener('pointerleave', some);
    no.addEventListener('blur', some);
  });
});

// Os quadros por conjunto de rodadas: uma curva pequena por quarto (e pelas fases finais).
dash.draw('blocos', (el) => {
  const s = selecao();
  const rs = recortesDe(s);
  if (!rs || !linhas('calibracao')) { el.replaceChildren(document.createTextNode('—')); return; }
  const quadros = rs.filter((r) => /^q\d$/.test(r.bloco_id) || r.bloco_id === 'finais');
  el.replaceChildren();
  if (!quadros.length) { el.appendChild(document.createTextNode('Sem previsões nesta seleção.')); return; }
  const span = (classe, texto) => { const e = document.createElement('span'); e.className = classe; e.textContent = texto; return e; };
  const marca = (r, campo, texto) => { const e = document.createElement('span'); e.setAttribute('data-source', 'recortes'); e.setAttribute('data-field', campo); e.setAttribute('data-where', 'id=' + r.id); e.textContent = texto; return e; };
  const botoes = quadros.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-mini';
    b.setAttribute('aria-pressed', String(s.bloco === r.bloco_id));
    const n = span('cal-mini-n', '');
    n.append(marca(r, 'previsoes', NF0.format(r.previsoes)), document.createTextNode(' previsões · erro médio '), marca(r, 'erro_medio_pp', NF1.format(r.erro_medio_pp)), document.createTextNode(' pp'));
    const caixa = document.createElement('div');
    b.append(span('cal-mini-t', r.bloco_curto), span('cal-mini-s', r.bloco_rodadas || ' '), caixa, n);
    b.addEventListener('click', () => dash.setParams({ rodadas: s.bloco === r.bloco_id ? 'todas' : r.bloco_id }));
    el.appendChild(b);
    return [r, caixa];
  });
  botoes.forEach(([r, caixa]) => {
    const fs = faixasDe(s, r.bloco_id) || [];
    const W = Math.max(140, caixa.clientWidth || 180), lado = Math.round(Math.min(W * 0.72, 190));
    const m = { top: 6, right: 6, bottom: 16, left: 30 };
    const svg = d3.select(caixa).append('svg').attr('viewBox', `0 0 ${W} ${lado + m.top + m.bottom}`).attr('role', 'img')
      .attr('aria-label', `Curva de calibração, ${r.bloco}: ${NF0.format(r.previsoes)} previsões, erro médio de ${NF1.format(r.erro_medio_pp)} pontos.`);
    const x = d3.scaleLinear([0, 100], [m.left, W - m.right]), y = d3.scaleLinear([0, 100], [m.top + lado, m.top]);
    svg.selectAll('line.h').data([0, 50, 100]).join('line').attr('class', 'cal-grid').attr('x1', m.left).attr('x2', W - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.selectAll('text.ty').data([0, 50, 100]).join('text').attr('class', 'cal-tick').attr('x', m.left - 5).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d + '%');
    svg.selectAll('text.tx').data([50, 100]).join('text').attr('class', 'cal-tick').attr('x', (d) => x(d)).attr('y', m.top + lado + 12).attr('text-anchor', (d) => (d === 100 ? 'end' : 'middle')).text((d) => d + '%');
    svg.append('line').attr('class', 'cal-diag').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(100)).attr('y2', y(100));
    const lim = (v) => Math.max(0, Math.min(100, v));
    svg.append('g').selectAll('line').data(fs).join('line').attr('class', 'cal-margem')
      .attr('x1', (f) => x(f.previsto_pct)).attr('x2', (f) => x(f.previsto_pct))
      .attr('y1', (f) => y(lim(f.previsto_pct + f.margem_lo_pp))).attr('y2', (f) => y(lim(f.previsto_pct + f.margem_hi_pp)));
    svg.append('path').attr('class', 'cal-linha').attr('d', d3.line().x((f) => x(f.previsto_pct)).y((f) => y(f.aconteceu_pct))(fs));
    svg.append('g').selectAll('circle').data(fs).join('circle').attr('class', (f) => 'cal-ponto' + (f.veredito === 'dentro da margem' ? '' : ' cal-fora'))
      .attr('cx', (f) => x(f.previsto_pct)).attr('cy', (f) => y(f.aconteceu_pct)).attr('r', 3.5);
  });
});

dash.draw('faixas', (tb) => {
  const fs = faixasDaSelecao() || [];
  tb.replaceChildren(...fs.map((r) => linhaDe(r.id, [
    celula(r.faixa), celula(NF0.format(r.previsoes), 'cal-num'), celula(NF0.format(r.casos), 'cal-num'),
    celula(pct(r.previsto_pct), 'cal-num'), celula(pct(r.aconteceu_pct), 'cal-num'), celula(pp(r.diferenca_pp), 'cal-num'),
    celula(pp(r.margem_lo_pp), 'cal-num'), celula(pp(r.margem_hi_pp), 'cal-num'),
    celula(r.veredito, r.veredito === 'dentro da margem' ? '' : 'cal-alerta'),
  ])));
});

dash.draw('precisao', (tb) => {
  const rows = linhas('precisao') || [];
  const s = selecao();
  const vis = rows.filter((r) => (s.serie === 'Todas' || r.serie === s.serie) && r.bloco_id === s.bloco);
  tb.replaceChildren(...vis.map((r) => linhaDe(r.id, [
    celula(r.serie_nome), celula(r.fase), celula(r.zona), celula(r.bloco_curto), celula(NF0.format(r.vagas), 'cal-num'),
    celula(pct(r.habilidade_pct), 'cal-num' + (r.habilidade_pct < 0 ? ' cal-alerta' : '')),
    celula(NF3.format(r.brier), 'cal-num'), celula(NF3.format(r.brier_referencia), 'cal-num'),
    celula(pct(r.acerto_modelo_pct), 'cal-num'), celula(pct(r.acerto_tabela_pct), 'cal-num'),
  ])));
});

dash.draw('raros', (tb) => {
  const rows = linhas('raros') || [];
  const s = selecao();
  const vis = rows.filter((r) => s.serie === 'Todas' || r.serie === s.serie).slice(0, 15);
  const chance = (r) => (r.desfecho === 'aconteceu' && r.probabilidade_pct < r.piso_pct ? 'menos de ' + NF2.format(r.piso_pct) + '%'
    : r.desfecho !== 'aconteceu' && 100 - r.probabilidade_pct < r.piso_pct ? 'mais de ' + NF2.format(100 - r.piso_pct) + '%'
      : (r.probabilidade_pct < 1 || r.probabilidade_pct > 99 ? NF2 : NF1).format(r.probabilidade_pct) + '%');
  tb.replaceChildren(...vis.map((r) => linhaDe(r.id, [
    celula(r.serie_nome), celula(r.clube), celula(r.evento), celula(r.quando), celula(chance(r), 'cal-num'), celula(r.desfecho),
  ])));
});

dash.draw('variantes', (tb) => {
  const rows = linhas('variantes') || [];
  tb.replaceChildren(...rows.map((r) => linhaDe(r.id, [
    celula(r.base), celula(r.drift === 15 ? '15 (app)' : String(r.drift), 'cal-num'), celula(NF0.format(r.previsoes), 'cal-num'),
    celula(NF4.format(r.brier), 'cal-num'), celula(NF2.format(r.erro_medio_pp), 'cal-num'),
    celula(pct(r.f7080_aconteceu_pct), 'cal-num' + (r.f7080_veredito === 'fora' ? ' cal-alerta' : '')),
    celula(pct(r.f8090_aconteceu_pct), 'cal-num' + (r.f8090_veredito === 'fora' ? ' cal-alerta' : '')),
    celula(r.certeza_aconteceu_pct == null ? '—' : NF2.format(r.certeza_aconteceu_pct) + '%', 'cal-num'),
  ])));
});
