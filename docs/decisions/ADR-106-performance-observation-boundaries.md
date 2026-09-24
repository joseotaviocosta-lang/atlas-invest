# ADR-106 — Performance Observation Boundaries

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3D

## Contexto

`TWR` não precisa de valuation diário.

## Decisão

`TWR` gera `observations` em:

- `period.start`
- `period.end`
- `external cash flow boundaries` (`DEPOSIT`/`WITHDRAWAL` no período)

Respeita `ADR-100` (flow no fim do dia, não redefinido). `XIRR` precisa só `deposits/withdrawals` + `ending liquidation value`. `observationCount` = `2 + flowDates`, não `days × assets` (evita `O(days×assets)`). `period.end = today` usa último `close` (não `live` silencioso; `PARTIAL` se `today` sem `EOD`).

## Consequências

- `HistoricalValuationBuilder.buildObservationsForPeriod` gera só dates necessárias.
- `UNAVAILABLE` preservado quando data faltante.
