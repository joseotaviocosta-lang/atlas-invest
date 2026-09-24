# Benchmark Data v1 — Fase 3F (PRICE_INDEX)

**Status:** FOUNDATION — 2026-09-21
**Engine:** `@atlas/benchmark-engine` (versão 0.2.0, ver ADR-067 para política de freeze do Portfolio Engine)
**Escopo:** benchmarks de **índice de preço** (`PRICE_INDEX`), começando por `IBOV`.

## 1. Identidade canônica

| Campo                        | Valor                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `BenchmarkId`                | `'IBOV' \| 'CDI'`                                                                                  |
| `BENCHMARK_DEFINITIONS.IBOV` | `{ id: 'IBOV', name: 'Ibovespa', shortName: 'IBOV', currency: 'BRL', type: 'PRICE_INDEX' }`        |
| Fonte real                   | Yahoo Finance `^BVSP` (`YahooBenchmarkDataProvider`), Stooq `^BVSP` (`StooqBenchmarkDataProvider`) |

**O código/símbolo do provedor (`^BVSP`) NUNCA é identidade.** A identidade canônica é o `BenchmarkId`.
Ticker, exchange e `providerSymbol` são metadados específicos do adapter (ADR-057 aplicado a benchmarks).

## 2. Observação de índice de preço

```ts
interface BenchmarkObservation {
  benchmarkId: BenchmarkId; // identidade canônica
  date: LocalDate; // data civil YYYY-MM-DD
  value: DecimalValue; // nível do índice, decimal exato
  source: string; // ex.: 'YAHOO' | 'STOOQ'
}
```

- `value` é `DecimalValue` (nunca `number`/float IEEE-754).
- Serialização JSON é string decimal exata quando exposta.

## 3. Retorno (PRICE_INDEX)

```
return = (endLevel / startLevel - 1) × 100
```

- Implementado em `calculateBenchmarkReturn({ benchmarkId, startLevel, endLevel })`.
- Rejeita `startLevel === 0`.
- Rejeita `benchmarkId` cujo `type !== 'PRICE_INDEX'` com `UnsupportedBenchmarkTypeError` (ADR-117).
- Aritmética decimal exata (`DecimalValue`), sem `parseFloat`/`Number`/`Math.pow`.

## 4. Resolução de data

- `getObservation(benchmarkId, date)` busca a observação exata; se ausente, retrocede até `maxLookbackDays`
  (default 7) procurando o **dia de negociação anterior**.
- **No future leakage:** nunca usa uma data futura. `Friday` ausente + `Monday` existente → `Friday` é
  indisponível (erro), não `Monday`.
- Fins de semana/feriados simplesmente não têm observação.

## 5. Provedores

```ts
interface BenchmarkDataProvider {
  readonly provider: string;
  getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation>;
  getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]>;
}
```

- `YahooBenchmarkDataProvider` (`YAHOO`), `StooqBenchmarkDataProvider` (`STOOQ`), `InMemoryBenchmarkDataProvider`
  (`IN_MEMORY`, determinístico para testes — **CI nunca chama rede**).
- DTOs externos (`YahooFinanceQuote`, `StooqCsvRow`) **nunca** vazam para fora do adapter.
- O `@atlas/benchmark-engine` é **zero I/O** nos caminhos de cálculo; apenas os adapters fazem `fetch`.

## 6. Cache

- `InMemoryBenchmarkCache` (chave `benchmarkId::date`), separado de caches de preço e de rate benchmarks
  (ADR-113).

## 7. Multi-moeda e indisponibilidade

- `IBOV` é `BRL`. Comparação apenas para carteiras/posições `BRL`.
- Sem FX. Carteira `USD` → benchmark `null` (não aplicável).
- `UNAVAILABLE` nunca é exibido como `0%`; a UI mostra travessão `—`.

## 8. Comparação

Ver `docs/contracts/portfolio-benchmark-comparison-v1.md`.

## 9. Erros

- `UnsupportedBenchmarkIdError` (`assertValidBenchmarkId`).
- `UnsupportedBenchmarkTypeError` (tipo de cálculo incompatível com o benchmark).
- Erros de provider (`Benchmark provider unavailable|error|invalid response`).

## 10. Anti-escopo

Sem Selic, IPCA, S&P 500, Nasdaq, alpha, beta, Sharpe, volatilidade, drawdown, correlação, tracking error,
information ratio, attribution, FX, recomendação ou gráfico avançado.
