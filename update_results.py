#!/usr/bin/env python3
"""
Atualiza resultados do Simulador Brasileirão 2026 via Claude + Web Search.

Modos:
  python update_results.py                      # busca jogos de ontem
  python update_results.py 2026-04-05            # busca jogos de data específica
  python update_results.py buscar "Flamengo"     # busca último resultado do Flamengo
  python update_results.py buscar "Serie A R10"  # busca resultados de uma rodada
  python update_results.py add A 10 Flamengo 2 1 Santos  # manual

Requer: ANTHROPIC_API_KEY (variável de ambiente ou GitHub Secret)
Log: update_log.txt (append)
"""
import os, re, sys, json
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    os.system("pip install requests -q")
    import requests

HTML_FILE = "index.html"
LOG_FILE = "update_log.txt"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SERIES_VAR = {'A': 'SA_RES', 'B': 'SB_RES', 'C': 'SC_RES'}

SA_RD = {1:'29/01',2:'05/02',3:'12/02',4:'26/02',5:'11/03',6:'15/03',7:'19/03',8:'22/03',9:'02/04',10:'05/04',11:'12/04',12:'19/04',13:'26/04',14:'03/05',15:'10/05',16:'17/05',17:'24/05',18:'31/05',19:'23/07',20:'26/07',21:'30/07',22:'09/08',23:'16/08',24:'23/08',25:'30/08',26:'06/09',27:'13/09',28:'20/09',29:'08/10',30:'11/10',31:'18/10',32:'25/10',33:'29/10',34:'05/11',35:'19/11',36:'22/11',37:'29/11',38:'02/12'}
SB_RD = {1:'22/03',2:'01/04',3:'05/04',4:'12/04',5:'19/04',6:'26/04',7:'03/05',8:'10/05',9:'17/05',10:'24/05',11:'31/05',12:'07/06',13:'14/06',14:'21/06',15:'28/06',16:'05/07',17:'12/07',18:'19/07',19:'26/07',20:'02/08',21:'09/08',22:'16/08',23:'23/08',24:'30/08',25:'06/09',26:'13/09',27:'20/09',28:'27/09',29:'04/10',30:'11/10',31:'18/10',32:'25/10',33:'01/11',34:'08/11',35:'15/11',36:'22/11',37:'25/11',38:'28/11'}
SC_RD = {1:'05/04',2:'12/04',3:'19/04',4:'26/04',5:'03/05',6:'10/05',7:'17/05',8:'24/05',9:'31/05',10:'07/06',11:'14/06',12:'21/06',13:'28/06',14:'05/07',15:'12/07',16:'19/07',17:'26/07',18:'09/08',19:'16/08'}


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def find_round(dd_mm, series):
    rd_map = {'A': SA_RD, 'B': SB_RD, 'C': SC_RD}.get(series, {})
    for rod, dt in rd_map.items():
        if dt == dd_mm:
            return rod
    try:
        d = datetime.strptime(dd_mm + '/2026', '%d/%m/%Y')
        for rod, dt in rd_map.items():
            if abs((d - datetime.strptime(dt + '/2026', '%d/%m/%Y')).days) <= 2:
                return rod
    except:
        pass
    return None


