# ADR-114 — Price Index Return Semantics

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3F

## Contexto

Um benchmark como o Ibovespa é um índice de preço: seu retorno decorre da variação do nível do índice
entre duas datas.

## Decisão

```
return = (endLevel / startLevel - 1) × 100
```

- Implementado em `calculateBenchmarkReturn({ benchmarkId, startLevel, endLevel })`.
- `startLevel === 0` é rejeitado.
- Apenas benchmarks `PRICE_INDEX` são aceitos; `RATE_SERIES` lança `UnsupportedBenchmarkTypeError`
  (ver ADR-117).
- Aritmética decimal exata (`DecimalValue`); sem float.
- Resolução de data usa a observação exata ou o dia de negociação anterior dentro de `maxLookback`
  (default 7), com **no future leakage**.

## Consequências

- `IBOV` continua funcionando exatamente como antes da introdução de `RATE_SERIES`.
