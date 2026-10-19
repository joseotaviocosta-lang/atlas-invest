# Project Atlas — Phase 5D: Macro Series Sources & Contracts Research

## 1. Executive Summary

Macroeconomic indicators provide essential context for investment decisions, benchmarking hurdle rates, and inflation erosion awareness. In Brazilian finance, two primary macroeconomic indicators are paramount:

1. **IPCA (Índice Nacional de Preços ao Consumidor Amplo)**: The official inflation index of Brazil, calculated and published by IBGE.
2. **Taxa SELIC (Sistema Especial de Liquidação e de Custódia)**: The key policy interest rate set by the Central Bank's Monetary Policy Committee (Copom).

Phase 5D establishes the persisted macro-series foundation, guaranteeing:

- **Zero Live Reads**: Standard read requests never query external endpoints during user interaction.
- **Strict Distinction Between Target and Effective Rates**: `SELIC_TARGET` vs `SELIC_EFFECTIVE`.
- **Honest Publication Lag**: IPCA is monthly; the current month's IPCA does not exist until published in the subsequent month. No daily interpolation.
- **Fiscal & Valuation Isolation**: Macro indicators serve strictly as contextual information. They do not leak into portfolio return or domestic tax math.

---

## 2. IPCA (Índice Nacional de Preços ao Consumidor Amplo)

### 2.1 Authority & Source

- **Primary Source**: Instituto Brasileiro de Geografia e Estatística (IBGE).
- **Secondary Authoritative API**: Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS), Series `433` (IPCA - Variação mensal %).
- **Reference Period**: Calendar month (e.g., `2026-09`).
- **Publication Schedule**: Released typically between the 8th and 12th calendar day of the subsequent month (e.g., September 2026 IPCA is published ~October 10, 2026).

### 2.2 Canonical Unit & Frequency

- **Frequency**: `MONTHLY`.
- **Canonical Unit**: `PERCENT` (Monthly percentage change, e.g., `0.44%`).
- **Index Number (Número-Índice)**: SGS Series `433` publishes monthly percentage variation; series `10844` publishes the index level (base Dec/1993 = 100).
- **Project Atlas Phase 5D Contract**:
  - Focuses on monthly variation rate (`PERCENT`) for macroeconomic display.
  - No synthetic daily linear interpolation.
  - Status before publication: `NOT_PUBLISHED_YET`.

---

## 3. Taxa SELIC

### 3.1 Distinction: Meta Copom vs Taxa Efetiva

1. **`SELIC_TARGET` (Meta Selic fixada pelo Copom)**:
   - **Authority**: Comitê de Política Monetária (Copom / Banco Central).
   - **BCB SGS Series**: `432` (Taxa de juros - Selic fixada pelo Copom % a.a.).
   - **Nature**: Event-driven / step function. Changes only following Copom scheduled meetings (8 times per year) or extraordinary decisions.
   - **Unit**: `% a.a.` (Annualized percentage rate, e.g., `10.75% a.a.`).
   - **Significance**: The headline interest rate quoted in financial news and economic projections.

2. **`SELIC_EFFECTIVE` (Taxa Selic Over / Efetiva Anualizada)**:
   - **Authority**: Demab / Banco Central do Brasil.
   - **BCB SGS Series**: `1178` (Taxa Selic anualizada base 252 % a.a.) or `11` (Taxa Selic diária %).
   - **Nature**: Daily trading rate resulting from interbank repo transactions backed by federal government bonds.
   - **Unit**: `% a.a.` (252 business days convention).
   - **Significance**: Closely tracks CDI (typically within 0.10% spread); used in operational yield accrual.

### 3.2 Canonical Selection for Phase 5D Context

- For human-facing macroeconomic context (e.g. Market screen "TAXA SELIC"), `SELIC_TARGET` is the canonical headline indicator.
- The system explicitly records `series_id`: `SELIC_TARGET` (`SGS_432`) and optionally `SELIC_EFFECTIVE` (`SGS_1178`), with zero ambiguity between the two.

---

## 4. Revision & Publication Semantics

1. **Revisions**:
   - While SELIC decisions are definitive from the effective date, preliminary inflation figures (IPCA-15) are distinct from final IPCA. Final IPCA is exceptionally subject to official correction.
   - If an observation changes, the previous observation is archived into `macro_observation_revisions`.
2. **Date Alignment**:
   - For `MONTHLY` series: `reference_period` is stored as `YYYY-MM` (or reference date `YYYY-MM-01`), with explicit `published_at` date.
   - For `EVENT_DRIVEN` / `DAILY` series: `reference_date` is stored as `YYYY-MM-DD`.

---

## 5. Architectural Isolation

1. **Portfolio Performance**:
   - IPCA and SELIC are NOT used as portfolio benchmarks unless explicitly configured by the user in future phases.
   - TWR calculations continue to use canonical benchmarks (`IBOV`, `CDI`).
2. **Tax Engine**:
   - Tax engine late-payment calculation uses its own verified table `tax_interest_rates` from Receita Federal snapshots (Phase 4D.2). Phase 5D macro tables do not interfere with tax compliance.
