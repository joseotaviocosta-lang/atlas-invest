# Portfolio Risk API v1 — Fase 3I

**Status:** FOUNDATION — 2026-09-21
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/risk`
**Auth:** JWT `Bearer`, ownership `404` hidden. `GET /performance` and
`GET /performance/series` unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/risk?startDate=2026-01-01&endDate=2026-09-21
```

| Param       | Values                         | Default      |
| ----------- | ------------------------------ | ------------ |
| `startDate` | `YYYY-MM-DD` civil             | `2026-08-20` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | `2026-09-20` |

No `benchmark` (benchmark-relative risk is out of scope) and no
`granularity` (risk methodology is always DAILY — there is no user-facing
frequency selector). Max range: 5×366 days. `start > end` → `400
PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors 3E/3H (never before
the first trade).

## Risk calculation series (ADR-131)

Calculation dates are EVERY civil date in `[start, end]` ∪ external-flow
dates — never the AUTO/WEEKLY/MONTHLY chart display samples. Historical
replay, price resolution and cash-flow collection are shared verbatim with
3H via `PerformanceCalculationContextBuilder`; subperiod TWR returns come
from the performance engine; volatility/drawdown come from the risk engine.
No Redis, no cross-request global cache; web/mobile query keys isolate
`['portfolio-risk', id, start, end]`.

## Response

Envelope `{ data: PortfolioRiskReadModel }`:

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
        "volatility": {
          "frequency": "DAILY",
          "observationCount": 178,
          "samplePercentage": "0.84",
          "annualizedPercentage": "13.34",
          "annualizationFactor": "252",
          "status": "AVAILABLE"
        },
        "drawdown": {
          "maximumPercentage": "-12.48",
          "peakDate": "2026-03-10",
          "troughDate": "2026-05-20",
          "recoveryDate": "2026-07-02",
          "currentPercentage": "-2.11",
          "status": "AVAILABLE"
        }
      }
    },
    "status": "AVAILABLE",
    "dataAvailability": "AVAILABLE"
  }
}
```

- All financial values are decimal **strings or null** (never numbers).
  `null` = unavailable, never `"0"` invented. `observationCount` is an integer.
- `recoveryDate: null` means open drawdown (or no drawdown occurred).
- Drawdowns are negative strings (`"-12.48"`).
- Non-BRL currencies are computed independently with the same methodology.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
