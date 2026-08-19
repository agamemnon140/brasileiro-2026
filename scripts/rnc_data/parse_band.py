import io,re,html,json,collections
s=io.open('band.html',encoding='utf-8').read()
txt=html.unescape(re.sub(r'<[^>]+>','\n',s))
pat=re.compile(r'(\d{1,3})\s*[.\u00ba]\s*([^:(\n]+?)\s*\(([A-Z]{2})\)\s*:\s*([\d.]+)\s*pontos?')
seen={}
order=[]
for pos,name,uf,pts in pat.findall(txt):
    pos=int(pos); pts=int(pts.replace('.',''))
    name=' '.join(name.split())
    key=pos
    rec=(pos,name,uf,pts)
    if key in seen:
        if seen[key]!=rec:
            print('CONFLITO na pos',pos,seen[key],rec)
    else:
        seen[key]=rec; order.append(rec)
order.sort(key=lambda r:r[0])
print('entradas unicas:',len(order))
missing=[p for p in range(1,236) if p not in seen]
print('posicoes faltando:',missing)
dup_names=[n for n,c in collections.Counter((r[1],r[2]) for r in order).items() if c>1]
print('pares (nome,uf) duplicados:',dup_names)
json.dump([{'pos':p,'n':n,'u':u,'p':pt} for p,n,u,pt in order],
          io.open('band.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
print('-> band.json')
