# ADR-103 — Historical Market Data Boundary

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3D

## Contexto

`current quote` (live/delayed) e `historical daily close` são temporalidades diferentes. Misturar contratos confunde `MarketDataProvider` (current) com `HistoricalMarketDataProvider` (range).

## Decisão

`Historical prices` separados de `current quotes`:

- `MarketDataProvider.getQuote(s)` → `MarketQuote` (Instant, `price`, `freshness`).
- `HistoricalMarketDataProvider.getDailyPrice(s)` → `HistoricalMarketPrice` (`LocalDate`, `close`).

Ambos reusam `resolveMarketDataSymbol` e `AssetId` canônico, mas tipos (`StooqCsvRow`, `InMemoryHistoricalPrice`) nunca vazam. `performance-engine` não importa `market-data` adapter; `API` orquestra.

## Consequências

- `InMemoryHistoricalMarketDataProvider` determinístico para testes, `Stooq` futuro para B3.
- `historical@0.1.0` com `EXACT`/`PREVIOUS_TRADING_DAY`, sem futuro.
