# ⚽ Simulador Brasileirão 2026

Simulador Monte Carlo: Séries A, B, C, D + Copa do Brasil + Ao Vivo.

## Deploy (GitHub Pages)

1. Crie repositório → suba `index.html`, `icon-180.png`, `update_results.py`
2. Settings → Pages → Source: `main` / `root`
3. **Pasta `.github`**: crie manualmente no GitHub: Add file → Create new file → `.github/workflows/daily-update.yml`

## Salvar no iPhone

Safari → ⬆️ → "Adicionar à Tela de Início"

## Atualização via Claude (web search)

Usa a API do Claude para buscar resultados na web. Custo: ~$0.01/execução.

### Setup:
1. API key em [console.anthropic.com](https://console.anthropic.com/)
2. GitHub: Settings → Secrets → `ANTHROPIC_API_KEY` = `sk-ant-...`

### Modos de uso:

```bash
# Jogos de ontem (automático diário):
python update_results.py

# Jogos de data específica:
python update_results.py 2026-04-10

# Buscar time ou rodada:
python update_results.py buscar "Flamengo"
python update_results.py buscar "Serie A rodada 10"
python update_results.py buscar "Palmeiras x Santos"

# Manual (sem API):
python update_results.py add A 10 "Flamengo" 2 1 "Santos"
```

### Via GitHub Actions:
Actions → "Atualizar Resultados" → Run workflow:
- **mode**: data (`2026-04-10`) ou vazio (ontem)
- **query**: texto livre (`Flamengo`, `Serie B R3`, etc.)

### Log:
Todas as alterações ficam em `update_log.txt` (commitado automaticamente).
