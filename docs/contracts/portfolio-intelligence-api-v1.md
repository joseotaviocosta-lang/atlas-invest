# Portfolio Intelligence API v1 — Fase 3P

**Status:** FOUNDATION — 2026-09-23
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/intelligence/summary`
**Auth:** JWT `Bearer`, ownership `404` hidden. Portfolio Read API v1 unchanged.

## Request

```
GET /api/v1/portfolios/:id/intelligence/summary?startDate=2025-09-22&endDate=2026-09-22
```

| Param       | Values                         | Default              |
| ----------- | ------------------------------ | -------------------- |
| `startDate` | `YYYY-MM-DD` civil             | `endDate − 365 days` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | today                |

No `confidence`/`scenario` params — the summary is canonical (tail 95%,
EQUITY_DOWN_10). Max range 5×366 days. `start > end` / invalid / future →
`400 PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors 3E–3O.

## Response

Envelope `{ data: PortfolioIntelligenceSummary }`:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2025-09-22", "endDate": "2026-09-22" },
    "asOf": "2026-09-22",
    "currencies": {
      "BRL": {
        "overview": {
          "currentMarketValue": "100000.00",
          "positionCount": 12,
          "valuedPositionCount": 12,
          "unvaluedPositionCount": 0,
          "status": "AVAILABLE"
        },
        "performance": {
          "twr": "12",
          "xirr": "11.5",
          "observationCount": 200,
          "status": "AVAILABLE"
        },
        "benchmarks": [
          { "id": "IBOV", "return": "8", "differencePercentagePoints": "4", "status": "AVAILABLE" },
          { "id": "CDI", "return": "9", "differencePercentagePoints": "3", "status": "AVAILABLE" }
        ],
        "risk": {
          "realizedVolatilityAnnualized": "18",
          "maximumDrawdown": "-12",
          "currentDrawdown": "-5",
          "status": "AVAILABLE"
        },
        "riskAdjusted": {
          "sharpe": "1.2",
          "sortino": "1.5",
          "riskFreeProxy": "CDI",
          "status": "AVAILABLE"
        },
        "relativeRisk": {
          "benchmark": "IBOV",
          "beta": "0.9",
          "correlation": "0.8",
          "trackingErrorAnnualized": "10",
          "status": "AVAILABLE"
        },
        "activePerformance": {
          "alpha": "2",
          "informationRatio": "1.1",
          "treynor": "5",
          "status": "AVAILABLE"
        },
        "tailRisk": {
          "confidenceLevel": "95",
          "downsideDeviationAnnualized": "12",
          "semideviationAnnualized": "10",
          "var95": "2.5",
          "cvar95": "3.5",
          "status": "AVAILABLE"
        },
        "scenario": {
          "preset": "EQUITY_DOWN_10",
          "type": "EQUITY_PRICE_SHOCK",
          "baseValue": "100000",
          "stressedValue": "90000",
          "absoluteImpact": "-10000",
          "percentageImpact": "-10",
          "hypothetical": true,
          "status": "AVAILABLE"
        },
        "dataQuality": { "valuationCompleteness": { "status": "AVAILABLE", "reason": null } },
        "status": "AVAILABLE",
        "dataAvailability": "COMPLETE"
      }
    },
    "observations": [
      {
        "code": "PERFORMANCE_VS_IBOV",
        "scope": "BRL",
        "status": "AVAILABLE",
        "source": "PERFORMANCE",
        "values": {
          "portfolioReturn": "12",
          "benchmarkReturn": "8",
          "differencePercentagePoints": "4"
        }
      }
    ],
    "status": "AVAILABLE",
    "dataAvailability": "COMPLETE"
  }
}
```

- Financial values: decimal **strings or null**; counts: integers. Never
  `"Infinity"`/`"NaN"`.
- Currencies segregated; no global total; no FX.
- Component failure → `PARTIAL` where possible, never an implicit zero.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD`
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- System errors follow the canonical error policy (not disguised as UNAVAILABLE).
