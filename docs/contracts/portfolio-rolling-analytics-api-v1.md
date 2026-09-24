# Portfolio Rolling Analytics API v1 — Fase 3M

**Status:** FOUNDATION — 2026-09-22
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/rolling`
**Auth:** JWT `Bearer`, ownership `404` hidden. All prior performance endpoints
unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/rolling?startDate=2026-01-01&endDate=2026-09-21&window=20
```

| Param       | Values                         | Required | Default      |
| ----------- | ------------------------------ | -------- | ------------ |
| `window`    | `20`, `60`, `120`              | yes      | —            |
| `startDate` | `YYYY-MM-DD` civil             | no       | `2026-08-20` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | no       | `2026-09-20` |

- `window` missing or not in `{20, 60, 120}` → `400 ROLLING_ANALYTICS.INVALID_WINDOW`
  (no silent default). Max range 5×366 days. `start > end` / invalid / future →
  `400 PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors 3E–3L.

## Methodology pipeline

Shared `PerformanceCalculationContextBuilder` (ONE build) → Layer-A daily TWR
subperiods → Layer-B economic returns (ADR-132) → rolling volatility (3I) → for
BRL: 3J aligned observations → rolling Sharpe; 3K paired intervals → rolling
Beta. ONE IBOV range fetch + ONE CDI range fetch per request (no per-point I/O).

## Response

Envelope `{ data: PortfolioRollingAnalyticsReadModel }` — multi-currency map:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-21" },
    "window": 20,
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "rollingVolatility": {
          "window": 20,
          "frequency": "DAILY",
          "status": "AVAILABLE",
          "points": [
            {
              "windowStartDate": "2026-01-02",
              "endDate": "2026-01-29",
              "observationCount": 20,
              "annualizedPercentage": "18.42",
              "status": "AVAILABLE"
            }
          ]
        },
        "rollingSharpe": {
          "window": 20,
          "frequency": "DAILY",
          "status": "AVAILABLE",
          "points": []
        },
        "rollingBeta": { "window": 20, "status": "AVAILABLE", "points": [] }
      },
      "USD": {
        "currency": "USD",
        "rollingVolatility": {
          "window": 20,
          "frequency": "DAILY",
          "status": "AVAILABLE",
          "points": []
        },
        "rollingSharpe": {
          "window": 20,
          "frequency": "DAILY",
          "status": "UNAVAILABLE",
          "points": []
        },
        "rollingBeta": { "window": 20, "status": "UNAVAILABLE", "points": [] }
      }
    },
    "status": "PARTIAL",
    "dataAvailability": "PARTIAL"
  }
}
```

- `annualizedPercentage` (volatility) is a percentage string; `annualized`
  (Sharpe) and `beta` are unitless ratio strings. All `string | null`; `null` =
  unavailable/gap, never `"Infinity"`/`"NaN"`.
- BRL: all three series. Non-BRL: rolling volatility only; Sharpe/Beta
  `UNAVAILABLE` with empty points (volatility does not depend on CDI/IBOV, so it
  is not blocked by currency). No FX.
- Top-level `status` (`AVAILABLE | PARTIAL | UNAVAILABLE`) and `dataAvailability`
  (`COMPLETE | PARTIAL | UNAVAILABLE`) aggregate the currency series.

## Errors

- `400` `ROLLING_ANALYTICS.INVALID_WINDOW` (missing/invalid window)
- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
