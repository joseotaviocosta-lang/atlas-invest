# Phase 5Q-B — Review Drill-Down & Historical Evolution

Status: implementation complete, awaiting owner review/push. No B3/CERT work; 5P stack untouched.

## Historical capabilities discovered

| Source             | Verdict                                                                            | Notes                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Valuation asOf     | CURRENT-ONLY (derivable with replay)                                               | use-case has no asOf; engine + `findByAssetDate`/`findRange` support it; not wired (deliberate — see below) |
| Allocation asOf    | CURRENT-ONLY (derivable)                                                           | same replay path; `computePortfolioAllocation` is asOf-agnostic                                             |
| Performance series | HISTORICAL                                                                         | arbitrary range + granularity, per-point portfolio+benchmark, max 400 pts                                   |
| Benchmarks         | HISTORICAL per-point (series) / aggregates (intelligence)                          | gap series reused for drill-down                                                                            |
| Income             | HISTORICAL ledger events                                                           | `type=income` + from/to, monthly bucketing client-side (server paged, capped)                               |
| Integration runs   | HISTORICAL (paged, recency window 200)                                             | run rows carry status/counts/reconciliation; no second store                                                |
| Market quotes      | HISTORICAL at repository (`findByAssetDate`/`findRange`); latest-only at use-cases | provider for future asOf work, unused by review                                                             |
| Charts             | custom SVG only (web + mobile); no chart lib                                       | gap history reuses `PerformanceSeriesChart`                                                                 |

Chosen approach: history only where a bounded, existing path serves it (series, income history, recent runs). Valuation/allocation history would require per-date replays + asOf plumbing through shared use-cases — explicitly documented instead of built (STEP 13/26).

## Period semantics

Presets only: 1M (30d) / 3M (91d) / 6M (182d) / YTD / 1A (365d, default) / INCEPTION (bounded trailing 1825d; use-cases clamp to ledger inception and their own caps). No CUSTOM in v1. `?period=` query, default `1A`; unknown values 400 via strict Zod enum. Default preserves 5Q-A behavior exactly (overview passes no dates; detail defaults resolve to trailing 365d like the intelligence default).

## Signal detail model

`GET /api/v1/portfolios/:id/review/signals/:code?period=` → `{ code, state: ACTIVE|NOT_ACTIVE, period, generatedAt, marketDataAsOf, evidence|null, history, limitations[], action, dataUsed }`. Unknown codes 404 (anti-enumeration); inactive signals return NOT_ACTIVE with whatever history is honest (stable deep links). No persistence (`+0` migrations).

## Historical evidence

- PERFORMANCE_BENCHMARK_GAP: per-point portfolio/benchmark/gap series + worst gap + first-below date + neutral trend. Gaps computed from decimal strings (string math, tested).
- INCOME_RECEIVED: monthly buckets per currency (bounded paging: 5×200), totals, direction trend.
- INTEGRATION_PENDING_REVIEW / DATA_RECONCILIATION_DIVERGENCE: recent-run table (capped 20, newest-first), first divergence date in-window, INSUFFICIENT_DATA trend (no baseline fabrication).
- DATA_VALUATION_COVERAGE / ALLOCATION_SINGLE_ASSET_CONCENTRATION / PERFORMANCE_BENCHMARK_UNAVAILABLE: UNAVAILABLE with explicit reason — no history invented.
- TAX: no signal, no drill-down (no portfolio-scoped source).

## Sampling

Series: engine AUTO granularity (weekly ≤1Y, monthly beyond; engine hard cap 400). Income: calendar months, max 61. Runs: newest 20. Points asserted ≤ 120 cap (STEP 27). INCEPTION: bounded trailing 1825d + engine/month caps; no unbounded ranges anywhere.

## Trend vocabulary

INCREASED / DECREASED / STABLE / INSUFFICIENT_DATA — direction facts only, never quality judgments. Coverage direction is the data-quality statement itself and still says nothing about the portfolio.

## Limitations

Explicit per detail: NO_HISTORICAL_SOURCE, NO_BENCHMARK_IN_PERIOD, WINDOW_TRUNCATED, MULTI_CURRENCY_NO_TRANSLATION, NO_INCOME_IN_PERIOD, SINGLE_SNAPSHOT_ONLY. "Histórico indisponível" + "snapshot atual" copy where no source exists; coverage qualifier always attached ("do valor conhecido").

## Performance strategy

Lazy detail (overview payload unchanged — verified no `points` in overview). One series call per benchmark present (max 2, IBOV+CDI), one bounded income paging loop, one bounded runs window. No N+1, no per-position loops, no replay. Max-points assertion tested per kind.

## Advice boundary

Rule explanations document heuristics ("destaca a partir de 25%"), never recommendations. History copy narrates numbers ("passou de X para Y"), never judges ("piorou", "saudável"). Boundary-tested across engine + web + mobile copy.

## Future evolution

- 5Q-C: user-defined targets/strategy (current vs meta, deviations).
- Replay-based valuation/allocation history (asOf plumb-through + `findByAssetDate`/`findRange` + `replayTimeline`) remains designed-but-deferred; needs product decisions on weekend/FX-asOf semantics first.
- No auto-actions, no notifications, no B3 work.
