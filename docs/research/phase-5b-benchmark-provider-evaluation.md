# Project Atlas — Phase 5B: Benchmark Provider & Semantics Evaluation

## 1. Executive Summary

This research document establishes the canonical semantics, authoritative sources, frequency characteristics, calculation conventions, and licensing boundaries for financial benchmarks integrated into Project Atlas in Phase 5B.

Project Atlas adheres to the principle that **benchmarks are heterogeneous**. A price index (IBOV) has fundamentally different mathematics, data frequency, and publication semantics than an interbank interest rate (CDI), a monetary policy target (SELIC), or a monthly inflation gauge (IPCA). Homogenizing these series into a single generic "close" table without semantic metadata causes severe data corruption, distorted returns, and false performance claims.

---

## 2. Benchmark Semantics Matrix

| Series                    | Authoritative Source           | Economic Meaning                                     | Primary Type              | Frequency                       | Unit / Metric                               | Compounding / Formula                                     | Phase 5B Role             |
| :------------------------ | :----------------------------- | :--------------------------------------------------- | :------------------------ | :------------------------------ | :------------------------------------------ | :-------------------------------------------------------- | :------------------------ |
| **IBOV** (Ibovespa)       | **B3** (Bolsa, Balcão, Brasil) | Total return index of the most liquid equities on B3 | `PRICE_INDEX`             | Daily (trading sessions)        | Index points (e.g. `130,500.25`)            | $(L_{\text{end}} / L_{\text{start}} - 1) \times 100$      | **PERFORMANCE_BENCHMARK** |
| **CDI** (DI-Over)         | **B3** / **BACEN** (SGS 12)    | Overnight interbank deposit transactions rate        | `RATE_SERIES`             | Daily (financial business days) | Daily percent rate (e.g. `0.040182%`)       | $\left(\prod_{t=1}^N (1 + r_t/100) - 1\right) \times 100$ | **PERFORMANCE_BENCHMARK** |
| **SELIC** (Over / Target) | **BACEN** / **COPOM**          | Central bank monetary policy rate                    | `RATE_SERIES`             | Daily (Over) / Periodic (Meta)  | Annualized rate (`% a.a.`)                  | Compounded daily or step-wise                             | **MACRO_ONLY**            |
| **IPCA**                  | **IBGE**                       | Official national consumer inflation index           | `PRICE_INDEX` / Inflation | Monthly                         | Monthly variation (`%`) / Accumulated index | Monthly link; no official daily rate                      | **MACRO_ONLY**            |

---

## 3. Detailed Series Evaluation

### 3.1. IBOVESPA (IBOV)

- **Source**: B3 S.A. – Brasil, Bolsa, Balcão.
- **Economic Nature**: Gross total return index comprising stocks accounting for ~85% of traded volume on B3. Dividends, JCP, and subscription rights are automatically reinvested into the index portfolio.
- **Publication Schedule**: Real-time intraday calculation; official closing index level published upon market closing reconciliation (approx. 18:15 BRT).
- **Calendar**: B3 trading calendar (national business days minus B3 trading holidays).
- **Unit**: Dimensionless points (`NUMERIC(38,18)`).
- **Return Calculation**:
  $$\text{Return}_{\text{IBOV}} = \left( \frac{\text{Level}_{\text{end}}}{\text{Level}_{\text{start}}} - 1 \right) \times 100$$
- **Revision Semantics**: B3 published closing levels are definitive. Revisions are exceptionally rare and tracked via revision audit.
- **Licensing & Access**:
  - _Local Owner MVP_: Public EOD historical data from Stooq (`^BVSP`), Yahoo (`^BVSP`), or BRAPI (`^BVSP`).
  - _Commercial SaaS_: B3 Index Redistribution Agreement required for commercial distribution.

### 3.2. CDI (Certificado de Depósito Interbancário)

- **Source**: B3 (calculation agent) / Banco Central do Brasil (SGS Series 12).
- **Economic Nature**: Daily weighted average of uncollateralized interbank deposits executed between commercial and investment banks. Standard hurdle rate for fixed income, multimercado funds, and equity opportunity cost in Brazil.
- **Publication Schedule**: Disclosed every business day evening (~19:30 BRT) by B3; registered in BACEN SGS on $D+1$.
- **Calendar**: National financial business days (excludes Saturdays, Sundays, and national banking holidays).
- **Unit**: Daily rate in percentage points (`DAILY_PERCENT`, e.g. `0.040182%`).
- **Return Calculation**:
  $$\text{Accumulated Factor} = \prod_{t \in (T_{\text{start}}, T_{\text{end}}]} \left( 1 + \frac{r_t}{100} \right)$$
  $$\text{Return}_{\text{CDI}} = (\text{Accumulated Factor} - 1) \times 100$$
  - **Boundary Rule (ADR-120)**: Start boundary is _exclusive_, end boundary is _inclusive_ (`(startDate, endDate]`), matching official Brazilian banking accrual convention where rate published on day $D$ remunerates the period ending on $D$.
  - **Zero Floats (ADR-119)**: Decimal arithmetic only (`Quantity`), zero `Math.pow` or IEEE 754 precision distortion.
- **Licensing & Access**:
  - _Source_: BACEN Public Open Data API (`api.bcb.gov.br`, Series 12).
  - _Terms_: Free, public government open data without commercial redistribution restrictions.

### 3.3. SELIC

- **Source**: Banco Central do Brasil.
- **Distinction**:
  - _Meta SELIC_: Annualized policy rate set by COPOM (e.g. `10.75% a.a.`).
  - _Taxa SELIC Over (SGS 11)_: Daily effective overnight rate for repo operations backed by Tesouro Direto / federal bonds.
