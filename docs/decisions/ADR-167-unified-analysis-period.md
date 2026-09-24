# ADR-167 — Unified Analysis Period

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** The summary combines performance, benchmarks, risk,
risk-adjusted, relative-risk, active-performance and tail-risk. Each must refer
to the SAME period or the reading is meaningless.

**Decision:** The summary resolves ONE immutable effective period
(`{ startDate, endDate }`) once and passes it to every historical block.

- Default: `endDate = today`, `startDate = endDate − 365 days`.
- `startDate`/`endDate` optional; `start ≤ end`; `end ≤ today`; max range
  5×366 days; inception clamp mirrors 3E–3O.
- No component may silently use a different period.
- Current-only data (the market-value snapshot) is anchored at `effectiveEnd`
  and explicitly distinguished from PERIOD metrics (ADR-169).

**Consequences:** Period drift is structurally impossible within one summary.
