# ADR-125 — Benchmark Series Alignment

**Status:** Accepted — 2026-09-21 (Fase 3H)
**Context:** The chart aligns portfolio TWR with one benchmark (IBOV or CDI)
on a common display timeline, but each series has native semantics that must
not be mixed.

**Decision:**

- Portfolio, IBOV and CDI keep their own internal calendars; the server emits
  aligned `{ date, portfolioReturn, benchmarkReturn }` points per display date.
- **IBOV** (`PRICE_INDEX`): point = `level(D)/startLevel − 1` with the start
  anchor resolved once via `getObservation` (previous-trading-day fallback,
  never future leakage). Start point is exactly `"0"`.
- **CDI** (`RATE_SERIES`): point = product of `DAILY_PERCENT` factors over
  `(start, D]` minus 1 (so `1%+1% = 2.01%`); never previous-trading-day
  lookup, never `end/start − 1`. Start point is exactly `"0"` (empty interval).
- One benchmark at a time (same UX as 3F/3G); `USD` (and any non-BRL
  currency) gets `benchmark: null` — no FX, no cross-currency comparison.
- Missing benchmark values are `null` (gaps allowed per-point); final
  benchmark point equals the `/performance` benchmark return.
- Series-level benchmark status is `PARTIAL` when the portfolio series is
  partial, even if the benchmark itself is complete — partial is never
  labelled complete.

**Consequences:** Native semantics preserved; comparison stays TWR-based in
p.p. on the summary endpoint, while the chart shows both cumulative paths.
