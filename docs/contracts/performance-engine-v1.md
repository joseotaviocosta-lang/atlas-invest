# Performance Engine Contract v1 — Fase 3C Foundation

**Status:** FOUNDATION — 2026-09-20
**Version:** `0.1.0`
**Engine:** `@atlas/performance-engine` (`PERFORMANCE_ENGINE_VERSION=0.1.0`)
**Depends:** `@atlas/domain` only (Money, LocalDate, Currency, Percentage, Quantity)

## 1. Boundary

```
Portfolio Observations (date, value, currency)
+ External Cash Flows (DEPOSIT/WITHDRAWAL, date, amount, direction)
+ Period (startDate, endDate)
  ↓ performance-engine (pure, deterministic, frozen, no I/O)
PortfolioPerformance (TWR + XIRR per currency, status, dataAvailability)
```

- `Portfolio Engine` fornece `quantity/cost` mas **nunca** é importado direto; `valuation-engine` fornece `marketValue` atual mas **não** é usado como histórico.
- `performance-engine` **nunca** lê ledger (16 tipos), `market-data` adapter, `Prisma`, `React`, `Nest`, `API`.
- `Application layer` transforma `read-models` em `PerformanceObservation`/`PerformanceCashFlow` canônicos.

## 2. External Cash Flow Semantics (ADR-099)

**External:** `DEPOSIT` (`INFLOW`, `EXTERNAL_CONTRIBUTION`) e `WITHDRAWAL` (`OUTFLOW`, `EXTERNAL_WITHDRAWAL`) — capital externo entrando/saindo do portfolio.

**Não external:** `BUY`, `SELL`, `DIVIDEND`, `JCP`, `FII_INCOME`, `FEE`, `TAX`, `TRANSFER_IN`, `TRANSFER_OUT`, `SPLIT`, `BONUS`, `AMORTIZATION` (parte do retorno interno), `SUBSCRIPTION` (já é external? Non — `SUBSCRIPTION` é compra via direito, internal).

- `TRANSFER` entre contas do mesmo portfolio: **zero efeito** consolidado (net 0).
- `DIVIDEND/JCP/FII` permanecem no `value` (afetam `TWR` positivamente).
- `FEE/TAX` reduzem `value` (afetam `TWR` negativamente) e **nunca** são neutralizados como flow.
- Mesmo dia: `deposit 1000` + `withdrawal 200` → net `800` (agregado com `Money` exato).

## 3. TWR (ADR-100)

**Subperiodo:** `R = (Ending - Beginning - NetFlow) / Beginning` (flows no fim do dia). Documentado como convenção explícita; limitação: sem valuation intraday, `flow` assume boundary.

**Segmentação:** por datas de `observations` e `cashFlows` (observação antes do flow → flow → observação após). `flow` em `endDate` pertence ao subperíodo `[start,end]`.

**Chaining:** `(1+r1)*(1+r2)*...*(1+rn)-1` com `Quantity`/`Percentage` exato, `Object.freeze`, nunca `Math.pow` para TWR (só `Quantity.divide/multiply`).

**Edge:**

- `beginningValue=0` → `INVALID_INPUT` (não divide por zero).
- `<2 observations` → `INSUFFICIENT_DATA`.
- `duplicate date` → `INVALID_INPUT`.
- `value <0` → `INVALID_INPUT` (portfolio value nunca negativo sem alavancagem).
- `startDate > endDate` → `INVALID_INPUT`.

**Result:** `TimeWeightedReturnResult { returnPercentage: Percentage, subperiods: readonly PerformanceSubperiod[], status, dataAvailability }`

## 4. XIRR (ADR-101)

**Input:** `dated cash flows` + `ending liquidation value` (valor final como último inflow).

- `DEPOSIT` (INFLOW) é **outflow** do investidor para XIRR (`-1000`).
- `WITHDRAWAL` (OUTFLOW) é **inflow** (`+200`).
- `endingValue` é inflow final (`+value`).

**Método:** Newton-Raphson com `t = days/365.2425`, `f(r)= Σ CF/(1+r)^t`, `f'`, `tolerance 1e-7`, `maxIter 100`, `guess 0.1`, bounds `[-0.9999,10]`. Bisection fallback se Newton falha ou `fLow*fHigh>0` → `NO_SOLUTION`.

**Status:** `CONVERGED|NO_SOLUTION|INSUFFICIENT_DATA|NUMERICAL_FAILURE`, `iterations`, `returnPercentage: Percentage|null`. Precisa `≥1 positivo e ≥1 negativo`, senão `NO_SOLUTION`. `Math.pow` documentado como único float controlado (tolerância decimal).

## 5. Multi-Currency

`BRL` e `USD` nunca somados. `calculatePortfolioPerformance` retorna `currencies: { BRL: { twr, xirr, status }, USD: {...} }` + `status: COMPLETE|PARTIAL|INSUFFICIENT_DATA|INVALID_INPUT` e `dataAvailability`. Cada moeda com suas `observations`/`flows` filtradas por `currency`.

## 6. Series & Sorting

`PerformanceSeries = readonly PerformanceObservation[]` ordenada por `LocalDate` (`compare`). Engine valida ou ordena deterministicamente; `duplicate date/currency` → `INVALID_INPUT`. `Cash flows` com mesmo dia netados via `Money.add` exato.

## 7. Data Availability

Sem `historical market value` suficiente, engine retorna `INSUFFICIENT_DATA`/`UNAVAILABLE` — **nunca** inventa `marketValue` via `cost` ou `current quote` retroativo.

```
observations <2 → UNAVAILABLE
INCOMPLETE cost → não é marketValue histórico
current quote ≠ histórico
```

Futuro provider histórico (snapshots, broker) alimentará `observations`. 3C apenas fundação + `mock/in-memory` test path.

## 8. API Foundation

```
GET /api/v1/portfolios/:portfolioId/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
Auth + ownership (404 hidden), period validação, decimal strings (`twr: "10.00"`, `xirr: "9.5"` ou null).
```

Enquanto sem `historical valuations`, responde `200 { status: INSUFFICIENT_DATA, dataAvailability: UNAVAILABLE, currencies: { BRL: { twr:null, xirr:null } } }` (não 500).

## 9. Imutabilidade & Determinismo

Todos outputs `Object.freeze`, `readonly`, ordenados, agregação com `Money`/`Quantity` exato. Mesmo input → mesmo output.

## 10. Version

`performance-engine@0.1.0`, `portfolio-engine@1.0.0-rc.1` FROZEN, `valuation@0.1.0` unchanged, `market-data@0.1.0` unchanged.

**Anti-scope:** sem `benchmark`, `FX`, `allocation`, `Sharpe`, `drawdown`, `chart`.
