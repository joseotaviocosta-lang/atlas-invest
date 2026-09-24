# ADR-098 — Performance Engine Boundary

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3C

## Contexto

Valuation responde "quanto vale agora" (`quantity × quote`). Performance responde "quanto retornou no período" (TWR/XIRR). Misturar confunde custo com mercado e current com histórico.

## Decisão

`performance-engine@0.1.0` é camada pura, determinística, sem I/O, sem `market-data` adapter, sem `portfolio-engine` internals, sem `API`/`database`/`UI`:
`PerformanceObservation + PerformanceCashFlow + Period → PortfolioPerformance`.

- `Portfolio Engine` (ledger) e `Valuation` (current market value) permanecem FROZEN e separados.
- `Application layer` converte `read-models` em inputs canônicos (`DEPOSIT/WITHDRAWAL` como external).
- `current quote` nunca reusado como histórico; `cost` nunca como `marketValue` histórico.

## Consequências

- Engine testável com `LocalDate`/`Money` exatos, `InMemory` observations, zero rede.
- `GET /performance` retorna `UNAVAILABLE` enquanto sem `historical valuations`, sem inventar.
