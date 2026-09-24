# ADR-105 — Historical Valuation Observation Pipeline

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3D

## Contexto

`TWR/XIRR` precisam de `PerformanceObservation { date, value, currency }` auditáveis, não de `cost` ou `current quote`.

## Decisão

`HistoricalValuationBuilder` ( `apps/api` ):

```
portfolioId, date: LocalDate, currency
→ replayPortfolio(asOf=date) → posições abertas
→ HistoricalMarketDataProvider.getDailyPrice per AssetId
→ ValuationEngine quantity×close (reuso, sem duplicar currency mismatch/partial)
→ sum per currency → PerformanceObservation
```

- `current quote` nunca reusado historicamente.
- `cost` nunca como `marketValue`.
- `Valuation Engine` reusado quando possível; `Partial` se alguma posição sem preço (não inventa).
- `transfer` cross-account net 0 consolidado.

## Consequências

- `buildObservation` server-side, `partial` explícito, `multi-currency` segregado, sem FX.
