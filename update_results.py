#!/usr/bin/env python3
"""
Atualiza resultados do Simulador Brasileirão 2026 usando Claude + Web Search.
Busca jogos da data especificada e atualiza o index.html.

Requer: ANTHROPIC_API_KEY como variável de ambiente ou GitHub Secret.

Uso:
  python update_results.py                  # busca jogos de ontem
  python update_results.py 2026-04-05       # busca jogos de uma data específica
  python update_results.py add A 10 "Flamengo" 2 1 "Santos"   # manual
"""

import os, re, sys, json
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    os.system("pip install requests -q")
    import requests

HTML_FILE = "index.html"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

SERIES_VAR = {'A': 'SA_RES', 'B': 'SB_RES', 'C': 'SC_RES'}

# Datas previstas por rodada (para identificar a rodada correta)
SA_ROUND_DATES = {1:'29/01',2:'05/02',3:'12/02',4:'26/02',5:'11/03',6:'15/03',7:'19/03',8:'22/03',9:'02/04',10:'05/04',11:'12/04',12:'19/04',13:'26/04',14:'03/05',15:'10/05',16:'17/05',17:'24/05',18:'31/05',19:'23/07',20:'26/07',21:'30/07',22:'09/08',23:'16/08',24:'23/08',25:'30/08',26:'06/09',27:'13/09',28:'20/09',29:'08/10',30:'11/10',31:'18/10',32:'25/10',33:'29/10',34:'05/11',35:'19/11',36:'22/11',37:'29/11',38:'02/12'}
SB_ROUND_DATES = {1:'22/03',2:'01/04',3:'05/04',4:'12/04',5:'19/04',6:'26/04',7:'03/05',8:'10/05',9:'17/05',10:'24/05',11:'31/05',12:'07/06',13:'14/06',14:'21/06',15:'28/06',16:'05/07',17:'12/07',18:'19/07',19:'26/07',20:'02/08',21:'09/08',22:'16/08',23:'23/08',24:'30/08',25:'06/09',26:'13/09',27:'20/09',28:'27/09',29:'04/10',30:'11/10',31:'18/10',32:'25/10',33:'01/11',34:'08/11',35:'15/11',36:'22/11',37:'25/11',38:'28/11'}
SC_ROUND_DATES = {1:'05/04',2:'12/04',3:'19/04',4:'26/04',5:'03/05',6:'10/05',7:'17/05',8:'24/05',9:'31/05',10:'07/06',11:'14/06',12:'21/06',13:'28/06',14:'05/07',15:'12/07',16:'19/07',17:'26/07',18:'09/08',19:'16/08'}

def find_round(date_dd_mm, series):
    """Acha a rodada mais próxima da data."""
    rd_map = {'A': SA_ROUND_DATES, 'B': SB_ROUND_DATES, 'C': SC_ROUND_DATES}.get(series, {})
    for rod, dt in rd_map.items():
        if dt == date_dd_mm:
            return rod
    # Tolerância: +/- 2 dias
    try:
        d = datetime.strptime(date_dd_mm + '/2026', '%d/%m/%Y')
        for rod, dt in rd_map.items():
            rd_date = datetime.strptime(dt + '/2026', '%d/%m/%Y')
            if abs((d - rd_date).days) <= 2:
                return rod
    except:
        pass
    return None


def ask_claude(date_str):
    """Usa Claude com web search para buscar resultados do Brasileirão."""
    if not ANTHROPIC_KEY:
        print("ERRO: ANTHROPIC_API_KEY não definida.")
        print("Configure como GitHub Secret ou variável de ambiente.")
        sys.exit(1)

    date_br = datetime.strptime(date_str, '%Y-%m-%d').strftime('%d/%m/%Y')
    date_query = datetime.strptime(date_str, '%Y-%m-%d').strftime('%d de %B de %Y').replace(
        'January','janeiro').replace('February','fevereiro').replace('March','março').replace(
        'April','abril').replace('May','maio').replace('June','junho').replace(
        'July','julho').replace('August','agosto').replace('September','setembro').replace(
        'October','outubro').replace('November','novembro').replace('December','dezembro')

    prompt = f"""Busque os resultados dos jogos do Campeonato Brasileiro que aconteceram no dia {date_query} ({date_str}).
Procure resultados da Série A, Série B e Série C do Brasileirão 2026.

IMPORTANTE: Retorne APENAS um JSON válido, sem nenhum texto antes ou depois. Formato:

[
  {{"serie": "A", "rodada": 10, "casa": "Flamengo", "gc": 2, "gf": 1, "fora": "Santos"}},
  {{"serie": "B", "rodada": 3, "casa": "Fortaleza", "gc": 1, "gf": 0, "fora": "Goiás"}}
]

Se não houver jogos nessa data, retorne: []

Use os nomes oficiais dos times: Atlético-MG (não Atletico), São Paulo (não Sao Paulo), 
Red Bull Bragantino (não RB Bragantino), Athletico-PR (não Atletico-PR), etc.
Inclua o número da rodada se encontrar."""

    headers = {
        "x-api-key": ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
    }

    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2000,
        "tools": [{"type": "web_search_20250305", "name": "web_search"}],
        "messages": [{"role": "user", "content": prompt}],
    }

    print(f"Perguntando ao Claude sobre jogos de {date_br}...")

    try:
        resp = requests.post(ANTHROPIC_API, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"Erro na API: {e}")
        if hasattr(resp, 'text'):
            print(f"Resposta: {resp.text[:500]}")
        return []

    # Extrair texto da resposta
    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text += block["text"]

    # Parse JSON da resposta
    text = text.strip()
    # Remover markdown fences se houver
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    text = text.strip()

    try:
        results = json.loads(text)
        if not isinstance(results, list):
            results = []
    except json.JSONDecodeError:
        # Tentar extrair JSON de dentro do texto
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            try:
                results = json.loads(match.group())
            except:
                print(f"Não consegui parsear resposta: {text[:200]}")
                results = []
        else:
            print(f"Resposta sem JSON: {text[:200]}")
            results = []

    return results


