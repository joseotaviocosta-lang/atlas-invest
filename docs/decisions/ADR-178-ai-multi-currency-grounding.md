# ADR-178 — AI Multi-Currency Grounding Boundary

## Status

Approved (Phase 3Q)

## Context

Project Atlas strictly segregates currencies (BRL, USD) in the absence of explicit, historical FX conversion rates. Summing BRL and USD into a naive single numeric figure is mathematically invalid and financially misleading. Future AI models must not invent exchange rates or aggregate multi-currency portfolios into a single global total.

## Decision

1. **Currency Segregation**: Grounding facts are strictly partitioned by currency scope (`scope: "BRL"`, `scope: "USD"`).
2. **No Implicit FX**: `@atlas/ai-engine` does not perform foreign exchange conversion or calculate cross-currency totals.
3. **Absence of Global Monetary Fact**: In multi-currency portfolios, no fact named `TOTAL_MARKET_VALUE` or global currency-free amount is emitted.
4. **Explicit Multi-Currency Limitation**: When multiple currencies are detected, a limitation with code `MULTI_CURRENCY_NO_FX` and scope `PORTFOLIO` is appended.
5. **Structural Benchmark Non-Applicability**: Domestic benchmarks (IBOV, CDI) are structurally marked as `UNSUPPORTED` for non-BRL currencies, emitting `USD_BENCHMARK_UNSUPPORTED` and `USD_RISK_FREE_PROXY_UNSUPPORTED` limitations.

## Consequences

- Prevents LLMs from producing nonsensical currency conversions (e.g., adding USD 100 to BRL 100 to claim R$ 200).
- Factual transparency about multi-currency portfolio structure.
