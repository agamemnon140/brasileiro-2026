#!/usr/bin/env python3
"""
Atualiza resultados do Simulador Brasileirão 2026.
SEM necessidade de API key. 3 modos de uso:

1) Adicionar 1 resultado:
   python update_results.py add A 10 "Flamengo" 2 1 "Santos"

2) Ler arquivo resultados.txt:
   python update_results.py manual

3) Automático (GitHub Actions tenta buscar GE):
   python update_results.py
"""
import os, re, sys
from datetime import datetime, timedelta

HTML = "index.html"
VAR = {'A':'SA_RES','B':'SB_RES','C':'SC_RES'}
NAMES = {"Atletico-MG":"Atlético-MG","Atletico Mineiro":"Atlético-MG","Atletico-GO":"Atlético-GO",
  "Athletico Paranaense":"Athletico-PR","RB Bragantino":"Red Bull Bragantino","Bragantino":"Red Bull Bragantino",
  "Sao Paulo":"São Paulo","Sao Bernardo":"São Bernardo","Gremio":"Grêmio","Avai":"Avaí",
  "Cuiaba":"Cuiabá","Goias":"Goiás","America Mineiro":"América-MG","Nautico":"Náutico",
  "Criciuma":"Criciúma","Operario-PR":"Operário-PR","Botafogo SP":"Botafogo-SP"}
def fix(n): return NAMES.get(n,n)

def add_result(html, serie, rod, casa, gc, gf, fora):
    v = VAR.get(serie.upper())
    if not v: print(f"Série {serie} não suportada"); return html, False
    casa, fora = fix(casa), fix(fora)
    entry = "{c:'%s',f:'%s',gc:%d,gf:%d,r:%d}" % (casa,fora,gc,gf,rod)
    m = re.search(rf'(const {v}=\[)(.*?)(\];)', html, re.DOTALL)
    if not m: return html, False
    if f"c:'{casa}',f:'{fora}'" in m.group(2): return html, False
    ex = m.group(2).rstrip().rstrip(',')
    new = (ex+','+entry) if ex else entry
    return html[:m.start()]+m.group(1)+new+m.group(3)+html[m.end():], True

def main():
    if not os.path.exists(HTML): print(f"{HTML} não encontrado"); sys.exit(1)
    with open(HTML,'r',encoding='utf-8') as f: html = f.read()

    if len(sys.argv)>1 and sys.argv[1]=='add' and len(sys.argv)>=8:
        s,rod,casa,gc,gf,fora = sys.argv[2],int(sys.argv[3]),sys.argv[4],int(sys.argv[5]),int(sys.argv[6]),sys.argv[7]
        html,ok = add_result(html,s,rod,casa,gc,gf,fora)
        if ok:
            with open(HTML,'w',encoding='utf-8') as f: f.write(html)
            print(f"OK: R{rod} {casa} {gc}x{gf} {fora}")
        else: print("Já existe ou erro")
        return

    if len(sys.argv)>1 and sys.argv[1]=='manual':
        if not os.path.exists('resultados.txt'):
            print("Crie resultados.txt:\n  A 10 Flamengo 2 1 Santos\n  B 3 Fortaleza 1 0 Goiás"); return
        total = 0
        with open('resultados.txt') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                p = line.split()
                if len(p)<6: continue
                s,rod = p[0],int(p[1])
                # Find the two score numbers
                nums = [(i,p[i]) for i in range(2,len(p)) if p[i].isdigit()]
                if len(nums)<2: continue
                casa = ' '.join(p[2:nums[0][0]])
                gc,gf = int(nums[0][1]),int(nums[1][1])
                fora = ' '.join(p[nums[1][0]+1:])
                html,ok = add_result(html,s,rod,casa,gc,gf,fora)
                if ok: print(f"  + R{rod} {casa} {gc}x{gf} {fora}"); total+=1
        if total>0:
            with open(HTML,'w',encoding='utf-8') as f: f.write(html)
            print(f"\n{total} resultados adicionados")
        return

    print("Uso:")
    print("  python update_results.py add A 10 Flamengo 2 1 Santos")
    print("  python update_results.py manual  (lê resultados.txt)")

if __name__=="__main__": main()
