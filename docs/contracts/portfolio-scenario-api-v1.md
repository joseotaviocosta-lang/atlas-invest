# Portfolio Scenario API v1 — Fase 3O

**Status:** FOUNDATION — 2026-09-23
**Endpoint:** `POST /api/v1/portfolios/:portfolioId/performance/scenarios/run`
**Auth:** JWT `Bearer`, ownership `404` hidden. Stateless — no persistence.

## Request

```json
{
  "asOf": "2026-09-23",
  "scenario": { "type": "EQUITY_PRICE_SHOCK", "shockPercentage": "-10" }
}
```

- `asOf` optional, civil `YYYY-MM-DD`, not in the future. Omitted → today.
  Historical `asOf` uses the replay/valuation of that date (no future leakage).
- `scenario.type` ∈ `EQUITY_PRICE_SHOCK | BENCHMARK_SHOCK | RATE_SHOCK | COMBINED`.
- `EQUITY_PRICE_SHOCK`: `shockPercentage` ∈ `[−100, 500]`.
- `BENCHMARK_SHOCK`: `benchmarkId` (IBOV only), `shockPercentage` ∈ `[−100, 500]`.
- `RATE_SHOCK`: `rateShockBps` ∈ `[−10000, 10000]`.
- `COMBINED`: `equityShockPercentage` and/or `benchmarkShockPercentage` (not
  both) and/or `rateShockBps`.

## Response

Envelope `{ data: PortfolioScenarioReadModel }`:

```json
{
  "data": {
    "portfolioId": "...",
    "asOf": "2026-09-23",
    "scenario": { "type": "EQUITY_PRICE_SHOCK", "shockPercentage": "-10" },
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "status": "AVAILABLE",
        "baseValue": "100000.00",
        "stressedValue": "90000.00",
        "absoluteImpact": "-10000.00",
        "percentageImpact": "-10",
        "positionCount": 12,
        "valuedPositionCount": 12,
        "unvaluedPositionCount": 0,
        "components": [
          {
            "componentType": "EQUITY_PRICE_SHOCK",
            "status": "AVAILABLE",
            "baseValue": "100000.00",
            "stressedValue": "90000.00",
            "absoluteImpact": "-10000.00",
            "percentageImpact": "-10",
            "reason": null
          }
        ]
      }
    },
    "status": "AVAILABLE",
    "dataAvailability": "COMPLETE"
  }
}
```

- All financial values are decimal **strings or null**; counts are integers.
  `null` = unavailable, never `"Infinity"`/`"NaN"`.
- Currencies are segregated (no FX). Unvalued positions are excluded and
  counted (`unvaluedPositionCount`), never zero.
- The result is a **hypothesis**, not a forecast.

## Errors

- `400` `SCENARIO.INVALID_TYPE` · `SCENARIO.INVALID_SHOCK` ·
  `SCENARIO.CONFLICTING_SHOCKS` · `SCENARIO.INVALID_AS_OF`
- `400` `VALIDATION.INVALID_INPUT` (malformed body)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
