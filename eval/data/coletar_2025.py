# -*- coding: utf-8 -*-
"""Coleta as classificacoes FINAIS de 2025 (Series A/B/C/D) para eval/data/final_2025.json.

Por que este arquivo existe: o RNC_2026 do repo da a forca acumulada de 5 anos, mas nao
permite isolar 2025 — RNC2026 = 5*P25+4*P24+3*P23+2*P22+1*P21 e s5 = soma simples sao duas
equacoes para cinco incognitas. E a medicao mostrou que o RNC e um proxy ruim justamente
nas divisoes de baixo, onde ele e dominado por clubes que cairam da A/B e carregam pontuacao
antiga sem futebol atual. A classificacao do ano anterior e o sinal recente que falta.

Fonte: wikitext da Wikipedia pt. Tres formatos convivem, todos aparecem em 2025:
  1. {{#invoke:Sports table}} transcluido de uma Predefinicao  (Series A e B)
  2. {{#invoke:Sports table}} inline na secao "Classificacao geral"  (Serie C)
  3. wikitable manual na secao "Classificacao geral"  (Serie D)

Rodar:  python eval/data/coletar_2025.py
Saida:  eval/data/final_2025.json  +  cache do wikitext em eval/data/wiki/
"""
import io, json, os, re, sys, urllib.request, urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__))
WIKI = os.path.join(AQUI, 'wiki')
API = 'https://pt.wikipedia.org/w/api.php'
UA = 'brasileirao-eval/1.0 (avaliacao retroativa; hrqnoronha@gmail.com)'

ARTIGOS = {s: f'Campeonato Brasileiro de Futebol de 2025 - Série {s}' for s in 'ABCD'}
TEMPLATES = {
    'A': 'Predefinição:Tabela do Campeonato Brasileiro da Série A - 2025',
    'B': 'Predefinição:Tabela do Campeonato Brasileiro da Série B - 2025',
}


def buscar(titulo, cache):
    caminho = os.path.join(WIKI, cache)
    if os.path.exists(caminho):
        return io.open(caminho, encoding='utf-8').read()
    q = urllib.parse.urlencode({'action': 'query', 'prop': 'revisions', 'rvprop': 'content',
                                'rvslots': 'main', 'format': 'json', 'titles': titulo})
    req = urllib.request.Request(API + '?' + q, headers={'User-Agent': UA})
    d = json.load(urllib.request.urlopen(req, timeout=30))
    for pid, p in d['query']['pages'].items():
        if pid == '-1':
            return None
        txt = p['revisions'][0]['slots']['main']['*']
        os.makedirs(WIKI, exist_ok=True)
        io.open(caminho, 'w', encoding='utf-8').write(txt)
        return txt
    return None


