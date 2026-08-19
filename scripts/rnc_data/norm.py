# -*- coding: utf-8 -*-
"""Normalizacao de nomes de clube. O join NUNCA e so por nome: homonimos de UF diferente
(Primavera-MT x Primavera-SP, Vitoria-BA x Vitoria-ES, tres Operario, quatro Atletico)
geram falso positivo silencioso. Onde ha UF nos dois lados, casa por (nome, UF)."""
import unicodedata,re

def strip_acc(s):
    return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')

UF_SET={'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
        'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'}

# ruido que aparece em um universo e nao no outro
DROP=[r'\bfutebol clube\b',r'\bfoot ?ball club\b',r'\besporte clube\b',r'\bclube atletico\b',
      r'\bassociacao atletica\b',r'\bassociacao desportiva\b',r'\bsociedade esportiva\b',
      r'\bgremio esportivo\b',r'\bclube de regatas\b',r'\bclube\b',r'\bsaf\b',
      r'\bec\b',r'\bfc\b',r'\bac\b',r'\baa\b',r'\bse\b',r'\bce\b',r'\bcr\b',r'\bcrb?\b']

def split_uf(name):
    """Devolve (nome_sem_sufixo, uf_ou_None)."""
    m=re.search(r'[-\u2013\s]([A-Z]{2})$',name.strip())
    if m and m.group(1) in UF_SET:
        return name[:m.start()].strip(), m.group(1)
    return name.strip(), None

def key(name):
    s=strip_acc(name).lower()
    s=re.sub(r'\(.*?\)','',s)
    for d in DROP: s=re.sub(d,' ',s)
    s=re.sub(r'[^a-z0-9]+',' ',s).strip()
    return s

def nk(name):
    """(chave, uf) — uf None quando o nome nao carrega sufixo."""
    base,uf=split_uf(name)
    return key(base),uf
