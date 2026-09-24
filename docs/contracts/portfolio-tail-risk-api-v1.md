# Portfolio Tail Risk API v1 — Fase 3N

**Status:** FOUNDATION — 2026-09-23
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/tail-risk`
**Auth:** JWT `Bearer`, ownership `404` hidden. All prior performance endpoints
unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/tail-risk?startDate=2026-01-01&endDate=2026-09-21&confidenceLevel=95
```

| Param             | Values                         | Required | Default      |
| ----------------- | ------------------------------ | -------- | ------------ |
| `confidenceLevel` | `95`, `99`                     | yes      | —            |
| `startDate`       | `YYYY-MM-DD` civil             | no       | `2026-08-20` |
| `endDate`         | `YYYY-MM-DD` civil, `<= today` | no       | `2026-09-20` |

- `confidenceLevel` missing or not in `{95, 99}` →
  `400 TAIL_RISK.INVALID_CONFIDENCE_LEVEL` (no silent default). Max range
  5×366 days. `start > end` / invalid / future → `400 PERFORMANCE.INVALID_PERIOD`.
  Inception clamp mirrors 3E–3M.

## Methodology pipeline

Shared `PerformanceCalculationContextBuilder` (ONE build) → Layer-A daily TWR
subperiods → Layer-B economic returns (ADR-132) → `calculateTailRisk`
(downside + semideviation + empirical VaR/CVaR with one sort per
currency/confidence). No IBOV/CDI fetches.

## Response

Envelope `{ data: PortfolioTailRiskReadModel }` — multi-currency map:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-21" },
    "confidenceLevel": "95",
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "status": "AVAILABLE",
        "observationCount": 180,
        "downsideDeviation": {
          "frequency": "DAILY",
          "dailyPercentage": "1.12",
          "annualizedPercentage": "17.78",
          "negativeObservationCount": 82
        },
        "semideviation": {
          "frequency": "DAILY",
          "dailyPercentage": "0.98",
          "annualizedPercentage": "15.56"
        },
        "historicalVar": {
          "confidenceLevel": "95",
          "quantileReturnPercentage": "-2.35",
          "lossPercentage": "2.35",
          "tailObservationCount": 9
        },
        "historicalCvar": {
          "confidenceLevel": "95",
          "meanTailReturnPercentage": "-3.10",
          "lossPercentage": "3.10",
          "tailObservationCount": 9
        }
      },
      "USD": {
        "currency": "USD",
        "status": "UNAVAILABLE",
        "observationCount": 5,
        "downsideDeviation": {
          "frequency": "DAILY",
          "dailyPercentage": null,
          "annualizedPercentage": null,
          "negativeObservationCount": 0
        },
        "semideviation": {
          "frequency": "DAILY",
          "dailyPercentage": null,
          "annualizedPercentage": null
        },
        "historicalVar": {
          "confidenceLevel": "95",
          "quantileReturnPercentage": null,
          "lossPercentage": null,
          "tailObservationCount": 0
        },
        "historicalCvar": {
          "confidenceLevel": "95",
          "meanTailReturnPercentage": null,
          "lossPercentage": null,
          "tailObservationCount": 0
        }
      }
    },
    "status": "PARTIAL",
    "dataAvailability": "PARTIAL"
  }
}
```

- All financial values are decimal **strings or null**; `null` = unavailable,
  never `"Infinity"`/`"NaN"`. Counts are integers.
- `lossPercentage` values are non-negative magnitudes. `quantileReturnPercentage`
  and `meanTailReturnPercentage` are the separately auditable threshold/tail
  returns.
- Metric-specific availability: e.g. `n = 50` with `confidenceLevel=99` →
  downside/semideviation available, VaR/CVaR `null`, currency `PARTIAL`.
- BRL and USD are segregated (never aggregated, no FX). Top-level `status`
  (`AVAILABLE | PARTIAL | UNAVAILABLE`) and `dataAvailability`
  (`COMPLETE | PARTIAL | UNAVAILABLE`) aggregate the currency blocks.

## Errors

- `400` `TAIL_RISK.INVALID_CONFIDENCE_LEVEL` (missing/invalid confidence)
- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
