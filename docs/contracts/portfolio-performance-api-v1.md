# Portfolio Performance API v1 — Fase 3E

**Status:** FOUNDATION — 2026-09-20
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
**Auth:** JWT `Bearer`, ownership `404` hidden, `period` civil `LocalDate` validação.

## Request

```
GET /api/v1/portfolios/:id/performance?startDate=2026-01-01&endDate=2026-03-31
Headers: Authorization: Bearer <JWT>
```

`startDate`/`endDate` opcionais (default `1Y` no UI, server default `2026-08-20→2026-09-20`). `startDate > endDate` → `400 PERFORMANCE.INVALID_PERIOD`. `endDate > today` → `400` (não futuro). Sem `historical valuations` suficientes, `currencies` são determinadas via `replay` mas `twr/xirr` são `null`.

## Response

**Envelope:** `{ data: PortfolioPerformanceReadModel }`

```ts
PortfolioPerformanceReadModel {
  portfolioId: string
  period: { startDate: string, endDate: string } // YYYY-MM-DD, LocalDate
  currencies: Record<Currency, {
    currency, twr: string|null, xirr: string|null,
    twrStatus: 'COMPLETE'|'PARTIAL'|'INSUFFICIENT_DATA'|'INVALID_INPUT',
    xirrStatus: 'CONVERGED'|'NO_SOLUTION'|'INSUFFICIENT_DATA'|'NUMERICAL_FAILURE',
    status: PerformanceStatus, dataAvailability: 'AVAILABLE'|'PARTIAL'|'UNAVAILABLE'
  }>
  status: PerformanceStatus // COMPLETE|PARTIAL|INSUFFICIENT_DATA|INVALID_INPUT
  dataAvailability: PerformanceDataAvailability // AVAILABLE|PARTIAL|UNAVAILABLE
}
```

**Exemplo `AVAILABLE`:**

```json
{
  "data": {
    "portfolioId": "...",
    "period": { "startDate": "2026-01-01", "endDate": "2026-03-31" },
    "currencies": {
      "BRL": {
        "currency": "BRL",
        "twr": "10.00",
        "xirr": "9.50",
        "twrStatus": "COMPLETE",
        "xirrStatus": "CONVERGED",
        "status": "COMPLETE",
        "dataAvailability": "AVAILABLE"
      }
    },
    "status": "COMPLETE",
    "dataAvailability": "AVAILABLE"
  }
}
```

**`PARTIAL`:** `Alguns preços históricos não estavam disponíveis. Os resultados abaixo usam apenas os dados que puderam ser reconstruídos.`

**`UNAVAILABLE`:** `twr:null, xirr:null`, `status: INSUFFICIENT_DATA`, `dataAvailability: UNAVAILABLE` → UI mostra `Performance indisponível para este período.` e `—` não `0%`.

**`null` vs `0`:** `twr: null` significa indisponível, nunca `0%` inventado. `twr: "0"` é 0% real.

**Decimal strings:** `twr: "10.00"`, `xirr: "9.50"` são `Percentage` `string` exata, nunca `number`. `period` `YYYY-MM-DD` civil.

**Traceability:** `status`/`dataAvailability` por moeda indicam `PARTIAL`/`UNAVAILABLE`; `observations`/`historical price dates` auditáveis no `HistoricalValuationBuilder` (não exposto em UI mas em `PortfolioPerformance`).

**No benchmark:** sem `CDI`, `Ibovespa` nesta fase.

## Errors

- `400` `PERFORMANCE.INVALID_PERIOD` (start> end, invalid LocalDate, future)
- `404` `PORTFOLIO.NOT_FOUND` (hidden cross-user)
- `401` `AUTH.UNAUTHORIZED`