- **Phase 5B Decision**: In Brazilian equity and multi-asset wealth management, CDI is the universal benchmark, tracking Selic Over closely (typically ~0.10% spread). SELIC is classified as **MACRO_ONLY** for informational display on the Mercado surface and is not used for portfolio relative returns.

### 3.4. IPCA

- **Source**: Instituto Brasileiro de Geografia e Estatística (IBGE).
- **Economic Nature**: Broad Consumer Price Index measuring inflation for families earning 1 to 40 minimum wages.
- **Frequency**: **MONTHLY**. Disclosed around the 10th of the following month.
- **Daily Interpolation Prohibition**:
  - Project Atlas strictly prohibits creating synthetic daily IPCA observations via linear interpolation for portfolio performance benchmarking.
  - Linear daily interpolation assumes uniform intra-month inflation, which fabricates fictitious benchmark observations and violates Invariant 6.
- **Phase 5B Decision**: **MACRO_ONLY**. Persisted monthly values may be shown as macroeconomic context on Mercado/Home, but IPCA is formally excluded from daily relative return comparisons in Rentabilidade.

---

## 4. Provider Selection & Ingestion Architecture

| Benchmark | Primary Provider (Local/Dev)          | Fallback Provider    | Test Provider | Endpoint / Source                                |
| :-------- | :------------------------------------ | :------------------- | :------------ | :----------------------------------------------- |
| **IBOV**  | **Yahoo Finance** (`^BVSP`)           | **Stooq** (`^bvp`)   | **IN_MEMORY** | EOD closing point series                         |
| **CDI**   | **BACEN SGS** (Series 12)             | None (Authoritative) | **IN_MEMORY** | `api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados` |
| **IPCA**  | **BACEN SGS** (Series 433) / **IBGE** | None                 | **IN_MEMORY** | Monthly inflation series                         |
| **SELIC** | **BACEN SGS** (Series 432 / 11)       | None                 | **IN_MEMORY** | Macro context                                    |

> **Licensing & Commercial SaaS Policy**:
>
> - **Canonical Identity**: The benchmark is strictly identified by `IBOV`. Provider symbols (`^BVSP`, `^bvp`) are private adapter implementation details.
> - **Local / Development MVP**: Yahoo Finance is used as the primary best-effort EOD ingestion provider due to Stooq anti-bot/403 restrictions on server requests. Stooq is retained as secondary fallback.
> - **Commercial Production SaaS**: Yahoo Finance is **NOT** a licensed commercial redistribution source. Direct B3 redistribution agreement remains a mandatory licensing blocker before commercial production deployment.
> - **Provenance & Read-Isolation**: Provider provenance is recorded in `benchmark_observations.source`. All client reads resolve strictly from persisted tables (zero network calls).

---

## 5. Persistence Architecture (Migration 25)

To guarantee that benchmarks are NOT stored as generic market prices and that their distinct types, frequencies, and units are preserved, the following database schema is established:

```prisma
model BenchmarkObservation {
  id              String   @id @default(uuid()) @db.Uuid
  benchmarkId     String   @map("benchmark_id") @db.VarChar(32)
  referenceDate   DateTime @map("reference_date") @db.Date
  value           Decimal  @map("value") @db.Decimal(38, 18)
  unit            String   @map("unit") @db.VarChar(32)
  frequency       String   @map("frequency") @db.VarChar(32)
  source          String   @map("source") @db.VarChar(64)
  firstFetchedAt  DateTime @default(now()) @map("first_fetched_at") @db.Timestamptz(6)
  lastFetchedAt   DateTime @default(now()) @map("last_fetched_at") @db.Timestamptz(6)
  fetchCount      Int      @default(1) @map("fetch_count")
  revisedAt       DateTime? @map("revised_at") @db.Timestamptz(6)

  revisions       BenchmarkObservationRevision[]

  @@unique([benchmarkId, referenceDate, source], name: "uq_benchmark_observation")
  @@index([benchmarkId, referenceDate], name: "idx_benchmark_observations_lookup")
  @@map("benchmark_observations")
}

model BenchmarkObservationRevision {
  id                      String   @id @default(uuid()) @db.Uuid
  benchmarkObservationId String   @map("benchmark_observation_id") @db.Uuid
  changedAt               DateTime @default(now()) @map("changed_at") @db.Timestamptz(6)
  priorValue              Decimal  @map("prior_value") @db.Decimal(38, 18)
  newValue                Decimal  @map("new_value") @db.Decimal(38, 18)
  reason                  String?  @map("reason") @db.Text

  observation             BenchmarkObservation @relation(fields: [benchmarkObservationId], references: [id], onDelete: Cascade)

  @@index([benchmarkObservationId], name: "idx_benchmark_revisions_observation")
  @@map("benchmark_observation_revisions")
}
```

### Invariants:

1. **Zero Floats**: `NUMERIC(38,18)` for all index levels and daily rates.
2. **Explicit Type Metadata**: `unit` (`INDEX_POINTS`, `DAILY_PERCENT`, `MONTHLY_PERCENT`) and `frequency` (`DAILY`, `MONTHLY`) recorded directly with the observation.
3. **Audit Trail**: Any provider revision to historical benchmark numbers triggers an atomic revision record in `benchmark_observation_revisions`.
4. **Zero Live Calls on Read**: `PersistedBenchmarkDataProvider` and `PersistedRateBenchmarkDataProvider` query `benchmark_observations` exclusively.
