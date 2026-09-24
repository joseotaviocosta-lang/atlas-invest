# Portfolio Performance Series API v1 — Fase 3H

**Status:** FOUNDATION — 2026-09-21
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/series`
**Auth:** JWT `Bearer`, ownership `404` hidden. `GET /performance` unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/series
  ?startDate=2026-01-01&endDate=2026-09-21&benchmark=CDI&granularity=AUTO
```

| Param         | Values                                     | Default      |
| ------------- | ------------------------------------------ | ------------ |
| `startDate`   | `YYYY-MM-DD` civil                         | `2026-08-20` |
| `endDate`     | `YYYY-MM-DD` civil, `<= today`             | `2026-09-20` |
| `benchmark`   | `IBOV` \| `CDI` (omit = none)              | none         |
| `granularity` | `DAILY` \| `WEEKLY` \| `MONTHLY` \| `AUTO` | `AUTO`       |

Max range: 5×366 days. `start > end` → `400 PERFORMANCE.INVALID_PERIOD`.
Unknown benchmark → `400 PERFORMANCE.INVALID_BENCHMARK`.
Unknown granularity → `400 PERFORMANCE.INVALID_GRANULARITY`.

## Response

Envelope `{ data: PortfolioPerformanceSeriesReadModel }`:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-21" },
    "requestedGranularity": "AUTO",
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "granularity": "WEEKLY",
        "status": "COMPLETE",
        "dataAvailability": "AVAILABLE",
        "benchmark": {
          "id": "CDI",
          "name": "CDI",
          "currency": "BRL",
          "type": "RATE_SERIES",
          "status": "AVAILABLE",
          "dataAvailability": "AVAILABLE"
        },
        "points": [
          {
            "date": "2026-01-01",
            "portfolioReturn": "0",
            "benchmarkReturn": "0",
            "status": "COMPLETE"
          },
          {
            "date": "2026-01-09",
            "portfolioReturn": "1.23",
            "benchmarkReturn": "0.91",
            "status": "COMPLETE"
          }
        ]
      }
    },
    "status": "COMPLETE",
    "dataAvailability": "AVAILABLE"
  }
}
```

- All financial values are decimal **strings or null** (never numbers).
  `null` = unavailable, never `"0"` invented.
- First point is `"0"`/`"0"` when both series resolve at start.
- Final `portfolioReturn` equals the `/performance` TWR; final
  `benchmarkReturn` equals the `/performance` benchmark return.
- Non-BRL currencies carry `benchmark: null` and `benchmarkReturn: null`.
- `points.length <= 400`.

## Cache

Server-side the series is stateless per request (consistent with ADR-071: no
premature Redis); repeat reads benefit from the underlying historical-price
and benchmark caches. Cache key (client query + any future server cache):

```
portfolioId :: startDate :: endDate :: currency :: benchmark :: granularity
```

A new ledger transaction changes valuations, so series results must not be
served stale across writes — the web/mobile query keys above include the
period+benchmark+granularity, and transaction mutations invalidate
`portfolio-performance-series` queries.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD` / `PERFORMANCE.INVALID_BENCHMARK` /
  `PERFORMANCE.INVALID_GRANULARITY`
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