def ask_claude(prompt):
    if not ANTHROPIC_KEY:
        log("ERRO: ANTHROPIC_API_KEY não definida")
        sys.exit(1)

    full_prompt = prompt + """

IMPORTANTE: Retorne APENAS um JSON válido, sem texto antes ou depois. Formato:
[
  {"serie": "A", "rodada": 10, "casa": "Flamengo", "gc": 2, "gf": 1, "fora": "Santos"}
]
Se não encontrar resultados, retorne: []
Use nomes oficiais: Atlético-MG, São Paulo, Red Bull Bragantino, Athletico-PR, Operário-PR, etc."""

    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 3000,
        "tools": [{"type": "web_search_20250305", "name": "web_search"}],
        "messages": [{"role": "user", "content": full_prompt}],
    }
    headers = {"x-api-key": ANTHROPIC_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01"}

    log("Consultando Claude + web search...")
    try:
        resp = requests.post(ANTHROPIC_API, headers=headers, json=body, timeout=90)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log(f"Erro API: {e}")
        return []

    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text += block["text"]

    text = re.sub(r'```json\s*', '', text.strip())
    text = re.sub(r'```\s*', '', text).strip()

    try:
        results = json.loads(text)
        return results if isinstance(results, list) else []
    except:
        m = re.search(r'\[.*\]', text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except:
                pass
        log(f"Resposta não parseável: {text[:200]}")
        return []


def add_result(html, serie, rod, casa, gc, gf, fora):
    var = SERIES_VAR.get(serie.upper())
    if not var:
        return html, False
    entry = "{c:'%s',f:'%s',gc:%d,gf:%d,r:%d}" % (casa, fora, gc, gf, rod)
    m = re.search(rf'(const {var}=\[)(.*?)(\];)', html, re.DOTALL)
    if not m:
        return html, False
    if f"c:'{casa}',f:'{fora}'" in m.group(2):
        return html, False
    ex = m.group(2).rstrip().rstrip(',')
    new = (ex + ',' + entry) if ex else entry
    return html[:m.start()] + m.group(1) + new + m.group(3) + html[m.end():], True


def process_results(results, html):
    total = 0
    for r in results:
        serie = r.get('serie', '').upper()
        rodada = r.get('rodada', 0)
        casa = r.get('casa', '')
        fora = r.get('fora', '')
        gc = r.get('gc', 0)
        gf = r.get('gf', 0)
        if not serie or not casa or not fora:
            continue
        if not rodada:
            rodada = find_round(datetime.now().strftime('%d/%m'), serie) or 0
        if not rodada:
            log(f"  ⚠ Sem rodada: {casa} x {fora} (Série {serie})")
            continue
        html, ok = add_result(html, serie, rodada, casa, gc, gf, fora)
        if ok:
            log(f"  ✅ R{rodada} {casa} {gc}x{gf} {fora} (Série {serie})")
            total += 1
        else:
            log(f"  ⏭ R{rodada} {casa} {gc}x{gf} {fora} (já existe)")
    return html, total


def main():
    if not os.path.exists(HTML_FILE):
        log(f"ERRO: {HTML_FILE} não encontrado")
        sys.exit(1)

    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    log("=" * 50)

    # Modo: add manual
    if len(sys.argv) > 1 and sys.argv[1] == 'add' and len(sys.argv) >= 8:
        s, rod, casa, gc, gf, fora = sys.argv[2], int(sys.argv[3]), sys.argv[4], int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
        html, ok = add_result(html, s, rod, casa, gc, gf, fora)
        if ok:
            with open(HTML_FILE, 'w', encoding='utf-8') as f:
                f.write(html)
            log(f"Manual: R{rod} {casa} {gc}x{gf} {fora} (Série {s})")
        else:
            log("Já existe ou erro")
        return

    # Modo: buscar jogo/time/rodada específica
    if len(sys.argv) > 1 and sys.argv[1] == 'buscar':
        query = ' '.join(sys.argv[2:])
        log(f"Busca: {query}")
        prompt = f"Busque o resultado mais recente do Brasileirão 2026 para: {query}. Inclua série, rodada, times e placar."
        results = ask_claude(prompt)
        if results:
            html, total = process_results(results, html)
            if total > 0:
                with open(HTML_FILE, 'w', encoding='utf-8') as f:
                    f.write(html)
                log(f"Total: {total} resultado(s) adicionado(s)")
        else:
            log("Nenhum resultado encontrado")
        return

    # Modo: data (ontem ou específica)
    if len(sys.argv) > 1 and re.match(r'\d{4}-\d{2}-\d{2}', sys.argv[1]):
        date_str = sys.argv[1]
    else:
        date_str = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')

    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    date_br = date_obj.strftime('%d/%m/%Y')
    dd_mm = date_obj.strftime('%d/%m')
    log(f"Buscando jogos de {date_br}")

    # Verificar rodadas previstas
    for series in ['A', 'B', 'C']:
        rod = find_round(dd_mm, series)
        if rod:
            log(f"  Série {series}: rodada {rod} prevista")

    meses = {1:'janeiro',2:'fevereiro',3:'março',4:'abril',5:'maio',6:'junho',7:'julho',8:'agosto',9:'setembro',10:'outubro',11:'novembro',12:'dezembro'}
    date_ext = f"{date_obj.day} de {meses[date_obj.month]} de {date_obj.year}"

    prompt = f"Busque os resultados dos jogos do Campeonato Brasileiro (Série A, B e C) que aconteceram em {date_ext} ({date_str}). Liste todos os jogos finalizados com placar."

    results = ask_claude(prompt)
    if not results:
        log("Nenhum resultado encontrado")
        return

    log(f"{len(results)} resultado(s) encontrado(s)")
    html, total = process_results(results, html)

    if total > 0:
        with open(HTML_FILE, 'w', encoding='utf-8') as f:
            f.write(html)
        log(f"Total: {total} resultado(s) adicionado(s) ao {HTML_FILE}")
    else:
        log("Nenhum resultado novo")


if __name__ == "__main__":
    main()
