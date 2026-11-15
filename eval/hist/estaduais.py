# -*- coding: utf-8 -*-
"""Classificacao final dos estaduais a partir das secoes "Classificacao geral/final" da
Wikipedia pt.

Entrada: um JSON com uma lista de {uf, ano, title, sec, wt}, onde wt e o wikitext da secao
(colhido pela API do MediaWiki num navegador; o ambiente do Claude nao alcanca a Wikipedia).
Saida: eval/data/hist/estaduais_classificacao.json, com {uf, ano, fonte, clubes: [nomes em
ordem de colocacao]} e um resumo de cobertura.

Dois formatos convivem: {{#invoke:Sports table}}, em que team1..teamN ja vem na ordem da
tabela, e wikitable manual, em que a posicao e a primeira celula numerica da linha.

    python eval/hist/estaduais.py <secoes.json>
"""
import io, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(AQUI, '..', 'data', 'hist', 'estaduais_classificacao.json')


def limpar(s):
    """Nome exibido de uma celula: tira refs, bandeiras, negrito e resolve [[alvo|rotulo]]."""
    s = re.sub(r'<ref[^>]*?/>|<ref.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'\[\[(?:Ficheiro|Imagem|File|Image|Arquivo):[^\]]*\]\]', '', s, flags=re.I)
    s = re.sub(r'\{\{(?:flagicon|bandeira|BR-\w\wb?|\w\wb)[^}]*\}\}', '', s, flags=re.I)
    m = re.search(r'\[\[([^\]|]+)(?:\|([^\]]*))?\]\]', s)
    if m:
        s = m.group(2) or m.group(1)
    else:
        t = re.search(r'\{\{\s*(?:Futebol|Fb team|Fb)\s+([^}|]+)', s, flags=re.I)
        if t:
            s = t.group(1)
    s = re.sub(r"'{2,}|<[^>]+>|\{\{[^}]*\}\}", '', s)
    return re.sub(r'\s+', ' ', s).strip(' *†‡')


def sports_table(wt):
    ordem = [(int(n), c.strip()) for n, c in re.findall(r'\|\s*team(\d+)\s*=\s*([^|\n}]+)', wt)]
    if not ordem:
        return []
    nomes = {c.strip(): limpar(v) for c, v in re.findall(r'\|\s*name_([^=\s]+)\s*=\s*([^\n]+?)(?=\s*\|\s*\w+_|\s*$)', wt, flags=re.M)}
    return [nomes.get(c) or c for _, c in sorted(ordem)]


def wikitable(wt):
    out = []
    for bloco in re.split(r'\n\|-+[^\n]*', wt):
        cels = [c for c in re.split(r'\n[|!]|\|\||!!', '\n' + bloco.strip()) if c.strip()]
        cels = [re.sub(r'^[^|\[\{]*?\|(?!\|)', '', c, count=1) if re.match(r'^\s*(?:style|align|bgcolor|width|rowspan|colspan|class|scope)[^|\[]*\|', c) else c for c in cels]
        if len(cels) < 3:
            continue
        pos = None
        for i, c in enumerate(cels[:3]):
            m = re.fullmatch(r"\s*'*(\d{1,2})[º°ªo.]?'*\s*", re.sub(r'<[^>]+>|\{\{[^}]*\}\}', '', c))
            if m:
                pos = (i, int(m.group(1)))
                break
        if pos is None:
            continue
        nome = ''
        for c in cels[pos[0] + 1:pos[0] + 4]:
            if re.search(r'\[\[|\{\{\s*(?:Futebol|Fb)', c) or re.search(r'[A-Za-zÀ-ÿ]{3,}', re.sub(r'<[^>]+>', '', c)):
                nome = limpar(c)
                if nome and not re.fullmatch(r'[\d\s+\-–−.,%]+', nome):
                    break
        if nome:
            out.append((pos[1], nome))
    # mantem a primeira tabela coerente: posicoes 1..N em ordem
    seq, esperado = [], 1
    for p, n in out:
        if p == esperado:
            seq.append(n); esperado += 1
        elif p == 1 and len(seq) >= 4:
            break
    return seq


def main(arq):
    secs = json.load(io.open(arq, encoding='utf-8'))
    res, falhas = [], []
    for s in secs:
        wt = s['wt']
        clubes = sports_table(wt) if re.search(r'#invoke:\s*Sports table', wt, re.I) else wikitable(wt)
        if len(clubes) >= 5 and len(set(clubes)) == len(clubes):
            res.append({'uf': s['uf'], 'ano': s['ano'], 'fonte': s['title'], 'secao': s['sec'], 'clubes': clubes})
        else:
            falhas.append((s['uf'], s['ano'], len(clubes), s['title']))
    res.sort(key=lambda r: (r['uf'], r['ano']))
    os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
    json.dump(res, io.open(DESTINO, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('secoes lidas:', len(secs), '| tabelas extraidas:', len(res), '| falhas:', len(falhas))
    for f in falhas:
        print('   falhou:', f)
    por = {}
    for r in res:
        por.setdefault(r['uf'], []).append(str(r['ano'])[2:])
    print('cobertura:', ' '.join('%s[%s]' % (u, ','.join(a)) for u, a in sorted(por.items())))
    return res


if __name__ == '__main__':
    main(sys.argv[1])
