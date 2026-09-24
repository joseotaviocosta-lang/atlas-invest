# Rate Benchmark v1 — CDI (Fase 3G)

**Status:** FOUNDATION — 2026-09-21
**Engine:** `@atlas/benchmark-engine` `0.2.0`
**Escopo:** benchmarks de **série de taxas** (`RATE_SERIES`), começando por `CDI`.

> `PRICE_INDEX != RATE_SERIES` (ADR-117). CDI **nunca** é modelado como índice de preço.

## 1. Identidade canônica

| Campo                       | Valor                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `BenchmarkId`               | `'CDI'`                                                                              |
| `BENCHMARK_DEFINITIONS.CDI` | `{ id: 'CDI', name: 'CDI', shortName: 'CDI', currency: 'BRL', type: 'RATE_SERIES' }` |

O código de série do provedor (`12` no BCB) é **metadado**, nunca identidade (ADR-057/ADR-118).

## 2. Fonte institucional (ADR-118)

| Item              | Valor                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Instituição       | Banco Central do Brasil (BCB)                                                                                     |
| Endpoint          | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=dd/mm/yyyy&dataFinal=dd/mm/yyyy` |
| Código da série   | `12` (SGS)                                                                                                        |
| Nome oficial      | `Taxa de juros - CDI`                                                                                             |
| Periodicidade     | diária, **dias úteis**                                                                                            |
| Unidade           | **`DAILY_PERCENT`** — percentual ao dia (`% a.d.`)                                                                |
| Calendário        | apenas dias úteis publicados; sábados, domingos e feriados **não** possuem observação                             |
| Data              | civil `LocalDate` (`YYYY-MM-DD`), sem fuso horário                                                                |
| Credenciais       | **não exige token** (API pública do BCB)                                                                          |
| Revisão histórica | o BCB pode revisar a série; o adapter sempre consulta o período solicitado                                        |

Valores observados (verificação real, 2026): `2026-01-02 → 0.055131`, `2026-09-01 → 0.051660`
(percentual ao dia, não anualizado).

## 3. Contrato de observação de taxa

```ts
type RateBenchmarkUnit = 'DAILY_PERCENT' | 'DAILY_FACTOR';

interface RateBenchmarkObservation {
  benchmarkId: BenchmarkId; // 'CDI'
  date: LocalDate;
  rate: DecimalValue; // decimal exato
  unit: RateBenchmarkUnit; // unidade explícita — nunca um número sem unidade
  source: string; // 'BCB'
}
```

**Unidades suportadas apenas:** `DAILY_PERCENT` (`1 + rate/100`) e `DAILY_FACTOR` (`rate` direto).
`ANNUAL_PERCENT` é **intencionalmente não modelado**: converter taxa anualizada em fator diário exige
convenção oficial que o BCB não publica para a série 12 (que já é diária). Unidade desconhecida lança
`UnsupportedRateUnitError` — nunca é composta silenciosamente (ADR-119).

## 4. Provider de taxas (ADR-118)

```ts
interface RateBenchmarkDataProvider {
  readonly provider: string;
  getRateObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<RateBenchmarkObservation>;
  getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]>;
}
```

- `BcbRateBenchmarkDataProvider` (`provider: 'BCB'`, metadata: `institution`, `providerSeriesCode: '12'`,
  `unit: 'DAILY_PERCENT'`, `frequency: 'DAILY_BUSINESS_DAYS'`).
- `InMemoryRateBenchmarkDataProvider` (`IN_MEMORY`, determinístico; **CI nunca chama rede**).
- DTOs do BCB (`{ data, valor }`) **nunca** vazam para fora do adapter.
- Preferência por **range fetch** (`getRateObservations`).
- Linhas fora do intervalo solicitado e linhas malformadas são descartadas.
- Datas duplicadas: a última vence.

## 5. Cálculo (ADR-119)

```
dailyFactor   = 1 + rate/100     (DAILY_PERCENT)
              = rate             (DAILY_FACTOR)
