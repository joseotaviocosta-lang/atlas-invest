# ADR-197: Temporal and Category Nature Consistency

## Status

Approved (Fase 3T)

## Contexto

Métricas financeiras possuem naturezas semânticas distintas: algumas são históricas observadas (ex: volatilidade realizada, retornos passados, drawdowns históricos), outras são simulações hipotéticas condicionais (ex: testes de estresse de choque macroeconômico). Misturar essas naturezas ou classificar um teste de estresse como rentabilidade esperada constitui grave desinformação financeira.

## Decisão

1. A política de validação de afirmações (`CLAIM_CATEGORY_COMPATIBILITY`) estabelece compatibilidade estrita entre o tipo de afirmação (`GroundedClaimType`) e as categorias de fatos permitidas (`GroundedFactCategory`):
   - `FACTUAL_METRIC`: compatível apenas com `PORTFOLIO_VALUATION`, `PORTFOLIO_PERFORMANCE`, `BENCHMARK_COMPARISON`, `ACTIVE_PERFORMANCE`, `ROLLING_PERFORMANCE`, `ALLOCATION_BREAKDOWN`, `PORTFOLIO_INTELLIGENCE`, `DATA_QUALITY`.
   - `BENCHMARK_COMPARISON`: compatível com `BENCHMARK_COMPARISON`, `ACTIVE_PERFORMANCE`, `PORTFOLIO_PERFORMANCE`.
   - `RISK_EXPLANATION`: compatível com `RISK_METRICS`, `RELATIVE_RISK`, `TAIL_RISK`.
   - `SCENARIO_EXPLANATION`: compatível exclusivamente com `SCENARIO_ANALYSIS`.
   - `DATA_QUALITY`: compatível com `DATA_QUALITY` e `PORTFOLIO_INTELLIGENCE`.
   - `LIMITATION`: compatível com qualquer categoria informativa de limitação.
2. Invariante de Simulação Hipotética: Fatos da categoria `SCENARIO_ANALYSIS` (choque de CDI, choque cambial, estresse IBOV) são estritamente hipotéticos. Eles só podem ser citados sob o tipo `SCENARIO_EXPLANATION` e nunca como fatos observados (`FACTUAL_METRIC`) ou de risco realizado (`RISK_EXPLANATION`).
3. Invariante de Risco Extremo: Fatos da categoria `TAIL_RISK` e `RISK_METRICS` representam métricas estatísticas históricas e não podem ser citados como cenários hipotéticos ou retornos garantidos.

## Consequências

- Rigor conceitual garantido por tipagem e validação em tempo de execução.
- Impossibilidade de o modelo apresentar cenários de simulação como resultados reais ou rentabilidade futura.
