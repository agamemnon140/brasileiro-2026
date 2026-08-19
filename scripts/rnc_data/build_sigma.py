# -*- coding: utf-8 -*-
"""Monta Sigma(P2021..P2025) por clube, pela Convencao de Pontos do RNC (Rev 080, 23/12/25).

  P_ano = pontos da serie (por COLOCACAO GERAL FINAL) + pontos da Copa do Brasil
  RNC2027 = RNC2026 + 5*P26 - Sigma

Escala por colocacao: campeao A=800 B=400 C=200 D=100; 2o=80%, 3o=75%, 4o=70%; do 5o em
diante cai 1 ponto percentual por posicao; da 24a em diante repete o valor da 23a (51%).
"""
import io,json,sys,collections
sys.path.insert(0,'.')
from norm import key,split_uf
from alias import ALIAS,DISAMB

PCT=[100,80,75,70]+[69-i for i in range(19)]   # 1o..23o  -> 100,80,75,70,69,68,...,51
BASE={'A':800,'B':400,'C':200,'D':100}
def pts_serie(serie,pos,ano=None,total=None):
    # obs. (h) da Convencao: em 2020/2021 a Serie D teve Fase Preliminar de 8 clubes e os 4
    # que nao avancaram recebem 10 pontos fixos. Em 2021 a classificacao geral tem 68 linhas
    # (64 + esses 4), entao sao exatamente as 4 ultimas.
    if serie=='D' and ano in (2020,2021) and total and pos>total-4:
        return 10.0
    p=PCT[min(pos,23)-1]
    return BASE[serie]*p/100.0

# Copa do Brasil: duas colunas. A de 2026+ (9 fases) comeca em 10 no qualifier; usar a
# coluna antiga em 2026 DOBRARIA o valor -- e o erro mais facil de cometer.
CB_OLD={'f1':25,'f2':50,'f3':100,'oit':200,'qf':400,'sf':450,'vice':480,'ch':600}
CB_NEW={'f1':10,'f2':25,'f3':50,'f4':100,'f5':200,'oit':300,'qf':400,'sf':450,'vice':480,'ch':600}
def pts_cb(fase,ano):
    return (CB_NEW if ano>=2026 else CB_OLD).get(fase,0)

band=json.load(io.open('band.json',encoding='utf-8'))
app=json.load(io.open('app_names.json',encoding='utf-8'))
liga=json.load(io.open('liga_raw.json',encoding='utf-8'))
cb=json.load(io.open('cb_raw.json',encoding='utf-8'))
UF=app['ufMap']

# indice do RNC por (chave-sem-sufixo, UF) e por chave
idx={}; bykey=collections.defaultdict(list)
for r in band:
    b,_=split_uf(r['n']); k=key(b)
    idx[(k,r['u'])]=r; bykey[k].append(r)

def resolve(w):
    if w in ALIAS:
        n,u=ALIAS[w]; b,_=split_uf(n); return idx.get((key(b),u))
    base,uf=split_uf(w); k=key(base)
    if uf and (k,uf) in idx: return idx[(k,uf)]
    if w in UF and (k,UF[w]) in idx: return idx[(k,UF[w])]
    if base in DISAMB and (k,DISAMB[base]) in idx: return idx[(k,DISAMB[base])]
    c=bykey.get(k,[])
    return c[0] if len(c)==1 else None

# identidade do clube = (nome RNC, UF) quando existe; senao o proprio nome do wiki
def ident(w):
    r=resolve(w)
    return (r['n'],r['u']) if r else None

sigma=collections.defaultdict(float)
detalhe=collections.defaultdict(dict)
naoresolv=collections.Counter()

for ano in range(2021,2026):
    for s in 'ABCD':
        for row in liga[f'{ano}{s}']:
            i=ident(row['n'])
            if not i: naoresolv[row['n']]+=1; continue
            v=pts_serie(s,row['pos'],ano,len(liga[f'{ano}{s}']))
            sigma[i]+=v
            detalhe[i].setdefault(ano,{})['serie']=f"{s}{row['pos']}o={v:.0f}"
    for w,fase in cb[str(ano)].items():
        i=ident(w)
        if not i: naoresolv[w]+=1; continue
        v=pts_cb(fase,ano)
        sigma[i]+=v
        detalhe[i].setdefault(ano,{})['cb']=f"{fase}={v}"

out=[]
for r in band:
    i=(r['n'],r['u'])
    out.append({'n':r['n'],'u':r['u'],'p':r['p'],'pos':r['posCBF'],
                's5':round(sigma.get(i,0.0)),'det':detalhe.get(i,{})})
json.dump(out,io.open('rnc_sigma.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
comS=sum(1 for x in out if x['s5']>0)
print(f'clubes do RNC com Sigma>0: {comS}/{len(out)}')
print(f'nomes do wiki nao resolvidos (ocorrencias): {sum(naoresolv.values())} em {len(naoresolv)} nomes distintos')
io.open('naoresolvidos.txt','w',encoding='utf-8').write('\n'.join(f'{k}\t{v}' for k,v in naoresolv.most_common()))
print('-> rnc_sigma.json')

# --- validacao: reconstruir o RNC 2026 publicado a partir dos dados ano a ano ---
# RNC2026 = 5*P25 + 4*P24 + 3*P23 + 2*P22 + 1*P21. Se os dados anuais estiverem certos, o
# valor calculado tem de bater com o publicado. E o teste mais forte disponivel: valida
# simultaneamente a escala de pontos, o parsing das 20 classificacoes, o das 5 Copas do
# Brasil e toda a reconciliacao de nomes.
PESO={2025:5,2024:4,2023:3,2022:2,2021:1}
pano=collections.defaultdict(lambda: collections.defaultdict(float))
for ano in range(2021,2026):
    for s in 'ABCD':
        for row in liga[f'{ano}{s}']:
            i=ident(row['n'])
            if i: pano[i][ano]+=pts_serie(s,row['pos'],ano,len(liga[f'{ano}{s}']))
    for w,fase in cb[str(ano)].items():
        i=ident(w)
        if i: pano[i][ano]+=pts_cb(fase,ano)
res=[]
for r in band:
    i=(r['n'],r['u'])
    calc=sum(PESO[a]*pano[i].get(a,0.0) for a in PESO)
    res.append((r['n'],r['u'],r['p'],round(calc),round(calc)-r['p'],dict(pano[i])))
exato=sum(1 for x in res if x[4]==0)
d10=sum(1 for x in res if abs(x[4])<=10)
print(f'\n=== reconstrucao do RNC 2026 (5/4/3/2/1) ===')
print(f'  exato:        {exato}/235 ({100*exato/235:.1f}%)')
print(f'  erro <= 10:   {d10}/235 ({100*d10/235:.1f}%)')
piores=sorted(res,key=lambda x:-abs(x[4]))[:12]
print('  maiores divergencias:')
for n_,u_,pub,calc,dif,det in piores:
    print(f'    {n_+"/"+u_:24s} pub={pub:6d} calc={calc:6d} dif={dif:+6d}')
json.dump([{'n':x[0],'u':x[1],'pub':x[2],'calc':x[3],'dif':x[4],'pAno':{str(k):v for k,v in x[5].items()}} for x in res],
          io.open('recon.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
