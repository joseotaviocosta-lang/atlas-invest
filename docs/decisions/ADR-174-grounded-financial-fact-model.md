# ADR-174 — Grounded Financial Fact Model

## Status

Approved (Phase 3Q)

## Context

A future LLM cannot reliably interpret free-form blobs or nested JSON trees with arbitrary keys. Financial facts require explicit semantic typing, unit clarity, distinction between percentages and percentage points, and clear distinction between historical observations, point-in-time states, and hypothetical scenario outcomes.

## Decision

1. **Atomic Fact Representation**: Every financial metric is modeled as an instance of `GroundedFinancialFact`:
   - `factId`: Human-auditable, stable identifier (e.g. `BRL.OVERVIEW.MARKET_VALUE`, `BRL.PERFORMANCE.TWR`, `BRL.BENCHMARK.IBOV.DIFFERENCE`, `BRL.TAIL.VAR95`). Unique within the grounding context.
   - `category`: Canonical category (`OVERVIEW`, `PERFORMANCE`, `BENCHMARK`, `RISK`, `RISK_ADJUSTED`, `RELATIVE_RISK`, `ACTIVE_PERFORMANCE`, `TAIL_RISK`, `SCENARIO`).
   - `scope`: Currency scope (`BRL`, `USD`, or `PORTFOLIO`).
   - `metric`: Specific metric identifier.
   - `value`: Serialized exact decimal string or `null` if unavailable.
   - `unit`: Exact unit discriminator (`MONEY`, `PERCENTAGE`, `PERCENTAGE_POINTS`, `RATIO`, `COUNT`, `DATE`, `STATUS`, `TEXT_ENUM`).
   - `currency`: Explicit ISO currency code when `unit === 'MONEY'`.
   - `nature`: Semantic temporal nature (`POINT_IN_TIME`, `PERIOD`, `HISTORICAL`, `HYPOTHETICAL`, `STRUCTURAL`).
   - `status`: Availability indicator (`AVAILABLE`, `PARTIAL`, `UNAVAILABLE`).
   - `reason`: Canonical reason code when status is not available.
   - `source`: Structured traceability pointer to the exact path in `PortfolioIntelligenceSummary`.
2. **Canonical Ordering**: Facts are deterministically ordered by category index, then currency scope (`BRL` before `USD`), then fact identifier.
3. **Fail-Closed Uniqueness**: Duplicate `factId` values trigger immediate runtime error.

## Consequences

- The LLM receives clean, unambiguous tokens with explicit units and temporal contexts.
- Differences between percentages (e.g., 4 percentage points) are clearly separated from returns (e.g., 12%), preventing common semantic confusion.
- Hypothetical shocks (e.g., -10% equity decline) cannot be misinterpreted as historical drawdowns or future predictions.
