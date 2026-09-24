# Portfolio AI Grounding Contract (v1)

Contract: `PORTFOLIO_AI_GROUNDING_CONTEXT_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3Q`  
Status: `APPROVED`

---

## 1. Overview and Purpose

The **Portfolio AI Grounding Context** is the formal, versioned, and immutable boundary through which portfolio financial data can eventually be supplied to an AI model or LLM agent.

It ensures that:

1. **AI Generation $\neq$ AI Grounding**: Phase 3Q does not invoke any LLM, prompt, or external model provider.
2. **Approved Read Models as Source of Truth**: The grounding context is derived exclusively from the approved `PortfolioIntelligenceSummary` (Phase 3P). It never accesses raw ledgers, raw transactions, or Prisma models.
3. **No Recalculation**: The grounding builder only transports precomputed, approved metrics. It never calculates TWR, XIRR, benchmark differences, volatility, beta, drawdown, VaR, or scenario impacts.
4. **Exact Decimal Preservation**: All numeric values are transported verbatim as decimal strings (e.g. `"3.999999999999999999"`), preventing JavaScript IEEE 754 precision loss.
5. **Deterministic Ordering and Bounded Size**: Facts have stable, deterministic identifiers and canonical category ordering. The context size is bounded to $O(\text{metrics} \times \text{currencies})$, independent of the number of positions or transactions.
6. **Data Minimization and Zero Secrets**: The context strictly excludes authentication tokens, passwords, sessions, PII (CPF, email, address), and raw transaction histories.

---

## 2. Top-Level Schema

```typescript
export interface PortfolioAiGroundingContextV1 {
  readonly schemaVersion: '1';
  readonly portfolioId: string;
  readonly generatedAt: string; // ISO 8601 technical timestamp (injectable)
  readonly analysisPeriod: {
    readonly startDate: string; // YYYY-MM-DD (effective start from 3P)
    readonly endDate: string; // YYYY-MM-DD (effective end from 3P)
  };
  readonly asOf: string; // YYYY-MM-DD (point-in-time calculation date)
  readonly currencies: readonly string[]; // e.g. ["BRL"] or ["BRL", "USD"]
  readonly facts: readonly GroundedFinancialFact[];
  readonly observations: readonly PortfolioObservation[];
  readonly dataQuality: GroundedDataQuality;
  readonly limitations: readonly GroundedLimitation[];
  readonly capabilities: GroundingCapabilities;
}
```

---

## 3. Grounded Financial Fact Model

Each fact represents an atomic, verifiable financial observation:

```typescript
export interface GroundedFinancialFact {
  readonly factId: string; // e.g. "BRL.PERFORMANCE.TWR"
  readonly category: GroundedFactCategory; // OVERVIEW, PERFORMANCE, BENCHMARK, etc.
  readonly scope: string; // "BRL", "USD", or "PORTFOLIO"
  readonly metric: string; // Canonical metric code
  readonly value: string | null; // Decimal string or null if unavailable
  readonly unit: GroundedFactUnit; // MONEY, PERCENTAGE, PERCENTAGE_POINTS, RATIO, COUNT
  readonly currency?: string; // Required when unit is MONEY
  readonly nature: GroundedFactNature; // POINT_IN_TIME, PERIOD, HISTORICAL, HYPOTHETICAL
  readonly status: GroundedFactStatus; // AVAILABLE, PARTIAL, UNAVAILABLE
  readonly reason?: string | null; // Canonical reason code if UNAVAILABLE
  readonly period?: {
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly asOf?: string;
  readonly source: GroundedFactSource;
}
```

### Fact Categories & Ordering

Facts are ordered deterministically by category:

1. `OVERVIEW`
2. `PERFORMANCE`
3. `BENCHMARK`
4. `RISK`
5. `RISK_ADJUSTED`
6. `RELATIVE_RISK`
7. `ACTIVE_PERFORMANCE`
8. `TAIL_RISK`
9. `SCENARIO`

Within each category, facts are sorted by `scope ASC` (currency), then `factId ASC`.

### Canonical Semantic Natures

- `POINT_IN_TIME`: Overview market values, position counts, current drawdown, scenario base/stressed values.
- `PERIOD`: Returns (TWR, XIRR), benchmark returns, Sharpe, Sortino, Beta, Alpha, Information Ratio.
- `HISTORICAL`: Realized volatility, maximum drawdown, downside deviation, semideviation, VaR, CVaR.
- `HYPOTHETICAL`: Stressed values, absolute impacts, percentage impacts of scenario shocks.

### Canonical Units

- `MONEY`: Absolute monetary amounts (with explicit `currency`).
- `PERCENTAGE`: Compound or rate returns, volatility, drawdowns, VaR (%).
- `PERCENTAGE_POINTS`: Differences between percentages (e.g. portfolio return minus benchmark return).
- `RATIO`: Dimensionless metrics (Sharpe, Sortino, Beta, Correlation, Information Ratio, Treynor).
- `COUNT`: Integer counts (positions, observations).

---

## 4. Source Traceability

Every fact carries a structured pointer to its source field in the `PortfolioIntelligenceSummary`:

```typescript
export interface GroundedFactSource {
  readonly contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1';
  readonly path: string; // e.g. "currencies.BRL.performance.twr"
}
```

No external citations, fabricated URLs, or unverified documents are permitted.

---

## 5. Declarative Capabilities & Question Safety

The grounding context explicitly specifies allowable cognitive boundaries for future AI systems:

```typescript
export interface GroundingCapabilities {
  readonly canExplainPortfolioFacts: boolean; // true
  readonly canExplainHistoricalPerformance: boolean; // true
  readonly canExplainHistoricalRisk: boolean; // true
  readonly canExplainScenarioResults: boolean; // true
  readonly canRecommendTrades: boolean; // false
  readonly canPredictReturns: boolean; // false
  readonly canCalculateNewMetrics: boolean; // false
}
```

---

## 6. Multi-Currency Segregation

- Multi-currency portfolios maintain completely segregated facts per currency (`scope: "BRL"`, `scope: "USD"`).
- No global monetary total is ever produced without an explicit FX rate engine.
- Structural limitations (e.g. domestic benchmarks IBOV/CDI applied to USD) are tagged as `USD_BENCHMARK_UNSUPPORTED` in `limitations[]`.
