# Project Atlas — Phase 5C: FX Provider & Semantics Evaluation

## 1. Executive Summary

Phase 5C expands Project Atlas from single-currency portfolios into **multi-currency portfolio valuation and deterministic reporting**.

In global wealth management, an investor holds assets denominated in foreign currencies (e.g., US Equities, ADRs, ETFs denominated in `USD`, European securities in `EUR`) as well as local Brazilian assets in `BRL`.

To provide a consolidated portfolio view without compromising financial integrity, Project Atlas establishes the following immutable principles:

1. **Native Currencies Remain Canonical**:
   - Every transaction, account balance, position, market quote, and cost basis retains its native currency (`BRL`, `USD`, `EUR`).
   - Native currency buckets are **never replaced, mutated, or silently coerced**.
2. **Deterministic Reporting Translation**:
   - Consolidated portfolio totals are translated into the investor's designated reporting currency (typically `BRL`) using **persisted point-in-time exchange rates**.
3. **Strict Zero Live Reads**:
   - Normal GET requests and valuation reads rely **strictly on persisted FX observations** in the database.
   - Missing FX rates are **never invented, never defaulted to 1.0, and never approximated as 0.0**.
   - If an exchange rate for a foreign holding is missing on the target date, the translated aggregate explicitly signals `PARTIAL` or `UNAVAILABLE`.
4. **Authoritative Official Source (BCB PTAX)**:
   - For BRL cross pairs (`USD/BRL`, `EUR/BRL`), the official authoritative benchmark is the **Banco Central do Brasil (BCB) PTAX closing rate** (_boletim de fechamento_).
5. **Exact Decimal Precision**:
   - Zero JavaScript floating-point math (`number`, `parseFloat()`, unary `+`). All rate storage, conversions, and totals utilize `Quantity`, `Money`, and `Decimal.js` (up to 18 decimal places).
6. **Strict Fiscal & Ledger Isolation**:
   - Brazilian tax rules (DARF, capital gains, exchange rate on settlement, tax exemption limits) belong strictly to `@atlas/tax-engine` and are **never computed or altered** by portfolio valuation or FX translation.

---

## 2. Currency Pair Definitions & Market Quotation Conventions

### 2.1 Currency Code Standards

Currencies are identified by their ISO 4217 3-letter codes (`BRL`, `USD`, `EUR`).

### 2.2 Currency Pair Representation (`baseCurrency` vs `quoteCurrency`)

In foreign exchange terminology:
$$\text{Pair} = \text{BASE} / \text{QUOTE}$$

- **`baseCurrency`**: The transaction unit being priced (e.g. `1 USD`).
- **`quoteCurrency`**: The pricing currency (e.g. `BRL`).
- **`rate`**: The number of units of `quoteCurrency` required to buy 1 unit of `baseCurrency`.

$$\text{Value in Quote Currency} = \text{Value in Base Currency} \times \text{Rate}$$

#### Example:

For `USD/BRL = 5.2500`:

- `baseCurrency`: `USD`
- `quoteCurrency`: `BRL`
- An asset holding worth `$1,000.00 USD` translated to `BRL` is:
  $$\$1,000.00 \times 5.2500 = \text{R\$ } 5,250.00$$

### 2.3 Quotation Direction Inversion Policy

If a pair is requested in reverse (e.g. converting `BRL` to `USD` using a persisted `USD/BRL` rate):

- The mathematical conversion is:
  $$\text{Rate}_{\text{QUOTE/BASE}} = \frac{1}{\text{Rate}_{\text{BASE/QUOTE}}}$$
- Inversion MUST use exact decimal division with at least 18 decimal places of precision:
  ```typescript
  invertedRate = new Decimal(1).dividedBy(rate);
  ```
- Any direct quotation stored in the canonical ledger/database should prioritize the direct quote against `BRL` (`USD/BRL`, `EUR/BRL`).

---

## 3. Authoritative Source Evaluation: BCB PTAX

### 3.1 What is PTAX?

PTAX is the daily reference exchange rate calculated and published by the Banco Central do Brasil (BACEN).

- It is the arithmetic average of exchange rates computed across 4 daily consultation windows conducted by BACEN with foreign exchange dealers.
- The **Boletim de Fechamento** (closing bulletin, published between 13:00 and 13:30 BRT on banking business days) represents the official end-of-day reference rate.

### 3.2 Rates Disclosed by BCB: Compra vs. Venda

