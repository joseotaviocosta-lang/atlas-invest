# ADR-107 — Historical Price Persistence and Cache

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3D

## Contexto

`historical daily close` é estável, mas `TWR` pede múltiplas datas por ativo.

## Decisão

- **Cache:** `InMemoryHistoricalPriceCache` (`Map<asset::date, HistoricalMarketPrice>`) com `deterministic key`, `hits` evita `provider.getDailyPrice` (testado `hit avoids provider call`).
- **Persistence audit:** `historical_market_prices` (`assetId`, `priceDate`, `price NUMERIC(38,18)`, `currency`, `source`, `createdAt`, `UNIQUE(assetId,priceDate,source)`, `decimal.toString()` exato, `ON CONFLICT DO NOTHING` idempotente). 3D não constrói warehouse; persistência sob demanda, `InMemory` para testes, `TRUNCATE` em `tests/database/setup.ts` se tabela existir.
- **Idempotency:** mesmo preço reimportado não duplica.

## Consequências

- `range fetch` preferido (`getDailyPrices`) com `max 5 anos`, dedup concorrente não obrigatório para 3D.
