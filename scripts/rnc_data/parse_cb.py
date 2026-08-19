# -*- coding: utf-8 -*-
"""Extrai a FASE ALCANCADA por clube na Copa do Brasil, 2021-2026.
Ancora nos ROTULOS de fase, nao no numero do colspan: o colspan varia (10/11/12) e em
2021-2022 o divisor da primeira fase vem como cabecalho (!colspan="12"), nao como celula."""
import io,re,json,collections

FASES=[('Campeão','ch'),('Vice-campeão','vice'),('Eliminados nas semifinais','sf'),
       ('Eliminados nas quartas','qf'),('Eliminados nas oitavas','oit'),
       ('Eliminados na quinta fase','f5'),('Eliminados na quarta fase','f4'),
       ('Eliminados na terceira fase','f3'),('Eliminados na segunda fase','f2'),
       ('Eliminados na primeira fase','f1')]
NAME=re.compile(r'^\|\s*align\s*=\s*"?left"?\s*\|\s*(.+?)\s*(?:\|\||$)',re.I)

def clean(raw):
    raw=raw.replace("'''","").strip()
    m=re.search(r'\{\{\s*Futebol\s+([^|}]+)',raw)
    if m: return m.group(1).strip()
    m=re.search(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]',raw)
    if m: return m.group(1).strip()
    return re.sub(r'\{\{[^}]*\}\}','',raw).strip()

def parse(ano):
    lines=io.open(f'wiki/cb_{ano}.wiki',encoding='utf-8').read().split('\n')
    i=next((k for k,l in enumerate(lines) if l.strip().startswith('==') and 'lassificação geral' in l),-1)
    if i<0: return None
    j=next((k for k in range(i+1,len(lines)) if lines[k].strip().startswith('==') and not lines[k].strip().startswith('===')),len(lines))
    cur=None; out={}
    for l in lines[i:j]:
        if 'colspan' in l:
            for lab,key in FASES:
                if lab in l: cur=key; break
            else:
                if 'Classificação final' in l: pass
            continue
        m=NAME.match(l.rstrip())
        if m and cur:
            out[clean(m.group(1))]=cur
    return out

if __name__=='__main__':
    res={}
    for ano in range(2021,2027):
        d=parse(ano)
        c=collections.Counter(d.values())
        ordem=[k for _,k in FASES]
        print(f'{ano}: {len(d):3d} clubes | ' + ' '.join(f'{k}={c[k]}' for k in ordem if c[k]))
        res[str(ano)]=d
    json.dump(res,io.open('cb_raw.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
    print('-> cb_raw.json')
