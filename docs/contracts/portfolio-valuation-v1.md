# Portfolio Valuation Contract v1 — Fase 3B

**Status:** FROZEN — 2026-09-20
**Version:** `0.1.0`
**Engine:** `@atlas/valuation-engine` (`VALUATION_VERSION=0.1.0`)
**Depends:** `Portfolio Engine 1.0.0-rc.1` (ledger + replay) + `Market Data Provider v1` (quotes)

## 1. Boundary

```
PortfolioState (quantity, totalCost, costBasisStatus, currency)
  + MarketQuotes (price, currency, freshness, status)
  ↓ valuePortfolio (pure, deterministic, zero float, frozen)
PortfolioValuation
```

- `Portfolio Engine` **never** importa `Market Data`. `Market Data` **never** conhece portfolios.
- `valuation-engine` é orquestrador puro: `domain` primitives (`Money`, `Quantity`, `Percentage`) com 40 dígitos, `ROUND_HALF_UP`, sem `number`/`parseFloat`/`+price`.
- UI **nunca** faz `quantity × price`, somas ou percentuais. Tudo vem pronto da API (`GET /api/v1/portfolios/:id/valuation`).

## 2. Endpoint

```
GET /api/v1/portfolios/:portfolioId/valuation
Auth: JWT required, ownership enforced (404 NOT_FOUND cross-user, nunca 403)
No query: current-only. `asOf` é proibido (422 se enviado) — Fase 3B não faz valuation histórico.
Cache: reusa `InMemoryQuoteCache` da 3A (TTL 60s), `MarketDataService` com `maxBatch 100`.
```

**Envelope:** `{ data: PortfolioValuationReadModel }`

```ts
PortfolioValuationReadModel {
  portfolioId, asOf: null, engineVersion: '1.0.0-rc.1', valuationVersion: '0.1.0',
  positions: PositionValuation[], accounts: AccountValuation[],
  totalsByCurrency: Record<Currency, CurrencyValuationTotals>,
  completeness: 'COMPLETE'|'PARTIAL_QUOTES'|'PARTIAL_COST'|'PARTIAL_CURRENCY'|'PARTIAL_STALE'|'PARTIAL_MULTIPLE',
  summary: { totalPositions, valuedPositions, unavailablePositions, incompleteCostPositions, stalePositions, mismatchPositions, currencies: Currency[] },
  quoteSummary: { totalQuotesRequested, quotesAvailable, quotesUnavailable, quotesStale }
}
PositionValuation {
  assetId, accountId: string|null, ticker, assetType, quantity: string, currency,
  totalCost: {amount,currency}|null, averageCost: {amount,currency}|null, costBasisStatus: 'KNOWN'|'INCOMPLETE',
  quote: { assetId, price, currency, asOf, receivedAt, marketTime?, source, status, freshness, providerSymbol } | null,
  marketValue: {amount,currency}|null, unrealizedGainLoss: {amount,currency}|null, unrealizedGainLossPercent: string|null,
  status: 'VALUED'|'QUOTE_UNAVAILABLE'|'QUOTE_STALE'|'COST_INCOMPLETE'|'CURRENCY_MISMATCH'|'UNSUPPORTED_ASSET',
  quoteFreshness: 'FRESH'|'STALE'|'UNKNOWN'|null, quoteStatus: QuoteStatus|null
}
CurrencyValuationTotals {
  currency, marketValue: {amount,currency}, knownCost: {amount,currency},
  unrealizedGainLoss: {amount,currency}|null, unrealizedGainLossPercent: string|null, valuedPositionsCount
}
```

**Serialização:** todos `Money`/`Quantity`/`Percentage` → `string` decimal exata, nunca `number`. `null` vs `0`: custo desconhecido → `null`, nunca `"0"`. Inteiros `valuedPositions` etc. são `number`.

## 3. Formulas (canônicas, sem float)

```
marketValue = Quantity(quantity) × Money(price)  // Money.multiply(quantityString) em BRL/USD nativo
unrealized = marketValue - totalCost            // somente se marketValue≠null && totalCost≠null && mesma moeda
unrealizedPercent = unrealized / totalCost × 100 // somente se totalCost>0, senão null (não dividir por zero)
```

- `INCOMPLETE` → `marketValue` pode existir, mas `unrealized*` = `null` (nunca assumir 0).
- `QUOTE_UNAVAILABLE` → `marketValue=null`.
- `CURRENCY_MISMATCH` (quote currency ≠ position currency) → `marketValue=null`, sem conversão FX.
- `QUOTE_STALE` → `marketValue` valuado, mas `status=QUOTE_STALE`, `freshness=STALE` visível (nunca mascarado como FRESH).

## 4. Multi-Moeda

`BRL` e `USD` **nunca** somados. `totalsByCurrency` segregado: `BRL: { marketValue, knownCost, unrealized }`, `USD: { ... }`. Nenhum `patrimônio total` cross-currency. `currencies: ['BRL','USD']`.

## 5. Partial Valuation

```
10 posições: 8 com quote, 2 sem → valuedPositions 8, unavailable 2, totals só sobre 8, completeness PARTIAL_QUOTES
Cost incomplete: valuation com marketValue mas sem unrealized → PARTIAL_COST
Currency mismatch: → PARTIAL_CURRENCY
Stale: → PARTIAL_STALE
Múltiplos: → PARTIAL_MULTIPLE
COMPLETE: todos valued, custos conhecidos, sem stale/mismatch
```

Falha parcial do provider → `partial` (200 com `unavailable`), falha total → 200 com todos `QUOTE_UNAVAILABLE` ou 500 conforme `MarketDataError` mapeado (mas nunca derruba `GET /state`).

## 6. UX Contract (Web/Mobile)

- Terminologia: `Valor de mercado`, `Custo total conhecido`, `Resultado não realizado` (não `Lucro` quando custo incompleto).
- `QUOTE_UNAVAILABLE`: `Preço atual —`, `Valor de mercado —`.
- `COST_INCOMPLETE`: `Valor de mercado R$ 10.000`, `Custo —`, `Resultado —`.
- `STALE`: badge `Cotação desatualizada` + `status=QUOTE_STALE`.
- `CURRENCY_MISMATCH`: badge `Moeda divergente`.
- Multi-moeda: blocos separados `BRL`/`USD`.
- `asOf` histórico ativo → **valuation oculto** (não mostrar current como se fosse histórico). `GET /valuation` não aceita `asOf`.
- Loading: `Skeleton`; Error: `Não foi possível atualizar valores de mercado.` mas `Portfolio Overview` continua visível (graceful degradation).
- `PositionRow`/`PositionCard` expandem contas com `Valor de mercado` e `Resultado` por conta.

## 7. Provider Internals

`YahooFinanceQuote`, `StooqCsvRow`, `fetch` nunca vazam. Só `MarketQuote` canônico e `MarketDataError` normalizado.

## 8. Anti-Scope

Proibido: `TWR`, `XIRR`, `performance histórica`, `benchmark`, `FX`, `Tax`, `DARF`, `recommendations`, `rebalance`, `historical price chart`.

## 9. Version

`valuation-engine@0.1.0` — depende de `domain@0.1.0`. `Portfolio Engine 1.0.0-rc.1` e `Read API v1` permanecem FROZEN.
