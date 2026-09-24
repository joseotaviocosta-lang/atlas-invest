# Portfolio Benchmark Comparison v1 — Fase 3F/3G

**Status:** FOUNDATION — 2026-09-21
**Endpoint:** `GET /api/v1/portfolios/:portfolioId/performance?...&benchmark=IBOV|CDI`
**Auth:** JWT `Bearer`, ownership `404` oculto.

## 1. Objetivo

Comparar o **TWR** da carteira no período com o retorno do benchmark no mesmo período, expressando a
diferença em **pontos percentuais (p.p.)**.

```
differencePercentagePoints = portfolioTwr - benchmarkReturn   // p.p.
```

- Calculado **exclusivamente no servidor** (`calculateExcessReturn`), decimal exato.
- **NUNCA** é chamado de alpha, beta ou informação de risco.
- **NUNCA** usa XIRR (XIRR permanece visível, porém separado — ADR-040 do comparativo continua valendo).

## 2. Roteamento por tipo (ADR-117)

| `BENCHMARK_DEFINITIONS[id].type` | Provider                    | Cálculo                        |
| -------------------------------- | --------------------------- | ------------------------------ |
| `PRICE_INDEX`                    | `BenchmarkDataProvider`     | `calculateBenchmarkReturn`     |
| `RATE_SERIES`                    | `RateBenchmarkDataProvider` | `calculateRateBenchmarkReturn` |

## 3. Campo `benchmark` no read model

```ts
benchmark?: {
  id: string;                 // 'IBOV' | 'CDI'
  name: string;
  currency: string;           // 'BRL'
  type: 'PRICE_INDEX' | 'RATE_SERIES';
  return: string | null;      // Percentage string exata, ex.: "9.42"
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  observationCount?: number;  // RATE_SERIES apenas
} | null;
differencePercentagePoints?: string | null; // ex.: "2.58" | "-2"
```

**Exemplo `CDI` `AVAILABLE`:**

```json
{
  "currencies": {
    "BRL": {
      "currency": "BRL",
      "twr": "12.00",
      "xirr": "11.50",
      "benchmark": {
        "id": "CDI",
        "name": "CDI",
        "currency": "BRL",
        "type": "RATE_SERIES",
        "return": "9.42",
        "status": "AVAILABLE",
        "dataAvailability": "AVAILABLE",
        "observationCount": 21
      },
      "differencePercentagePoints": "2.58"
    }
  }
}
```

## 4. Semântica de estados

- `AVAILABLE`: TWR e benchmark presentes. Diferença calculada.
- `PARTIAL`: a série de valuation da carteira é parcial (algum ativo sem preço) ou o benchmark é parcial.
  A comparação é rotulada **"Comparação parcial"** — nunca completa. A diferença ainda é exibida quando
  ambos os retornos existem.
- `UNAVAILABLE`: benchmark não obtido no período (`return: null`, `differencePercentagePoints: null`).
  A UI mostra `CDI indisponível para este período.` / `Benchmark indisponível para este período.`,
  **nunca `0%`**. O TWR da carteira permanece visível.

## 5. Multi-moeda

- `IBOV` e `CDI` são `BRL`. Comparação apenas para `BRL`.
- Carteira/moeda não `BRL` → `benchmark: null`, sem FX e sem comparação cross-currency.

## 6. Isolamento de provedores

- A resposta **nunca** expõe DTOs de provedor, código de série (`12`), `providerSeriesCode`,
  `RateBenchmarkObservation`, `BcbRateBenchmarkDataProvider`, `bcdata.sgs` ou a instituição de origem.
- Metadados de auditoria (`source`, `seriesCode`, `observationCount`, datas da primeira/última observação)
  permanecem **server-side**.

## 7. Erros

- `400 PERFORMANCE.INVALID_BENCHMARK` (benchmark fora de `BENCHMARK_IDS`).
- `400 PERFORMANCE.INVALID_PERIOD` (período inválido/invertido).
- `404 PORTFOLIO.NOT_FOUND` (cross-user oculto).
- `401 AUTH.UNAUTHORIZED`.
