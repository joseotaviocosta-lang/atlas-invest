# Portfolio Active Performance API v1 — Fase 3L

**Status:** FOUNDATION — 2026-09-22
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance/active`
**Auth:** JWT `Bearer`, ownership `404` hidden. `/performance`, `/series`,
`/risk`, `/risk-adjusted` and `/relative-risk` unchanged (frozen).

## Request

```
GET /api/v1/portfolios/:id/performance/active?startDate=2026-01-01&endDate=2026-09-21
```

| Param       | Values                         | Default      |
| ----------- | ------------------------------ | ------------ |
| `startDate` | `YYYY-MM-DD` civil             | `2026-08-20` |
| `endDate`   | `YYYY-MM-DD` civil, `<= today` | `2026-09-20` |

No query params for references: `marketBenchmark = IBOV` and
`riskFreeProxy = CDI` are fixed in 3L. Max range: 5×366 days. `start > end` /
invalid / future → `400 PERFORMANCE.INVALID_PERIOD`. Inception clamp mirrors
3E/3H/3I/3J/3K.

## Methodology pipeline

Shared `PerformanceCalculationContextBuilder` (no duplicate replay) → portfolio
TWR (Rp) over the period → single IBOV range fetch (Rm + Beta/paired intervals
via the 3K pipeline) → single CDI range fetch (Rf via 3G
`calculateRateBenchmarkReturn`) → `calculateActivePerformance` (Alpha, IR,
Treynor) with period-consistent inputs (ADR-147). Provider failure → BRL
`UNAVAILABLE` (no zero fallback).

## Response

Envelope `{ data: PortfolioActivePerformanceReadModel }` — **multi-currency
map, consistent with 3I/3J/3K**:

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-09-21" },
    "marketBenchmark": "IBOV",
    "riskFreeProxy": "CDI",
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "status": "AVAILABLE",
        "alpha": { "periodPercentage": "2.35" },
        "informationRatio": { "observationCount": 170, "daily": "0.08", "annualized": "1.27" },
        "treynor": { "periodPercentagePerBeta": "7.42" }
      },
      "USD": {
        "currency": "USD",
        "status": "UNAVAILABLE",
        "alpha": null,
        "informationRatio": null,
        "treynor": null
      }
    },
    "status": "PARTIAL",
    "dataAvailability": "PARTIAL"
  }
}
```

- A portfolio holding BRL + USD returns **both** currency blocks in the SAME
  response: BRL computed, USD `UNAVAILABLE` with all metrics `null` (no FX).
- `alpha.periodPercentage` is a percentage (period, NOT annualized).
  `informationRatio.daily`/`annualized` are unitless ratios (never `%`).
  `treynor.periodPercentagePerBeta` is a percentage-per-beta. All are decimal
  **strings or null**; `null` = unavailable, never `"Infinity"`/`"NaN"`.
- Metric-specific nullability (per currency): e.g. missing CDI → `alpha: null`,
  `treynor: null`, `informationRatio` present, currency `status: "PARTIAL"`.
  Missing IBOV → all `null`, currency `status: "UNAVAILABLE"`.
- Top-level `status`/`dataAvailability` aggregate the currency blocks:
  `AVAILABLE` when all available, `PARTIAL` when mixed, `UNAVAILABLE` when none.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD` (inverted/invalid/future/range)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
- Replay failure → `422` `PORTFOLIO.REPLAY_FAILED` (via global filter)
