# ADR-159 — Scenario Engine Boundary

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** Stress testing applies hypothetical deterministic shocks. This is a
different domain from statistical historical risk (volatility, VaR, drawdown,
Beta). Mixing them would blur "observed history" with "what-if".

**Decision:** Create a separate pure package `@atlas/scenario-engine` `0.1.0`.

- The Scenario Engine is pure, deterministic, zero-I/O (no fetch, no
  Prisma, no Nest, no React), depends only on public `@atlas/domain`
  primitives, and returns frozen outputs. It never mutates the ledger,
  portfolio state, or its inputs.
- The statistical `@atlas/risk-engine` and `@atlas/portfolio-engine` are
  untouched and never import the scenario engine.
- `RunPortfolioScenarioUseCase` in the API builds a market-value snapshot
  (reusing the valuation pipeline) and delegates the transformation to the
  scenario engine. Benchmark shocks reuse the 3K historical portfolio Beta.
- No persistence: scenario runs are stateless what-if computations.

**Consequences:** A clear separation between statistical risk and hypothetical
scenario analysis; scenario runs can never corrupt the ledger.
