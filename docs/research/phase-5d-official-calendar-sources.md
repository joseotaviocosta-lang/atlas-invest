# Project Atlas — Phase 5D: Official Calendar Sources & Taxonomy Research

## 1. Executive Summary

In institutional financial applications, date handling cannot rely on naive weekend-only assumptions (`getDay() === 0 || getDay() === 6`) or arbitrary 7-day lookbacks. A missing price or observation on a Monday may indicate that:

1. **The exchange was closed** (e.g. Carnival Monday, National Holiday) — this is a legitimate `CLOSED_DAY`, not a defect or data gap.
2. **The exchange was open, but the data provider failed to deliver the quotation** — this is an authentic `DATA_GAP`.
3. **The session is ongoing or has not yet concluded** — this is `NOT_PUBLISHED_YET` / `NOT_EXPECTED_YET`.
4. **Historical calendar data is not available for that period** — this is `CALENDAR_COVERAGE_MISSING`.

Phase 5D establishes the authoritative calendar foundation for Project Atlas, covering both **B3 Trading Sessions** and **Brazilian Banking / Business Days (ANBIMA / BACEN)**.

---

## 2. Official Authority Evaluation

### 2.1 B3 (Brasil, Bolsa, Balcão)

- **Authority**: Primary market operator for Brazilian equities, derivatives, and fixed income.
- **Calendar Scope**: Official trading sessions and settlement days across B3 segments.
- **Rule Changes (Post-2022 Harmonization)**:
  - Prior to 2022, B3 observed municipal holidays in São Paulo (e.g., January 25 - Aniversário de São Paulo, July 9 - Revolução Constitucionalista, November 20 - Consciência Negra).
  - Effective 2022, B3 unified its trading schedule to **trade normally on municipal and state holidays of São Paulo**, aligning operations with national federal holidays.
  - Exceptions: National holidays (Law 14.759/2023 made November 20 a national holiday starting 2024; December 31 is always a market non-trading day for year-end balance reconciliation).
- **Publication**: B3 publishes its official annual trading calendar in December for the subsequent year via circular letters and official portal feeds.

### 2.2 ANBIMA (Associação Brasileira das Entidades dos Mercados Financeiro e de Capitais)

- **Authority**: Regulatory and self-regulating body for Brazilian financial and capital markets.
- **Calendar Scope**: Business days for fixed income accrual, CDI compounding, debentures, public bonds (Tesouro Direto), and fund share pricing.
- **Calendar Convention**: Monday through Friday, excluding national federal holidays and mandatory non-banking dates decreed by CMN/Bacen.
- **Source**: Official ANBIMA business days table (`feriados_nacionais.xls` / API).

### 2.3 Banco Central do Brasil (BACEN)

- **Authority**: Central bank regulating the National Financial System (SFN).
- **Calendar Scope**: SFN banking operations, STR/PIX settlement windows, PTAX calculation and publication.
- **Rule (CMN Resolution)**: Banking agencies do not open on Saturdays, Sundays, national holidays, and on the last business day of the year (December 31 non-banking day).
- **PTAX Publication**: On banking business days only. If an international market is open but Brazil is in a national holiday, BCB does not compute PTAX.

---

## 3. Calendar Types & Differences

| Calendar Type           | Scope                        | Key Differences                                                                                                                                                                           | Used By                                          |
| :---------------------- | :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| **`B3_TRADING`**        | B3 exchange trading sessions | Trades on SP municipal holidays (post-2022); closed on Ash Wednesday until 13:00 BRT (special session); closed on Carnival, Good Friday, Corpus Christi, Christmas Eve afternoon / Dec 31 | Stock quotes, ETF quotes, FII quotes, IBOV index |
| **`BANKING`**           | SFN bank clearing & PTAX     | Closed on national holidays and Dec 31; banks open after 12:00 on Ash Wednesday                                                                                                           | PTAX (USD/BRL, EUR/BRL), Bank transfers          |
| **`BUSINESS` (ANBIMA)** | Capital markets accrual      | National holidays excluded; used for continuous CDI compounding                                                                                                                           | CDI, SELIC daily compounding                     |

---

## 4. Special Closures & Operational Rules

1. **Carnival (Monday and Tuesday)**:
   - Neither banks nor B3 trade.
2. **Ash Wednesday (Quarta-feira de Cinzas)**:
   - B3 trading session opens late (typically 13:00 BRT). Considered an `OPEN` trading day with a `SPECIAL_SESSION` flag.
3. **Good Friday (Sexta-feira Santa)**:
   - Closed nationwide.
4. **Corpus Christi**:
   - Closed nationwide for banking and B3.
5. **Year-End Non-Trading Day (December 31)**:
   - B3 and banks do NOT conduct trading or public banking operations.
6. **Exceptional Suspensions / Circuit Breakers**:
   - Extraordinary closures (e.g. pandemic declarations, national mourning decrees) require deterministic source provenance and reason tagging.

---

## 5. Design Decision for Project Atlas

1. **Two Core Calendar Types**:
   - `B3_TRADING`: Authoritative trading days for assets traded on B3 and the IBOV index.
   - `BANKING`: Authoritative banking days for PTAX, bank clearing, and CDI publication.
2. **Persistence Principle**:
   - Calendar days are stored explicitly with `(date, calendar_type)` as a unique primary key.
   - Each entry includes `is_open: boolean`, `reason: string`, `source: string`, `published_at: timestamp`.
3. **Strict Coverage Guard**:
   - If a requested date falls outside the persisted calendar range, the system returns `CALENDAR_COVERAGE_MISSING`. It **never** guesses or falls back to silent assumptions.