accumulatedFactor = ∏ dailyFactor
returnPercentage  = (accumulatedFactor - 1) × 100
```

- `calculateRateBenchmarkReturn({ benchmarkId, observations, startDate, endDate, expectedObservationDates? })`.
- Aritmética **exata** com `DecimalValue`; sem `parseFloat`, `Number`, `Math.pow`.
- Exemplo canônico: `1% + 1% = 2.01%` (não `2.00%`).
- Taxa zero é segura (`0 + 0 = 0%`).
- Observações ausentes **nunca** são tratadas como `0%` (ADR-121).
- Resultado congelado (`Object.freeze`); entrada não é mutada; ordenação canônica por `date ASC`.

### Contrato de retorno

```ts
interface RateBenchmarkReturn {
  benchmarkId: BenchmarkId;
  startDate: LocalDate;
  endDate: LocalDate;
  observationCount: number;
  accumulatedFactor: DecimalValue;
  returnPercentage: Percentage | null; // null quando UNAVAILABLE (nunca 0%)
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
}
```

## 6. Fronteiras do período (ADR-120)

Semântica fixada: **`(startDate, endDate]`** — início **exclusivo**, fim **inclusivo**.

- A taxa publicada em `D` remunera o dia que se encerra em `D`; por isso a observação de `startDate` é
  excluída e a de `endDate` é incluída.
- `startDate === endDate` → intervalo vazio → `UNAVAILABLE`.
- `startDate > endDate` → erro de período inválido.
- Virada de mês e de ano suportadas (datas civis).
- Sábados, domingos e feriados sem taxa **não** tornam o resultado `PARTIAL`.

## 7. Qualidade de dados (ADR-121)

| Status        | Significado                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `AVAILABLE`   | ≥ 1 observação no intervalo e cobertura esperada satisfeita                                  |
| `PARTIAL`     | `expectedObservationDates` fornecido e a série cobre estritamente menos dias úteis esperados |
| `UNAVAILABLE` | nenhuma observação no intervalo (`returnPercentage: null`)                                   |

- **Limitação 3G:** sem um calendário oficial de dias úteis, não é possível distinguir feriado legítimo
  de observação indevidamente ausente. Por isso o servidor **não inventa calendário**: quando
  `expectedObservationDates` não é informado, o status é `AVAILABLE` ou `UNAVAILABLE`. O status `PARTIAL`
  é suportado pelo contrato e pelo engine, pronto para quando um calendário autoritativo for integrado.
- Ausência nunca é `0%`.
- Fins de semana/feriados são ausências legítimas, não falhas de qualidade.

## 8. Multi-moeda

- `CDI` é `BRL`. Comparação permitida apenas para `BRL`.
- `USD`/`EUR` → não aplicável (`benchmark: null`), **sem FX**.

## 9. Serialização

- `returnPercentage` e `differencePercentagePoints` são **strings decimais exatas** (`"9.42"`, `"2.58"`, `"-2"`).
- `accumulatedFactor` é `DecimalValue` exato.
- `observationCount` é inteiro.
- `null` significa indisponível, nunca `"0"`.

## 10. Comparação com TWR

- A comparação usa exclusivamente o **TWR** da carteira (nunca XIRR), em pontos percentuais.
- Ver `docs/contracts/portfolio-benchmark-comparison-v1.md`.

## 11. Smoke real

```
pnpm benchmark:rate-smoke --benchmark CDI --start 2026-01-02 --end 2026-09-18
```

Usa o `BcbRateBenchmarkDataProvider` real (nunca `InMemory`), imprime unidade, série, contagem,
fator acumulado e retorno, e só retorna sucesso com `observationCount > 0`, unidade confirmada e retorno
calculado.

## 12. Anti-escopo

Sem Selic, IPCA, S&P 500, Nasdaq, alpha, beta, Sharpe, volatilidade, drawdown, correlação, tracking error,
information ratio, attribution, FX, Tax Engine, recomendação, rebalance, gráfico final, performance por
ativo ou por conta.
