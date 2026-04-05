# ⚽ Simulador Brasileirão 2026

Simulador Monte Carlo: Séries A, B, C, D + Copa do Brasil + Ao Vivo.

## Deploy

1. Crie repositório no GitHub
2. Suba: `index.html`, `icon-180.png`, `update_results.py`
3. Settings → Pages → Source: `main` / `root`

**Pasta `.github` não sobe pelo upload web.** Crie manualmente:
→ "Add file" → "Create new file" → nome: `.github/workflows/daily-update.yml` → cole o conteúdo

## Atualização automática (Claude + Web Search)

O workflow roda todo dia às 05:00 BRT. Usa a API do Claude para buscar
resultados na web e atualizar o `index.html` automaticamente.

### Setup:

1. Pegue sua API key em [console.anthropic.com](https://console.anthropic.com/)
2. No repositório: **Settings → Secrets → Actions → New secret**
3. Nome: `ANTHROPIC_API_KEY` | Valor: sua chave `sk-ant-...`
4. Pronto — roda sozinho todo dia

### Custo:

Cada execução usa ~1 chamada ao Claude Sonnet com web search.
Custo estimado: ~$0.01 por dia (~$0.30/mês).

### Rodar manualmente:

```bash
# Ontem:
ANTHROPIC_API_KEY=sk-ant-... python update_results.py

# Data específica:
ANTHROPIC_API_KEY=sk-ant-... python update_results.py 2026-04-05

# Adicionar 1 jogo manual:
python update_results.py add A 10 "Flamengo" 2 1 "Santos"
```

### Rodar via GitHub:

Actions → "Atualizar Resultados" → Run workflow → (opcionalmente digitar data)

## Salvar no iPhone

Safari → ⬆️ → "Adicionar à Tela de Início"
