# ADR-108 — Performance UX Boundary

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3E

## Contexto

Performance `TWR/XIRR` são calculados server-side. UI não deve recalcular.

## Decisão

`Web`/`Mobile` consomem `GET /performance` pronto, via `PortfolioPerformanceViewModel` que só formata (`formatPercentage`, `formatLocalDateDisplay`, labels, status) e estrutura `sections`. **Nunca** `calculateTWR`, `Math.pow`, `parseFloat` para performance, `annualize`, `combine currencies`.

## Consequências

- `tests/architecture/no-client-performance.test.ts` guarda `no-client-performance`.
- `view-model` testado para `AVAILABLE`/`PARTIAL`/`UNAVAILABLE` sem math.
