# ADR-122 — Performance Series Boundary

**Status:** Accepted — 2026-09-21 (Fase 3H)
**Context:** The Atlas computes summary TWR/XIRR per period but has no time-series
representation. The chart must show cumulative performance without duplicating
engine logic in clients or fetching prices in engines.

**Decision:** The performance series is a derived performance read model:

```
Historical valuations (per calculation date, per currency)
+ external cash flows (DEPOSIT/WITHDRAWAL)
  → performance-engine@0.2.0 `calculatePerformanceSeries` (pure, zero I/O)
  → aligned portfolio/benchmark display points
  → GET /api/v1/portfolios/:id/performance/series
  → client renders only
```

- `performance-engine` remains zero I/O: it receives observations/flows/dates,
  never reads ledger, market-data, Prisma, or network.
- `benchmark-engine` stays 0.2.0: IBOV/CDI per-point values reuse
  `calculateBenchmarkReturn` / `calculateRateBenchmarkReturn` in the
  application layer; no new engine math was needed.
- `portfolio-engine` (1.0.0-rc.1) and `valuation-engine` (0.1.0) unchanged.
- The series endpoint is additive; `GET /performance` is untouched (frozen).

**Consequences:** All cumulative math is server-side and auditable; clients
receive ready-to-render decimal strings.