def add_result(html, serie, rod, casa, gc, gf, fora):
    """Adiciona 1 resultado ao HTML."""
    var = SERIES_VAR.get(serie.upper())
    if not var:
        return html, False

    entry = "{c:'%s',f:'%s',gc:%d,gf:%d,r:%d}" % (casa, fora, gc, gf, rod)

    pattern = rf'(const {var}=\[)(.*?)(\];)'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        return html, False

    existing = match.group(2)

    # Verificar duplicata
    if f"c:'{casa}',f:'{fora}'" in existing:
        return html, False

    ex = existing.rstrip().rstrip(',')
    new = (ex + ',' + entry) if ex else entry
    html = html[:match.start()] + match.group(1) + new + match.group(3) + html[match.end():]
    return html, True


def main():
    # Modo manual: adicionar 1 resultado
    if len(sys.argv) > 1 and sys.argv[1] == 'add':
        if len(sys.argv) < 8:
            print('Uso: python update_results.py add SERIE RODADA CASA GC GF FORA')
            sys.exit(1)
        if not os.path.exists(HTML_FILE):
            print(f"{HTML_FILE} não encontrado"); sys.exit(1)
        with open(HTML_FILE, 'r', encoding='utf-8') as f:
            html = f.read()
        s, rod, casa, gc, gf, fora = sys.argv[2], int(sys.argv[3]), sys.argv[4], int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
        html, ok = add_result(html, s, rod, casa, gc, gf, fora)
        if ok:
            with open(HTML_FILE, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"✅ R{rod} {casa} {gc}x{gf} {fora} (Série {s})")
        else:
            print("Já existe ou erro.")
        return

    # Determinar data
    if len(sys.argv) > 1 and re.match(r'\d{4}-\d{2}-\d{2}', sys.argv[1]):
        date_str = sys.argv[1]
    else:
        date_str = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')

    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    date_dd_mm = date_obj.strftime('%d/%m')
    print(f"=== Atualização: {date_obj.strftime('%d/%m/%Y')} ===\n")

    # Verificar se há rodada prevista nessa data
    has_games = False
    for series, rd_map in [('A', SA_ROUND_DATES), ('B', SB_ROUND_DATES), ('C', SC_ROUND_DATES)]:
        rod = find_round(date_dd_mm, series)
        if rod:
            print(f"Série {series}: rodada {rod} prevista para {date_dd_mm}")
            has_games = True

    if not has_games:
        print(f"Nenhuma rodada prevista para {date_dd_mm}. Buscando mesmo assim...")

    # Buscar resultados via Claude
    results = ask_claude(date_str)

    if not results:
        print("Nenhum resultado encontrado.")
        return

    print(f"\n{len(results)} resultado(s) encontrado(s):")

    # Carregar HTML
    if not os.path.exists(HTML_FILE):
        print(f"{HTML_FILE} não encontrado"); sys.exit(1)
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    total = 0
    for r in results:
        serie = r.get('serie', '').upper()
        rodada = r.get('rodada', 0)
        casa = r.get('casa', '')
        fora = r.get('fora', '')
        gc = r.get('gc', 0)
        gf = r.get('gf', 0)

        # Se não veio rodada, tentar inferir pela data
        if not rodada:
            rodada = find_round(date_dd_mm, serie) or 0

        if not serie or not casa or not fora or not rodada:
            print(f"  ⚠ Dados incompletos: {r}")
            continue

        html, ok = add_result(html, serie, rodada, casa, gc, gf, fora)
        if ok:
            print(f"  ✅ R{rodada} {casa} {gc}x{gf} {fora} (Série {serie})")
            total += 1
        else:
            print(f"  ⏭ R{rodada} {casa} {gc}x{gf} {fora} (já existe)")

    if total > 0:
        with open(HTML_FILE, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"\n✅ {total} resultado(s) adicionado(s) ao {HTML_FILE}")
    else:
        print("\nNenhum resultado novo para adicionar.")


if __name__ == "__main__":
    main()
