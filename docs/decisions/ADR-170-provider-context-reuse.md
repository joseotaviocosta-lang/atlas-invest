# ADR-170 — Provider / Context Reuse

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** The summary combines metrics that individually fetch IBOV/CDI and
build a portfolio context. Doing so per card would multiply provider work.

**Decision:** The summary builds ONE shared application-level context and
performs ONE IBOV range fetch and ONE CDI range fetch per request.

- Portfolio replay: 1 per request.
- Performance calculation context: 1 per request.
- IBOV range fetch: ≤ 1; CDI range fetch: ≤ 1.
- Current market-value snapshot: 1 logical per-position pass, reused by the
  summary scenario (`EQUITY_DOWN_10`) — never a second price pass.
- The engines' canonical formulas are reused (never duplicated); the 3P
  orchestration does not call each frozen use case independently, which would
  break the provider budget.
- No Redis; no persisted summary (derived read model).

**Consequences:** The summary is efficient and bounded; `O(n_positions +
n_historical_observations)`, no `O(n²)`.
