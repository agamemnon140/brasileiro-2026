# ⚽ Simulador Brasileirão 2026

Simulador Monte Carlo do Campeonato Brasileiro 2026 com motor Poisson + ELO + ATK/DEF.

**[Acessar Simulador →](https://seuuser.github.io/brasileirao-2026/)**

## Competições

| Competição | Times | Formato | Status |
|---|---|---|---|
| Série A | 20 | Pontos corridos 38R | 85 jogos reais |
| Série B | 20 | Pontos corridos 38R | 20 jogos reais |
| Série C | 20 | 1ª Fase 19R + Quadrangular | Início 05/04 |
| Série D | 96 | 16 grupos + mata-mata | Não iniciou |
| Copa do Brasil | 32 | Bracket ida/volta + final neutra | Não iniciou |

## Funcionalidades

- **Monte Carlo** — simula N campeonatos e calcula probabilidades de título, acesso/G4, rebaixamento
- **Pontos de corte** — p10/p50/p90 de pontos para cada posição
- **Matriz de posições** — frequência completa de cada time em cada posição
- **1 Simulação** — simula um campeonato completo com todos os resultados
- **Ao Vivo** — Bayesian update em tempo real durante jogos
- **Configuração** — todos os parâmetros editáveis: alphas, lambdas, spread, etc.
- **Escudos** — badges dos times via CDN com fallback para iniciais
- **Simular Tudo** — roda A+B+C+D+Copa de uma vez com dashboard

## Modelo

Motor Poisson com ELO + ATK/DEF:

```
λ_casa = total × pesoCasa × ATK_casa × DEF_fora
λ_fora = total × (1-pesoCasa) × ATK_fora × DEF_casa
```

- **Spread dinâmico**: `log(targetRatio) / log(maxELO/minELO)`, capped em `maxSpread`
- **Suavização**: `sign(s) · log(1 + |s|)` (assimétrica)
- **Alpha**: atk ≠ def (ataque e defesa atualizam em ritmos diferentes)
- **ELO**: K variável por perfil (16/32/48)

## Deploy (GitHub Pages)

1. Fork este repositório
2. Em **Settings → Pages → Source**: selecione `main` / `root`
3. Acesse em `https://seuuser.github.io/brasileirao-2026/`

## Atualização Automática de Resultados

O workflow GitHub Actions roda diariamente às 05:00 BRT e busca resultados via API-Football.

### Setup:

1. Crie uma conta gratuita em [api-football.com](https://www.api-football.com/)
2. Copie sua API key
3. No repositório, vá em **Settings → Secrets → Actions → New repository secret**
4. Nome: `API_FOOTBALL_KEY`, valor: sua chave
5. O workflow roda automaticamente todo dia

### Rodar manualmente:

```bash
export API_FOOTBALL_KEY=sua_chave_aqui
python update_results.py
```

## Estrutura

```
brasileirao-2026/
├── index.html              # App completo (standalone)
├── update_results.py       # Script de atualização diária
├── .github/workflows/
│   └── daily-update.yml    # GitHub Actions cron job
└── README.md
```

## Tecnologias

- React 18 (CDN)
- Tailwind CSS (CDN)
- Babel standalone (CDN)
- Python 3 + requests (para atualização)
- GitHub Actions (CI/CD)

## Licença

MIT — use como quiser.
