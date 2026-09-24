# ADR-102 — Performance Data Availability

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3C

## Contexto

Performance precisa de `historical market valuations`; Atlas ainda só tem `current quotes` e `cost basis`. Inventar via custo ou quote atual distorce.

## Decisão

- **Nunca** usar `cost` como `marketValue` histórico.
- **Nunca** reusar `current quote` retroativamente.
- **Status:** `AVAILABLE` (≥2 obs), `PARTIAL` (algumas moedas indisponíveis), `UNAVAILABLE` (nenhuma), `INSUFFICIENT_DATA` (1 obs), `INVALID_INPUT`.
- `GET /api/v1/portfolios/:id/performance` sempre responde `200` com `dataAvailability: UNAVAILABLE` e `twr/xirr: null` enquanto sem dados, com `period` decimal `YYYY-MM-DD`.
- Futuro `historical prices` virá de snapshots de `valuation` ou broker, não implementado em 3C (apenas contrato + `InMemory` test path).

## Consequências

- Foundation honesta: testes usam `PerformanceObservation` mock, produção retorna `UNAVAILABLE` explicitamente, sem `TWR` fictício.
