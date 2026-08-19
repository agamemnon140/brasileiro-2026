# -*- coding: utf-8 -*-
"""Extrai (posicao, clube) da classificacao FINAL de cada Serie/ano, 2021-2025.
So a colocacao importa: a Convencao de Pontos do RNC pontua por colocacao geral.

Tres formatos convivem no wikitext e todos aparecem na janela de 5 anos:
  1. {{#invoke:Sports table}} com |teamN= em ordem de classificacao (A/B modernos, C inline)
  2. wikitable com pos e nome na MESMA linha  (Serie D)
  3. wikitable vertical: pos numa linha, nome na seguinte (Serie B 2021)
"""
import io,re,json,collections

POS_INLINE = re.compile(r'^\|\s*(?:[a-z]+\s*=\s*(?:"[^"]*"|[^|\s]*)\s*\|)?\s*(\d{1,3})\s*\|\|\s*(?:align\s*=\s*"?left"?|style\s*=\s*"[^"]*text-align:\s*left[^"]*")\s*\|\s*(.+?)\s*(?:\|\||$)', re.I)
POS_ALONE  = re.compile(r'^!?\s*\|?\s*(?:[a-z]+\s*=\s*(?:"[^"]*"|[^|\s]*)\s*)*\|\s*(\d{1,3})\s*$', re.I)
POS_BARE   = re.compile(r'^\|\s*(\d{1,3})\s*$')
NAME_CELL  = re.compile(r'^\|\s*(?:align\s*=\s*"?left"?|style\s*=\s*"[^"]*text-align:\s*left[^"]*")\s*\|\s*(.+?)\s*(?:\|\||$)', re.I)

def clean(raw):
    raw = raw.replace("'''", "").strip()
    m = re.search(r'\{\{\s*Futebol\s+([^|}]+)', raw)
    if m: return m.group(1).strip()
    m = re.search(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', raw)
    if m: return m.group(1).strip()
    return re.sub(r'\{\{[^}]*\}\}', '', raw).strip()

def by_sports_table(txt):
    order = re.findall(r'\|\s*team(\d{1,2})\s*=\s*([A-Za-z0-9_]+)', txt)
    names = dict(re.findall(r'\|\s*name_([A-Za-z0-9_]+)\s*=\s*(.+)', txt))
    if len(order) < 8: return None
    order = sorted(((int(i), c) for i, c in order), key=lambda x: x[0])
    return [(i, clean(names.get(c, c))) for i, c in order]

def by_rows(txt):
    out=[]; pend=None
    for l in txt.split('\n'):
        s=l.rstrip()
        m=POS_INLINE.match(s)
        if m: out.append((int(m.group(1)), clean(m.group(2)))); pend=None; continue
        m=POS_ALONE.match(s) or POS_BARE.match(s)
        if m: pend=int(m.group(1)); continue
        m=NAME_CELL.match(s)
        if m and pend is not None: out.append((pend, clean(m.group(1)))); pend=None; continue
    return out or None

def section(path, title):
    lines = io.open(path, encoding='utf-8').read().split('\n')
    i = next((k for k,l in enumerate(lines) if l.strip().startswith('==') and title in l), -1)
    if i < 0: return None
    j = next((k for k in range(i+1,len(lines)) if lines[k].strip().startswith('==') and not lines[k].strip().startswith('===')), len(lines))
    return '\n'.join(lines[i:j])

def sources(ano, s):
    """Fontes candidatas, em ordem de confianca."""
    out=[]
    # Para C e D a secao "Classificacao geral" do artigo e a fonte correta e tem de vir
    # PRIMEIRO: de 2022 em diante o template da Serie C e a tabela da 1a FASE, e usa-la
    # daria a ordem errada (em 2025 poria o Caxias em 1o, quando ele foi 5o na geral).
    sec = section(f'wiki/br_{ano}_{s}.wiki', 'lassificação geral')
    if s in 'AB':
        try: out.append(io.open(f'wiki/tpl_{ano}{s}.wiki', encoding='utf-8').read())
        except FileNotFoundError: pass
        if sec: out.append(sec)
    else:
        if sec: out.append(sec)
        try: out.append(io.open(f'wiki/tpl_{ano}{s}.wiki', encoding='utf-8').read())
        except FileNotFoundError: pass
    try: out.append(io.open(f'wiki/br_{ano}_{s}.wiki', encoding='utf-8').read())
    except FileNotFoundError: pass
    return out

if __name__ == '__main__':
    res={}; bad=[]
    for ano in range(2021,2026):
        for s in 'ABCD':
            key=f'{ano}{s}'; rows=None; via=''
            for txt in sources(ano,s):
                for fn,nm in ((by_sports_table,'sports_table'),(by_rows,'linhas')):
                    r=fn(txt)
                    if r:
                        poss=[p for p,_ in r]
                        if len(set(poss))==len(r) and min(poss)==1 and max(poss)==len(r):
                            rows,via=r,nm; break
                if rows: break
            if not rows:
                print(f'{key}: FALHOU'); bad.append(key); continue
            print(f'{key}: {len(rows):3d} clubes 1..{len(rows)}  via {via}')
            res[key]=[{'pos':p,'n':n} for p,n in rows]
    json.dump(res, io.open('liga_raw.json','w',encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'-> liga_raw.json  ({len(bad)} falhas: {bad})')
