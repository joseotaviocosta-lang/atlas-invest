# Portfolio Risk-Adjusted API v1 — Fase 3J

**Status:** FOUNDATION — 2026-09-22
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/risk-adjusted`
**Auth:** JWT `Bearer`, ownership `404` hidden. `/performance`, `/series` and
`/risk` unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/risk-adjusted?startDate=2026-01-01&endDate=2026-09-21
```

| Param       | Values                         | Default      |
| ----------- | ------------------------------ | ------------ |
| `startDate` | `YYYY-MM-DD` civil             | `2026-08-20` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | `2026-09-20` |

No `benchmark`/`granularity` params (CDI proxy is fixed; methodology is
always DAILY economic observations). Max range: 5×366 days. `start > end` →
`400 PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors 3E/3H/3I.

## Methodology pipeline

Shared `PerformanceCalculationContextBuilder` (no duplicate replay/price
pipeline) → Layer-B statistical subperiods (ADR-132) → single CDI range
fetch (`getRateObservations`, never per-day HTTP) → unit-explicit
conversion (`DAILY_PERCENT` as-is; `DAILY_FACTOR` as factor−1; unknown
dropped) → date intersection (ADR-137) → `calculateSharpeRatio` /
`calculateSortinoRatio`. Provider failure → BRL `UNAVAILABLE` (no zero,
no IBOV, no hardcoded fallback).

## Response

Envelope `{ data: PortfolioRiskAdjustedReadModel }`:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-21" },
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "frequency": "DAILY",
        "status": "AVAILABLE",
        "dataAvailability": "AVAILABLE",
        "riskFreeProxy": "CDI",
        "sharpe": {
          "observationCount": 178,
          "meanDailyExcessPercentage": "0.05",
          "daily": "0.078",
          "annualized": "1.24",
          "annualizationFactor": "252",
          "status": "AVAILABLE"
        },
        "sortino": {
          "observationCount": 178,
          "downsideObservationCount": 71,
          "downsideDeviationPercentage": "0.42",
          "daily": "0.118",
          "annualized": "1.87",
          "annualizationFactor": "252",
          "status": "AVAILABLE"
        }
      },
      "USD": {
        "currency": "USD",
        "frequency": "DAILY",
        "status": "UNAVAILABLE",
        "dataAvailability": "UNAVAILABLE",
        "riskFreeProxy": null,
        "sharpe": null,
        "sortino": null
      }
    },
    "status": "AVAILABLE",
    "dataAvailability": "AVAILABLE"
  }
}
```

- Ratios (`daily`, `annualized`) are unitless decimal **strings or null**;
  `null` = unavailable, never `"Infinity"`/`"NaN"`. Percentages
  (`meanDailyExcessPercentage`, `downsideDeviationPercentage`) are percent
  points. `observationCount`/`downsideObservationCount` are integers.
- CDI gaps on statistical dates narrow the sample and mark `PARTIAL`;
  zero overlap, insufficient observations, zero denominators → `UNAVAILABLE`.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
