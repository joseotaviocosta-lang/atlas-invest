# Historical Market Data Contract v1 — Fase 3D

**Status:** FOUNDATION — 2026-09-20
**Version:** `0.1.0`
**Provider:** `market-data` `HistoricalMarketDataProvider` (`IN_MEMORY` deterministic, `Stooq` future)
**Depends:** `@atlas/domain` (`LocalDate`, `Money`, `Currency`)

## 1. Contract

```ts
HistoricalMarketPrice {
  assetId: string
  date: LocalDate          // civil YYYY-MM-DD, identidade do candle diário
  close: Money             // daily close, string decimal exata, ex: "30.00" BRL
  currency: Currency
  source: MarketDataSource // IN_MEMORY | STOOQ
  status: 'EXACT' | 'PREVIOUS_TRADING_DAY' | 'UNAVAILABLE'
}
ResolvedHistoricalPrice {
  requestedDate: LocalDate
  priceDate: LocalDate
  price: HistoricalMarketPrice
  resolution: 'EXACT' | 'PREVIOUS_TRADING_DAY'
}

interface HistoricalMarketDataProvider {
  getDailyPrice(assetRef: MarketDataAssetRef, date: LocalDate): Promise<HistoricalMarketPrice>
  getDailyPrices(assetRef: MarketDataAssetRef, from: LocalDate, to: LocalDate): Promise<HistoricalMarketPrice[]>
}
```

**LocalDate** é identidade do candle (não `Instant` com timezone). `close` é `Money` exato, nunca `number`.

## 2. Daily Close & Raw Semantics

- Para 3D, `close` é **raw close** (não ajustado). `Portfolio Engine` já ajusta `quantity` via `SPLIT`/`BONUS` (ADR-048/049), então usar `adjusted close` duplicaria correção. Documentado e testado com `split` quantity vs price coerente.
- `adjusted close` só seria usado se `quantity` não fosse ajustada — provado matematicamente como incorreto para nosso modelo; por isso `raw` é canônico.

## 3. Symbol Resolution

Reusa `resolveMarketDataSymbol` da 3A (`AssetId` canônico, `providerSymbol` é metadata). `IN_MEMORY` para `B3` → `PETR4`, `STOOQ` → `PETR4.SA`.

## 4. Date Resolution

- **EXACT:** `priceDate === requestedDate` e existe `close` para `ticker+exchange+date`.
- **PREVIOUS_TRADING_DAY:** se `requestedDate` for fim de semana/feriado sem `close`, usa último `close` em ou antes de `requestedDate` dentro de `maxLookback` (default 7 dias). `priceDate < requestedDate`, `resolution: PREVIOUS_TRADING_DAY`.
- **No future leakage:** nunca usa `price` posterior à `requestedDate` (crítico). `2026-01-16` (sexta) faltando e `2026-01-19` (segunda) existe → `2026-01-16` retorna `UNAVAILABLE`, não `2026-01-19`.
- **Max lookback:** 7 dias (fim de semana + feriado prolongado). Fora da janela → `UNAVAILABLE` (`HISTORICAL_PRICE_NOT_FOUND`). Não anda semanas silenciosamente.

## 5. Range

`getDailyPrices(from,to)` itera `from→to` e retorna só `EXACT` (evita duplicatas de `PREVIOUS`). `from>to` → `HISTORICAL_INVALID_RESPONSE`. Range >5 anos → `HISTORICAL_RANGE_TOO_LARGE`.

## 6. Cache

`InMemoryHistoricalPriceCache` (`Map<asset::exchange::date, HistoricalMarketPrice>`) com `hits/misses`, `deterministic key`. TTL longo (preço histórico estável) — `hits` evita `provider.getDailyPrice`. Para `Stooq` futuro, cache é obrigatório para `TWR` que pede múltiplas datas por ativo sem N×D requests.

## 7. Persistence (Audit)

**Tabela auditada:** `historical_market_prices` com `assetId`, `priceDate: LocalDate`, `price: NUMERIC(38,18)`, `currency`, `source`, `createdAt`. `UNIQUE(assetId, priceDate, source)`, idempotente (`ON CONFLICT DO NOTHING`), `decimal.toString()` exato. 3D não constrói data warehouse — persistência sob demanda suficiente; `InMemory` para testes, futuro `Stooq` batch range fetch com `getDailyPrices`.

## 8. Errors

Canônicos: `HISTORICAL_PRICE_NOT_FOUND`, `HISTORICAL_PROVIDER_UNAVAILABLE`, `HISTORICAL_INVALID_RESPONSE`, `HISTORICAL_UNSUPPORTED_ASSET`, `HISTORICAL_RANGE_TOO_LARGE` → normalizados para `MarketDataError` (`MARKET_DATA.SYMBOL_NOT_FOUND` etc., `retryable` flag). Raw `Stooq` CSV nunca vaza.

## 9. Version

`market-data@0.1.0` estendido, `historical@0.1.0`, `performance-engine@0.1.0` consome `HistoricalMarketPrice` via `HistoricalValuationBuilder`.
