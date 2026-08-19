# -*- coding: utf-8 -*-
"""Gera o bloco de constantes do RNC para o index.html."""
import io,json,sys,collections
sys.path.insert(0,'.')
from norm import key,split_uf
from alias import ALIAS
band=json.load(io.open('rnc_sigma.json',encoding='utf-8'))
app=json.load(io.open('app_names.json',encoding='utf-8'))
cb=json.load(io.open('cb_raw.json',encoding='utf-8'))
UF=app['ufMap']
APP_ALIAS={'São Joseense':('Sãojoseense','PR'),'Vasco':('Vasco da Gama','RJ')}
idx={}; bykey=collections.defaultdict(list)
for r in band:
    b,_=split_uf(r['n']); k=key(b); idx[(k,r['u'])]=r; bykey[k].append(r)

def to_rnc(name, uf_hint=None):
    if name in APP_ALIAS:
        n,u=APP_ALIAS[name]; b,_=split_uf(n); return idx.get((key(b),u))
    if name in ALIAS:
        n,u=ALIAS[name]; b,_=split_uf(n); return idx.get((key(b),u))
    base,uf=split_uf(name); k=key(base); u=uf or uf_hint or UF.get(name)
    if u and (k,u) in idx: return idx[(k,u)]
    c=bykey.get(k,[])
    return c[0] if len(c)==1 and not u else None

appnames=sorted(set(app['A']+app['B']+app['C']+app['sd']+app['cb']))
nm={}
for a in appnames:
    r=to_rnc(a)
    if r and a!=r['n']: nm[a]=r['n']
# Copa do Brasil 2026: fase alcancada. O app so modela de CB_R32 (5a fase) em diante,
# entao as fases 1 a 4 tem de vir como dado estatico.
PRE={'f1','f2','f3','f4'}
cb26={}
for w,fase in cb['2026'].items():
    if fase not in PRE: continue
    r=to_rnc(w)
    if r: cb26[r['n']+'|'+r['u']]=fase

def js_str(s): return json.dumps(s, ensure_ascii=False)  # aspas duplas, escape JS-compativel
L=[]
L.append("// ====== RANKING NACIONAL DE CLUBES (CBF) ======")
L.append("// Tabela oficial do RNC 2026 (235 clubes), publicada em 23/12/2025.")
L.append("// FONTE: https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/RNC_Ranking_Nacional_dos_Clubes_2026_27e24418e7.pdf")
L.append("//   n = nome CBF · u = federacao · p = pontos RNC 2026 · s5 = SOMA de P2021..P2025")
L.append("//   pos = colocacao oficial (a CBF REPETE a posicao em caso de empate)")
L.append("// s5 nao e publicado: foi montado das classificacoes gerais das Series A/B/C/D e das")
L.append("// Copas do Brasil de 2021-2025 (Wikipedia pt) aplicando a Convencao de Pontos Rev 080.")
L.append("// VALIDACAO: 5*P25+4*P24+3*P23+2*P22+1*P21 reproduz o valor publicado para os 235")
L.append("// clubes, sem uma unica divergencia. Isso prova de uma vez a escala, o parsing das 20")
L.append("// classificacoes, o das 5 Copas do Brasil e toda a reconciliacao de nomes.")
L.append("const RNC_2026 = [")
for r in band:
    L.append("  { n: %s, u: '%s', p: %d, s5: %d, pos: %d }," % (js_str(r['n']), r['u'], r['p'], r['s5'], r['pos']))
L.append("];")
L.append("// Nome do app -> nome no RNC. So as divergencias. O join e sempre por (nome, UF):")
L.append("// homonimos de UF diferente (Primavera-MT x Primavera-SP, Vitoria-BA x Vitoria-ES,")
L.append("// tres Operario, cinco Atletico) gerariam falso positivo silencioso por nome puro.")
L.append("const RNC_NM = {")
for a in sorted(nm): L.append("  %s: %s," % (js_str(a), js_str(nm[a])))
L.append("};")
L.append("// Escala por COLOCACAO GERAL FINAL. Campeao: A 800 / B 400 / C 200 / D 100 (obs. c:")
L.append("// cada serie vale o dobro da inferior). 2o = 80%, 3o = 75%, 4o = 70% (obs. d/e); do")
L.append("// 5o em diante cai 1 ponto percentual por posicao; da 24a em diante repete a 23a (obs. f).")
L.append("const RNC_BASE = { A: 800, B: 400, C: 200, D: 100 };")
L.append("const RNC_PCT = [100, 80, 75, 70, " + ', '.join(str(69-i) for i in range(19)) + "];")
L.append("// Copa do Brasil, duas colunas. A de 2026+ tem 9 fases e comeca em 10 no qualifier;")
L.append("// usar a coluna antiga em 2026 DOBRARIA o valor -- e o erro mais facil de cometer.")
L.append("const RNC_CB_PTS = {")
L.append("  ate2025: { f1: 25, f2: 50, f3: 100, oit: 200, qf: 400, sf: 450, vice: 480, ch: 600 },")
L.append("  de2026:  { f1: 10, f2: 25, f3: 50, f4: 100, f5: 200, oit: 300, qf: 400, sf: 450, vice: 480, ch: 600 }")
L.append("};")
L.append("// Fase na Copa do Brasil 2026 de quem caiu ANTES da 5a fase (= CB_R32 do app, que e")
L.append("// onde o Monte Carlo da Copa comeca). Chave: 'nome|UF' do RNC.")
L.append("const RNC_CB26_PRE = {")
for k in sorted(cb26): L.append("  %s: '%s'," % (js_str(k), cb26[k]))
L.append("};")
src='\n'.join(L)
io.open('rnc_const.js','w',encoding='utf-8',newline='\n').write(src)
print(f'RNC_2026: {len(band)} | RNC_NM: {len(nm)} | RNC_CB26_PRE: {len(cb26)}')
print(f'-> rnc_const.js  ({len(src)} chars, {src.count(chr(10))+1} linhas)')