def limpar(raw):
    """'{{Futebol Atlético-MG|estado=antes}}' -> 'Atlético-MG'"""
    raw = raw.replace("'''", '').strip()
    m = re.search(r'\{\{\s*Futebol\s+([^|}]+)', raw)
    if m:
        return m.group(1).strip()
    m = re.search(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', raw)
    if m:
        return m.group(1).strip()
    return re.sub(r'\{\{[^}]*\}\}', '', raw).strip()


def por_sports_table(txt):
    """Formato 1 e 2: ordem em teamN, e W/D/L/GF/GA por codigo."""
    ordem = re.findall(r'\|\s*team(\d{1,2})\s*=\s*([A-Za-z0-9_]+)', txt)
    if len(ordem) < 8:
        return None
    ordem = sorted(((int(i), c) for i, c in ordem), key=lambda x: x[0])
    nomes = dict(re.findall(r'\|\s*name_([A-Za-z0-9_]+)\s*=\s*(.+)', txt))
    campo = lambda pre, cod: re.search(r'\|\s*%s_%s\s*=\s*(\d+)' % (pre, re.escape(cod)), txt)
    linhas = []
    for pos, cod in ordem:
        v = campo('win', cod); e = campo('draw', cod); d = campo('loss', cod)
        gp = campo('gf', cod); gc = campo('ga', cod)
        if not (v and e and d):
            return None
        V, E, D = int(v.group(1)), int(e.group(1)), int(d.group(1))
        linhas.append({
            'pos': pos, 'nome': limpar(nomes.get(cod, cod)),
            'V': V, 'E': E, 'D': D, 'J': V + E + D, 'P': 3 * V + E,
            'GP': int(gp.group(1)) if gp else None,
            'GC': int(gc.group(1)) if gc else None,
        })
    return linhas


def secao(txt, titulo):
    linhas = txt.split('\n')
    i = next((k for k, l in enumerate(linhas)
              if l.strip().startswith('==') and titulo in l), -1)
    if i < 0:
        return None
    j = next((k for k in range(i + 1, len(linhas))
              if linhas[k].strip().startswith('==') and not linhas[k].strip().startswith('===')),
             len(linhas))
    return '\n'.join(linhas[i:j])


def por_wikitable(txt):
    """Formato 3 (Serie D): uma linha de wikitable por clube, celulas separadas por '||'.

        |bgcolor=#ACE1AF|1||align="left"|'''{{Futebol Barra-SC|estado=antes}}'''||'''50'''||24||15||5||4||34||14||+20

    Split por '||' e seguro mesmo com os pipes SIMPLES de dentro dos templates
    ({{Futebol X|estado=antes}}) e dos atributos de celula (bgcolor=...|1). Em cada celula,
    o valor util e o que vem depois do ultimo pipe simples.

    Linhas de secao ("Campeao", "Eliminados nas semifinais") tem colspan e nenhum numero na
    primeira celula, entao caem fora sozinhas.
    """
    def valor(cel):
        return cel.split('|')[-1].replace("'''", '').strip()

    def inteiro(cel):
        m = re.search(r'-?\d+', valor(cel))
        return int(m.group()) if m else None

    out = []
    for l in txt.split('\n'):
        s = l.rstrip()
        if not s.startswith('|') or 'colspan' in s:
            continue
        cels = s.split('||')
        if len(cels) < 3:
            continue
        pos = inteiro(cels[0])
        nome = limpar(cels[1])
        if pos is None or not nome:
            continue
        reg = {'pos': pos, 'nome': nome}
        # Pts J V E D GP GC — a Serie D nem sempre traz todas; o que faltar fica None.
        for i, k in enumerate(['P', 'J', 'V', 'E', 'D', 'GP', 'GC'], start=2):
            reg[k] = inteiro(cels[i]) if i < len(cels) else None
        out.append(reg)
    return out or None


def valida(linhas):
    if not linhas:
        return False
    pos = [l['pos'] for l in linhas]
    return len(set(pos)) == len(pos) and min(pos) == 1 and max(pos) == len(pos)


def main():
    saida, falhas = {}, []
    for s in 'ABCD':
        linhas = None
        if s in TEMPLATES:
            t = buscar(TEMPLATES[s], f'tpl_2025{s}.wiki')
            if t:
                linhas = por_sports_table(t)
        if not valida(linhas):
            art = buscar(ARTIGOS[s], f'br_2025_{s}.wiki')
            if art:
                sec = secao(art, 'lassificação geral') or secao(art, 'lassificação')
                for fn in (por_sports_table, por_wikitable):
                    for fonte in (sec, art):
                        if not fonte:
                            continue
                        cand = fn(fonte)
                        if valida(cand):
                            linhas = cand
                            break
                    if valida(linhas):
                        break
        if not valida(linhas):
            print(f'Serie {s}: FALHOU')
            falhas.append(s)
            continue
        print(f'Serie {s}: {len(linhas)} clubes, 1..{len(linhas)}'
              f'{"  (com pontos)" if linhas[0].get("P") is not None else "  (so posicao)"}')
        saida[s] = linhas

    dst = os.path.join(AQUI, 'final_2025.json')
    io.open(dst, 'w', encoding='utf-8').write(
        json.dumps({'temporada': 2025, 'fonte': 'Wikipedia pt (wikitext)', 'series': saida},
                   ensure_ascii=False, indent=1))
    print(f'-> {dst}' + (f'  ({len(falhas)} falhas: {falhas})' if falhas else ''))
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.exit(main())
