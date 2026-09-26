# ADR-216: Canonical History Authority in AI Timeline Grounding

## Status

Aceito (Fase 3X)

## Contexto

A inteligência sobre o histórico patrimonial e eventos passados (compras, vendas, proventos, aportes, desdobramentos) deve refletir com exatidão a verdade contábil do portfólio. Permitir que o motor de IA interprete transações de forma independente ou execute reconciliações contábeis paralelas criaria divergências e riscos financeiros.

## Decisão

1. **Autoridade Canônica Exclusiva:**
   - O grounding temporal e de eventos consome exclusivamente as projeções canônicas produzidas por `PortfolioReadApi`, `PortfolioReplayEngine` e `PortfolioReadModelMapper`.
   - É proibido criar um segundo interpretador de ledger ou motor de replay financeiro no `@atlas/ai-engine`.
2. **Zero Cálculos Financeiros na IA:**
   - A IA nunca recalcula ganhos realizados, somas de proventos ou saldos médios. Todos os números expostos vêm pré-computados pelo motor de replay.

## Consequências

- Consistência contábil e histórica absoluta entre as telas do sistema e as respostas da IA.
- Reutilização das regras congeladas da API de leitura do portfólio.
