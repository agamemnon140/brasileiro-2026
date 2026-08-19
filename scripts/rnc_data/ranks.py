import io,re,json
band=json.load(io.open('band.json',encoding='utf-8'))
# ranking de competicao padrao: mesmos pontos -> mesma posicao; a proxima pula
rank={}; prev=None; r=0
for i,rec in enumerate(band,1):
    if rec['p']!=prev: r=i; prev=rec['p']
    rank[(rec['n'],rec['u'])]=r
    rec['posCBF']=r
# confere contra as posicoes lidas no PDF (coluna esquerda, so onde o nome casa exato)
lines=io.open('rnc2026.txt',encoding='utf-8').read().split('\n')
left=re.compile(r'^\s*(\d{1,3})\s+(\S.*?)\s{2,}([A-Z]{2})\s+([\d.]+)\s')
byname={(x['n'],x['u']):x for x in band}
ok=miss=bad=0; probs=[]
for ln in lines:
    m=left.match(ln)
    if not m: continue
    pos=int(m.group(1)); name=' '.join(m.group(2).split()); uf=m.group(3)
    b=byname.get((name,uf))
    if not b: miss+=1; continue
    if b['posCBF']==pos: ok+=1
    else: bad+=1; probs.append(f"{name}/{uf}: pdf={pos} calculado={b['posCBF']} pts={b['p']}")
print(f'nomes que casaram exato: {ok+bad}  |  posicao CBF confere: {ok}  |  divergem: {bad}  |  nao casaram: {miss}')
for p in probs[:15]: print('   ',p)
# empates
from collections import Counter
c=Counter(x['posCBF'] for x in band)
ties=sorted([(p,n) for p,n in c.items() if n>1])
print('posicoes empatadas (CBF):', ', '.join(f'{p}x{n}' for p,n in ties))
json.dump(band, io.open('band.json','w',encoding='utf-8'), ensure_ascii=False, indent=0)
print('-> band.json atualizado com posCBF')
