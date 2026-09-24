# Portfolio AI Grounding API Contract (v1)

Phase: `3Q`  
Status: `APPROVED`  
Base Endpoint: `/api/v1/portfolios/:portfolioId/ai/grounding`

---

## 1. Endpoint Overview

Returns the canonical, deterministic **Portfolio AI Grounding Context** for an authenticated user's portfolio.

- **Method**: `GET`
- **Path**: `/api/v1/portfolios/:portfolioId/ai/grounding`
- **Authentication**: `Bearer <accessToken>` (`JwtAuthGuard`)
- **Isolation Policy**: Anti-enumeration hidden `404 Not Found` for nonexistent or unowned portfolios.
- **Provider Budget**: Strictly $\le 1$ call to `GetPortfolioIntelligenceSummaryUseCase`. Zero additional provider, valuation, or ledger replay calls. Zero LLM or external model calls.
- **Persistence**: Completely transient read-model. No DB tables, no cache, no conversation history stored.

---

## 2. Query Parameters

| Parameter   | Type   | Required | Description                                                                                                               |
| :---------- | :----- | :------- | :------------------------------------------------------------------------------------------------------------------------ |
| `startDate` | string | No       | Civil start date (`YYYY-MM-DD`). Clamped to portfolio inception date if earlier. Defaults to 365 days prior to `endDate`. |
| `endDate`   | string | No       | Civil end date (`YYYY-MM-DD`). Must not be in the future. Defaults to today civil UTC.                                    |

---

## 3. Response Structure

### Success (`200 OK`)

```json
{
  "data": {
    "schemaVersion": "1",
    "portfolioId": "c0000000-0000-4000-8000-000000000001",
    "generatedAt": "2026-09-24T12:00:00.000Z",
    "analysisPeriod": {
      "startDate": "2025-09-22",
      "endDate": "2026-09-22"
    },
    "asOf": "2026-09-22",
    "currencies": ["BRL"],
    "facts": [
      {
        "factId": "BRL.OVERVIEW.MARKET_VALUE",
        "category": "OVERVIEW",
        "scope": "BRL",
        "metric": "CURRENT_MARKET_VALUE",
        "value": "100000.00",
        "unit": "MONEY",
        "currency": "BRL",
        "nature": "POINT_IN_TIME",
        "status": "AVAILABLE",
        "reason": null,
        "asOf": "2026-09-22",
        "source": {
          "contract": "PORTFOLIO_INTELLIGENCE_SUMMARY_V1",
          "path": "currencies.BRL.overview.currentMarketValue"
        }
      },
      {
        "factId": "BRL.PERFORMANCE.TWR",
        "category": "PERFORMANCE",
        "scope": "BRL",
        "metric": "TWR",
        "value": "12.4",
        "unit": "PERCENTAGE",
        "nature": "PERIOD",
        "status": "AVAILABLE",
        "reason": null,
        "period": {
          "startDate": "2025-09-22",
          "endDate": "2026-09-22"
        },
        "source": {
          "contract": "PORTFOLIO_INTELLIGENCE_SUMMARY_V1",
          "path": "currencies.BRL.performance.twr"
        }
      }
    ],
    "observations": [
      {
        "code": "PERFORMANCE_VS_IBOV",
        "scope": "BRL",
        "status": "AVAILABLE",
        "source": "PERFORMANCE",
        "values": {
          "portfolioReturn": "12.4",
          "benchmarkReturn": "8.4",
          "differencePercentagePoints": "4.0"
        }
      }
    ],
    "dataQuality": {
      "status": "AVAILABLE",
      "availability": "COMPLETE",
      "currencies": {
        "BRL": {
          "portfolioStateCompleteness": { "status": "AVAILABLE", "reason": null },
          "valuationCompleteness": { "status": "AVAILABLE", "reason": null },
          "performanceAvailability": { "status": "AVAILABLE", "reason": null },
          "benchmarkAvailability": { "status": "AVAILABLE", "reason": null },
          "riskAvailability": { "status": "AVAILABLE", "reason": null },
          "tailRiskAvailability": { "status": "AVAILABLE", "reason": null },
          "scenarioAvailability": { "status": "AVAILABLE", "reason": null }
        }
      }
    ],
    "limitations": [],
    "capabilities": {
      "canExplainPortfolioFacts": true,
      "canExplainHistoricalPerformance": true,
      "canExplainHistoricalRisk": true,
      "canExplainScenarioResults": true,
      "canRecommendTrades": false,
      "canPredictReturns": false,
      "canCalculateNewMetrics": false
    }
  }
}
```

### Error Responses

- `401 Unauthorized`: Missing, expired, or invalid JWT.
- `404 Not Found`: Portfolio does not exist or belongs to another user (anti-enumeration hidden 404).
- `400 Bad Request`: Invalid UUID, invalid date format, `startDate > endDate`, or future `endDate`.
