# ⚽ Simulador Brasileirão 2026

Simulador Monte Carlo: Séries A, B, C, D + Copa do Brasil + Ao Vivo.

## Deploy no GitHub Pages

1. Crie um repositório no GitHub (ex: `brasileirao-2026`)
2. Suba os arquivos: `index.html`, `icon-180.png`, `update_results.py`
3. Settings → Pages → Source: `main` / `root` → Save
4. Acesse: `https://seuuser.github.io/brasileirao-2026/`

**⚠️ A pasta `.github` não sobe pelo upload web do GitHub.**
Para o workflow funcionar, crie manualmente:
1. No repositório, clique "Add file" → "Create new file"
2. Nome: `.github/workflows/daily-update.yml`
3. Cole o conteúdo do arquivo `daily-update.yml`

## Salvar no iPhone

1. Abra o link no Safari
2. Toque em Compartilhar (⬆️) → "Adicionar à Tela de Início"
3. O app abre em tela cheia com o ícone ⚽

## Atualizar Resultados

Sem API key. 3 opções:

```bash
# Opção 1: Adicionar 1 jogo
python update_results.py add A 10 "Flamengo" 2 1 "Santos"

# Opção 2: Arquivo com vários jogos
echo "A 10 Flamengo 2 1 Santos" >> resultados.txt
echo "A 10 Palmeiras 3 0 Grêmio" >> resultados.txt
python update_results.py manual

# Opção 3: Via GitHub (crie resultados.txt no repo, rode o workflow)
```

Formato do `resultados.txt`:
```
# Serie Rodada Casa GolsCasa GolsFora Fora
A 10 Flamengo 2 1 Santos
A 10 Palmeiras 3 0 Grêmio
B 3 Fortaleza 1 0 Goiás
```
