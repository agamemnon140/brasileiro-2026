#!/usr/bin/env python3
"""
Atualiza resultados do Simulador Brasileirão 2026.
Busca jogos do dia anterior via API-Football e atualiza o index.html.

Requer:
  - API_FOOTBALL_KEY: chave gratuita de https://www.api-football.com/
  - Configurar como GitHub Secret: Settings → Secrets → API_FOOTBALL_KEY

Ligas suportadas:
  - Série A (ID 71), Série B (ID 72), Série C (ID 75)
  - Copa do Brasil (ID 73)

Uso local: API_FOOTBALL_KEY=xxx python update_results.py
"""

import os, re, json, sys
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("Instalando requests...")
    os.system("pip install requests")
    import requests

API_KEY = os.environ.get("API_FOOTBALL_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"
HTML_FILE = "index.html"

# Mapeamento de ligas → variável de resultados no HTML
LEAGUES = {
    71:  {"var": "SA_RES", "season": 2026, "name": "Série A"},
    72:  {"var": "SB_RES", "season": 2026, "name": "Série B"},
    75:  {"var": "SC_RES", "season": 2026, "name": "Série C"},
    # 73:  {"var": "CB_RES", "season": 2026, "name": "Copa do Brasil"},  # implementar quando houver dados
}

# Correção de nomes: API-Football → simulador
NAME_MAP = {
    "Atletico-MG": "Atlético-MG", "Atletico Mineiro": "Atlético-MG",
    "Atletico-GO": "Atlético-GO", "Atletico Goianiense": "Atlético-GO",
    "Athletico Paranaense": "Athletico-PR", "Athletico-PR": "Athletico-PR",
    "Red Bull Bragantino": "Red Bull Bragantino", "Bragantino": "Red Bull Bragantino",
    "Sao Paulo": "São Paulo", "Sao Bernardo": "São Bernardo",
    "Gremio": "Grêmio", "Avai": "Avaí", "Cuiaba": "Cuiabá",
    "Goias": "Goiás", "America Mineiro": "América-MG", "América-MG": "América-MG",
    "Nautico": "Náutico", "Criciuma": "Criciúma",
    "Ferroviaria": "Ferroviária", "Paysandu": "Paysandu",
    "Volta Redonda": "Volta Redonda", "Guarani": "Guarani",
    "Botafogo SP": "Botafogo-SP", "Botafogo-SP": "Botafogo-SP",
    "Botafogo PB": "Botafogo-PB", "Botafogo-PB": "Botafogo-PB",
    "Operario-PR": "Operário-PR", "Operario PR": "Operário-PR",
    "Chapecoense": "Chapecoense", "Chapeco": "Chapecoense",
    "Ponte Preta": "Ponte Preta",
    "Novorizontino": "Novorizontino", "Grêmio Novorizontino": "Novorizontino",
    "Vila Nova": "Vila Nova",
    "Inter de Limeira": "Inter de Limeira",
    "Santa Cruz": "Santa Cruz",
    "Figueirense": "Figueirense",
    "Ituano": "Ituano",
    "Ypiranga RS": "Ypiranga", "Ypiranga": "Ypiranga",
    "Maringa": "Maringá",
}


def normalize_name(name):
    """Normaliza nome do time para o formato do simulador."""
    return NAME_MAP.get(name, name)


def fetch_results(date_str, league_id):
    """Busca resultados de uma data e liga específica."""
    if not API_KEY:
        print("AVISO: API_FOOTBALL_KEY não definida. Pulando busca.")
        return []
    
    headers = {"x-apisports-key": API_KEY}
    params = {"league": league_id, "season": 2026, "date": date_str}
    
    try:
        resp = requests.get(f"{BASE_URL}/fixtures", headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"Erro ao buscar liga {league_id}: {e}")
        return []
    
    results = []
    for fix in data.get("response", []):
        status = fix.get("fixture", {}).get("status", {}).get("short", "")
        if status not in ("FT", "AET", "PEN"):  # Só jogos finalizados
            continue
        
        home = fix["teams"]["home"]["name"]
        away = fix["teams"]["away"]["name"]
        goals_h = fix["goals"]["home"]
        goals_a = fix["goals"]["away"]
        round_str = fix["league"].get("round", "")
        
        # Extrair número da rodada (ex: "Regular Season - 10" → 10)
        round_match = re.search(r'(\d+)', round_str)
        round_num = int(round_match.group(1)) if round_match else 0
        
        results.append({
            "casa": normalize_name(home),
            "fora": normalize_name(away),
            "gc": goals_h,
            "gf": goals_a,
            "rodada": round_num,
        })
    
    return results


def format_result(r):
    """Formata resultado como JS object string."""
    return f"{{c:'{r['casa']}',f:'{r['fora']}',gc:{r['gc']},gf:{r['gf']},r:{r['rodada']}}}"


def update_html(html, var_name, new_results):
    """
    Atualiza a variável de resultados no HTML.
    Encontra 'const VAR=[...];' e adiciona novos resultados sem duplicar.
    """
    # Encontrar o array existente
    pattern = rf'(const {var_name}=\[)(.*?)(\];)'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        print(f"  AVISO: variável {var_name} não encontrada no HTML")
        return html, 0
    
    existing = match.group(2)
    
    # Verificar quais resultados já existem
    added = 0
    for r in new_results:
        # Checar se já existe (mesmo casa, fora, rodada)
        check = f"c:'{r['casa']}',f:'{r['fora']}'"
        if check in existing:
            continue
        
        # Adicionar
        entry = format_result(r)
        if existing.strip():
            existing = existing.rstrip().rstrip(',') + ',' + entry
        else:
            existing = entry
        added += 1
    
    if added > 0:
        html = html[:match.start()] + match.group(1) + existing + match.group(3) + html[match.end():]
    
    return html, added


def main():
    # Buscar resultados de ontem
    yesterday = datetime.utcnow() - timedelta(days=1)
    date_str = yesterday.strftime("%Y-%m-%d")
    date_br = yesterday.strftime("%d/%m/%Y")
    
    print(f"=== Atualizador de Resultados — {date_br} ===\n")
    
    # Ler HTML
    if not os.path.exists(HTML_FILE):
        print(f"ERRO: {HTML_FILE} não encontrado")
        sys.exit(1)
    
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html = f.read()
    
    total_added = 0
    
    for league_id, info in LEAGUES.items():
        print(f"Buscando {info['name']} (liga {league_id})...")
        results = fetch_results(date_str, league_id)
        
        if not results:
            print(f"  Nenhum resultado encontrado")
            continue
        
        print(f"  {len(results)} jogos encontrados:")
        for r in results:
            print(f"    R{r['rodada']}: {r['casa']} {r['gc']}x{r['gf']} {r['fora']}")
        
        html, added = update_html(html, info["var"], results)
        print(f"  {added} novos resultados adicionados")
        total_added += added
    
    # Salvar se houve mudanças
    if total_added > 0:
        with open(HTML_FILE, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"\n✅ {total_added} resultados adicionados ao {HTML_FILE}")
    else:
        print(f"\nNenhum resultado novo para adicionar.")
    
    # Atualizar contador de jogos no rodapé
    if total_added > 0:
        sa_count = len(re.findall(r"\{c:'[^']+',f:'[^']+',gc:\d+,gf:\d+,r:\d+\}", 
                                    html[:html.find('SB_')]))
        sb_count = len(re.findall(r"\{c:'[^']+',f:'[^']+',gc:\d+,gf:\d+,r:\d+\}", 
                                    html[html.find('SB_RES'):html.find('SB_META')]))
        print(f"Contagem atualizada: SA={sa_count}, SB={sb_count}")


if __name__ == "__main__":
    main()