For each currency, BCB discloses:

- **`cotacaoCompra`** (Bid): Rate at which dealers buy foreign currency from the market.
- **`cotacaoVenda`** (Ask / Offer): Rate at which dealers sell foreign currency to the market.

**Canonical Valuation Rule in Project Atlas**:
For valuing foreign assets in Brazilian Reais (`BRL`), the standard economic reference is the **PTAX Venda** (or closing midpoint where legally appropriate). In Brazilian wealth reporting and fund accounting, **PTAX Venda** is the standard benchmark for converting foreign asset values to BRL. The exact rate type (`MID`, `BID`, `ASK`) is recorded in the observation metadata, with `MID` / `ASK` default to official PTAX Venda.

### 3.3 Publication Frequency & Holiday Calendar

- **Frequency**: Business days (dias úteis bancários no Brasil).
- **Weekends and Holidays**: No PTAX is published on Saturdays, Sundays, or national banking holidays in Brazil.
- **Lookback Policy**: For weekend valuation or historical replay on non-business days, a bounded lookback (up to 7 calendar days to the most recent preceding banking business day) is applied to identify the effective reference rate. If no rate exists within the bounded window, the status is `UNAVAILABLE`.

### 3.4 Official Upstream Endpoints

#### A. BCB Olinda API (Modern Public REST Service)

The BCB Olinda API (`dadosabertos.bcb.gov.br`) provides structured JSON responses for daily currency quotes:

- **Endpoint**:
  `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='USD'&@dataInicial='MM-DD-YYYY'&@dataFinalCotacao='MM-DD-YYYY'&$format=json`
- **Output Fields**:
  - `cotacaoCompra`: Decimal string (e.g. `5.2494`)
  - `cotacaoVenda`: Decimal string (e.g. `5.2500`)
  - `dataHoraCotacao`: ISO timestamp
  - `tipoBoletim`: `"Fechamento"` (or intermediate windows)
- **Licensing**: Free public government open data (Open Data / Governo Federal). No commercial redistribution barrier.

#### B. BCB SGS API (Time Series Service)

- Series `10813`: Dólar americano (venda) - diário (PTAX fechamento)
- Series `1`: Dólar americano (compra) - diário (PTAX fechamento)
- Series `21619`: Euro (venda) - diário (PTAX fechamento)
- Format: JSON via `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{seriesId}/dados?formato=json`

#### C. Ingestion Strategy

- **Primary Live / Upstream Provider**: `BcbOlindaFxDataProvider` / `BcbSgsFxDataProvider` fetching authoritative PTAX data directly from Banco Central do Brasil.
- **Test Provider**: `InMemoryFxDataProvider` for deterministic unit, integration, and CI testing.

---

## 4. Multi-Currency Valuation Architecture & Invariants

### 4.1 Native Totals Preservation

Portfolio and account valuations produce segregated native totals:

```typescript
totalsByCurrency: {
  BRL: CurrencyValuationTotals,
  USD: CurrencyValuationTotals,
  EUR?: CurrencyValuationTotals
}
```

### 4.2 Translated Reporting Summary (`translatedSummary`)

When a portfolio contains assets in multiple currencies, a translated summary converts eligible foreign totals to the portfolio's `baseCurrency` (e.g. `BRL`):

```typescript
export interface TranslatedValuationSummary {
  reportingCurrency: Currency;
  totalMarketValue: MoneyJSON;
  totalCostBasis: MoneyJSON;
  totalUnrealizedGainLoss: MoneyJSON | null;
  totalUnrealizedGainLossPercent: string | null;
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  ratesUsed: Record<
    string,
    {
      baseCurrency: Currency;
      quoteCurrency: Currency;
      rate: string;
      rateDate: string;
      source: string;
    }
  >;
  untranslatedCurrencies: Currency[];
}
```

### 4.3 Invariant Guarantees

1. **Zero Silent Fallback**: If `USD/BRL` is not found, `USD` positions are NOT converted using 1.0 or 0.0. `totalMarketValue` reports only the portions with valid rates, or reflects `status: PARTIAL` / `UNAVAILABLE`.
2. **Zero Floating Point**: All multiplications $\text{USD} \times \text{FX} = \text{BRL}$ use `Decimal.js` via `Quantity.multiply()`.
3. **Auditability**: Every rate used in the translation is explicitly detailed in `ratesUsed` with reference date and provenance source.
