# ADR-094 — Valuation Separated from Portfolio Engine and Market Data

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3B

## Contexto

Portfolio Engine (ledger + replay puro, 40 dígitos) e Market Data (quotes exatos, stale, cache) são ambos FROZEN. Misturar preço dentro do engine contaminaria determinismo; colocar valuation dentro do market-data acoplaria domínio.

## Decisão

Criar camada `valuation-engine` (`@atlas/valuation-engine@0.1.0`) orquestradora pura:
`PortfolioState + Map<AssetId, MarketQuote> → PortfolioValuation`.

- Engine fornece `quantity, totalCost, currency, costBasisStatus` (frozen).
- Market Data fornece `MarketQuote` canônico (price, currency, freshness).
- Valuation calcula `marketValue = quantity × price`, `unrealized`, `%`, `totalsByCurrency`, `completeness`, sem I/O, sem mutação, com `Object.freeze`.
- Dependência: `valuation-engine → domain`; `API → valuation-engine + market-data + portfolio-engine`; nunca `portfolio-engine → market-data`.

## Consequências

- Engine permanece `1.0.0-rc.1` sem alterações (contrato ledger FROZEN).
- Valuation testável isoladamente com `InMemoryMarketDataProvider` e fixtures decimais exatas.
- UI consome `GET /valuation` pronto, zero math.
