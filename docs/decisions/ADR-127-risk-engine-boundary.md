# ADR-127 — Risk Engine Boundary

**Status:** Accepted — 2026-09-21 (Fase 3I)
**Context:** Volatility and drawdown need a home that is neither the replay
engine (ledger → positions), nor the performance engine (returns), nor the
UI (rendering). Mixing risk math into any of them would blur frozen
contracts.

**Decision:** Create `@atlas/risk-engine@0.1.0` with a single responsibility:
risk math over TWR-derived return trajectories.

- Performance Engine: return — TWR/XIRR/performance series (unchanged).
- Risk Engine: risk — realized volatility, drawdown, future risk metrics.
- `portfolio-engine@1.0.0-rc.1` imports neither; `benchmark-engine@0.2.0`
  unchanged; `valuation-engine@0.1.0` unchanged.
- The engine is pure, deterministic, zero I/O (no fetch/Prisma/React/Nest),
  `Object.freeze` outputs, and depends only on public `@atlas/domain`
  primitives. `DecimalValue`/raw `Decimal` are never imported or re-exported
  (a previously fixed encapsulation defect that must not regress).
- Inputs are pure financial data (`RiskSubperiodReturn`), never view models
  or chart samples.

**Consequences:** Future metrics (Sharpe and beyond) have a clear home that
does not disturb frozen return contracts.
