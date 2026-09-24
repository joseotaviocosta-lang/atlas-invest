# ADR-104 — Daily Price Resolution Semantics

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3D

## Contexto

`requestedDate` pode ser sábado/feriado sem `close`; usar preço futuro vaza look-ahead.

## Decisão

- **EXACT:** `priceDate === requestedDate`.
- **PREVIOUS_TRADING_DAY:** último `close` em ou antes de `requestedDate` dentro de `maxLookback` 7 dias, `resolution: PREVIOUS_TRADING_DAY`, `priceDate < requestedDate`.
- **No future leakage:** nunca usa `price` posterior (`2026-01-16` falta + `2026-01-19` existe → `2026-01-16` é `UNAVAILABLE`).
- **Max lookback:** 7 dias; fora → `UNAVAILABLE` (`HISTORICAL_PRICE_NOT_FOUND`).
- **Raw close:** `close` é raw (não adjusted); `Portfolio Engine` já corrige `quantity` em `SPLIT/BONUS`, evitar dupla correção (ADR-048/049).

## Consequências

- `getDailyPrice` determinístico, `InMemoryHistoricalPriceCache` com `hits`.
- Testes: `EXACT`, `weekend Friday`, `no future`, `max lookback`.
