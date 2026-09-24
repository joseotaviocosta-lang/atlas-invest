# Portfolio Benchmark-Relative Risk API v1 — Fase 3K

**Status:** FOUNDATION — 2026-09-22
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/relative-risk`
**Auth:** JWT `Bearer`, ownership `404` hidden. `/performance`, `/series`,
`/risk` and `/risk-adjusted` unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/relative-risk?benchmark=IBOV&startDate=2026-01-01&endDate=2026-09-22
```

| Param       | Values                         | Required | Default      |
| ----------- | ------------------------------ | -------- | ------------ |
| `benchmark` | `IBOV` (only)                  | yes      | —            |
| `startDate` | `YYYY-MM-DD` civil             | no       | `2026-08-20` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | no       | `2026-09-20` |

- `benchmark` missing → `400 RELATIVE_RISK.BENCHMARK_REQUIRED`.
- `benchmark=CDI` or any non-IBOV value → `400 RELATIVE_RISK.UNSUPPORTED_BENCHMARK`
  (never a silent IBOV fallback). Max range: 5×366 days. `start > end` /
  invalid / future → `400 PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors
  3E/3H/3I/3J.

## Methodology pipeline

Shared `PerformanceCalculationContextBuilder` (no duplicate replay/price
pipeline) → Layer-A daily TWR subperiods (ADR-131) → portfolio economic
boundaries (anchor + EXACT-valuation dates, ADR-132) → single IBOV range fetch
(`getObservations`, never one call per day/pair) → benchmark economic
boundaries → interval builders → strict `(startDate, endDate)` alignment
(ADR-139) → `calculateBenchmarkRelativeRisk` (Beta/Correlation/Tracking Error).
Provider failure → BRL `UNAVAILABLE` (no zero fallback).

## Response

Envelope `{ data: PortfolioBenchmarkRelativeRiskReadModel }`:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-22" },
    "benchmark": { "id": "IBOV", "name": "Ibovespa", "currency": "BRL" },
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "status": "AVAILABLE",
        "alignment": {
          "portfolioIntervalCount": 170,
          "benchmarkIntervalCount": 174,
          "pairedObservationCount": 168,
          "droppedPortfolioIntervalCount": 2,
          "droppedBenchmarkIntervalCount": 6
        },
        "beta": "0.87",
        "correlation": "0.74",
        "trackingError": {
          "frequency": "DAILY",
          "observationCount": 168,
          "samplePercentage": "0.76",
          "annualizedPercentage": "12.06",
          "annualizationFactor": "252",
          "status": "AVAILABLE"
        }
      },
      "USD": {
        "currency": "USD",
        "status": "UNAVAILABLE",
        "alignment": null,
        "beta": null,
        "correlation": null,
        "trackingError": null
      }
    },
    "status": "AVAILABLE",
    "dataAvailability": "AVAILABLE"
  }
}
```

- `beta`/`correlation` are unitless decimal **strings or null** (never `%`).
  Tracking-error percentages are decimal strings or null. `null` = unavailable,
  never `"Infinity"`/`"NaN"`. Counts are integers.
- Zero denominator, insufficient pairs (`< 2`), no benchmark data, zero overlap
  or USD → `UNAVAILABLE`. Dropped intervals / partial upstream valuations →
  `PARTIAL` (never silent `AVAILABLE`).

## Errors

- `400` `RELATIVE_RISK.BENCHMARK_REQUIRED` (missing benchmark)
- `400` `RELATIVE_RISK.UNSUPPORTED_BENCHMARK` (CDI/unknown)
- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
