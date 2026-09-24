# ADR-177 — AI Capability Boundary & Guardrails

## Status

Approved (Phase 3Q)

## Context

Language models frequently generate investment advice, buy/sell recommendations, or future return forecasts when prompted open-endedly. In regulatory contexts (such as CVM in Brazil), uncertified automated systems must not provide investment recommendations or financial forecasting. Furthermore, AI must not compute new mathematical formulas dynamically.

## Decision

1. **Explicit Declarative Capabilities**: Every `PortfolioAiGroundingContextV1` includes an immutable `capabilities` object defining permissible cognitive actions:
   - `canExplainPortfolioFacts: true`: Explaining existing historical facts, metrics, and relationships is allowed.
   - `canExplainHistoricalPerformance: true`: Explaining historical returns (TWR, XIRR) is allowed.
   - `canExplainHistoricalRisk: true`: Explaining historical volatility, drawdowns, and tail risk is allowed.
   - `canExplainScenarioResults: true`: Explaining deterministic hypothetical scenario impacts is allowed.
   - `canRecommendTrades: false`: Recommending buys, sells, or allocation targets is strictly forbidden.
   - `canPredictReturns: false`: Forecasting future asset prices or portfolio returns is strictly forbidden.
   - `canCalculateNewMetrics: false`: Creating arbitrary financial ratios not present in the grounding facts is strictly forbidden.
2. **Deterministic Limitations**: In addition to capabilities, `limitations[]` lists all active structural and data quality constraints (e.g. `MULTI_CURRENCY_NO_FX`, `USD_BENCHMARK_UNSUPPORTED`, `PARTIAL_VALUATION`).

## Consequences

- Upstream adapters and future prompt templates can inspect capabilities to automatically reject user intents that ask for trade recommendations or return predictions.
- Adherence to financial regulatory compliance and user safety.
