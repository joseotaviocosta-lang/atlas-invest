# Phase 5D: Official Calendar & Macro Context Foundation

## 1. Executive Summary

Phase 5D establishes the authoritative calendar and macroeconomic foundation for Project Atlas, providing:

1. **Official Trading & Banking Calendars (`B3_TRADING` and `BANKING`)**: Authoritative Brazilian civil and financial calendars distinguishing open market sessions from weekends, national holidays, and special market closures.
2. **Missing Observation Classification**: Rigorous deterministic classification preventing artificial "data gaps" on closed market days:
   - `CLOSED_DAY`: Market was officially closed (weekend, national holiday, special closure).
   - `DATA_GAP`: Market was open, but the provider failed to supply data.
   - `NOT_PUBLISHED_YET`: Open session in the future or not yet published.
   - `EXPECTED`: Open session with data present.
   - `CALENDAR_COVERAGE_MISSING`: Date outside loaded official calendar coverage.
3. **Macroeconomic Series Foundation (`IPCA`, `SELIC_TARGET`, `SELIC_EFFECTIVE`)**:
   - Official BCB SGS provider (`sgs.433` for IPCA monthly variation, `sgs.432` for Copom Target % a.a., `sgs.1178` for SELIC annualized effective % a.a.).
   - Persistent tables `macro_observations` and `macro_observation_revisions` capturing official values, units, frequencies, and upstream corrections.
4. **Zero Live Read Invariant**:
   - All normal API read endpoints (`/api/v1/calendars/:calendarType/coverage`, `/resolve`, `/api/v1/macro/context`, `/:seriesId/latest`, `/:seriesId/coverage`) read **exclusively from persisted database rows**.
   - Ingestion is strictly explicit via `POST /api/v1/calendars/:calendarType/update` and `POST /api/v1/macro/:seriesId/update`.
5. **No Synthetic Interpolation**: No artificial linear interpolation or invented prices on missing macro dates or market holidays.

---

## 2. Database Architecture & Migrations

### Migration 27: `20261018120000_add_official_calendar_days`

- Table: `calendar_days`
- Columns:
  - `id` (UUID PK)
  - `calendar_type` (VARCHAR(32)): `B3_TRADING` or `BANKING`
  - `date` (DATE)
  - `is_open` (BOOLEAN)
  - `reason` (VARCHAR(255), nullable)
  - `source` (VARCHAR(64))
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- Constraints:
  - `UNIQUE (calendar_type, date)`
  - Indexes on `(calendar_type, date)` and `(date)`

### Migration 28: `20261018180000_add_macro_observations_and_revisions`

- Table: `macro_observations`
  - Columns:
    - `id` (UUID PK)
    - `series_id` (VARCHAR(32)): `IPCA`, `SELIC_TARGET`, `SELIC_EFFECTIVE`
    - `reference_date` (DATE)
    - `value` (NUMERIC(38, 18))
    - `unit` (VARCHAR(32)): `PERCENT`, `PERCENT_PER_ANNUM`, `INDEX_POINTS`
    - `frequency` (VARCHAR(32)): `MONTHLY`, `EVENT_DRIVEN`, `DAILY`
    - `source` (VARCHAR(64))
    - `published_at` (TIMESTAMPTZ, nullable)
    - `first_fetched_at`, `last_fetched_at` (TIMESTAMPTZ)
    - `fetch_count` (INT default 1)
    - `revised_at` (TIMESTAMPTZ, nullable)
    - `created_at`, `updated_at` (TIMESTAMPTZ)
  - Constraints:
    - `UNIQUE (series_id, reference_date, source)`
    - Indexes on `(series_id, reference_date)`, `(reference_date)`, `(source)`
- Table: `macro_observation_revisions`
  - Columns:
    - `id` (UUID PK)
    - `macro_observation_id` (UUID FK -> `macro_observations.id` ON DELETE CASCADE)
    - `changed_at` (TIMESTAMPTZ)
    - `prior_value` (NUMERIC(38, 18))
    - `new_value` (NUMERIC(38, 18))
    - `reason` (VARCHAR(255), nullable)
    - `created_at` (TIMESTAMPTZ)
  - Index on `(macro_observation_id)`

---

## 3. Official Calendar Specification

### Brazilian Official Calendar Engine

- Meeus/Jones/Butcher algorithm for exact astronomical Easter Sunday calculation across any year.
- Movable holidays:
  - Carnaval (Segunda-feira): Easter - 48 days
  - Carnaval (Terça-feira): Easter - 47 days
  - Quarta-feira de Cinzas: Easter - 46 days (Special session open: 13h B3, 12h banking)
  - Paixão de Cristo (Sexta-feira Santa): Easter - 2 days
  - Corpus Christi: Easter + 60 days
- Fixed national holidays:
  - Jan 01: Confraternização Universal
  - Apr 21: Tiradentes
  - May 01: Dia do Trabalho
  - Sep 07: Independência do Brasil
  - Oct 12: Nossa Senhora Aparecida
  - Nov 02: Finados
  - Nov 15: Proclamação da República
  - Nov 20: Dia da Consciência Negra (Federal Law 14.759/2023)
  - Dec 25: Natal
  - Dec 31: Balanço Anual / Sem expediente bancário e de negociação

### B3 Post-2022 Trading Calendar Alignment

Since 2022, B3 operates normally on São Paulo municipal holidays (Jan 25 Anniversary of São Paulo and Jul 9 Constitutionalist Revolution), unifying the national equity trading calendar.

### Official Rule Provenance Traceability

| Rule Category                   | Calendar                 | Implementation Method                            | Source Authority    | Legal / Regulatory Reference               | Classification                              |
| :------------------------------ | :----------------------- | :----------------------------------------------- | :------------------ | :----------------------------------------- | :------------------------------------------ |
| **Weekends (Sat/Sun)**          | `B3_TRADING` / `BANKING` | `BrazilianOfficialCalendarProvider.generateYear` | BACEN / B3 / CLT    | Federal Law 605/1949                       | `CODIFIED_LEGAL_RULE`                       |
| **National Fixed Holidays**     | `B3_TRADING` / `BANKING` | `generateOfficialBrazilianHolidays`              | Federal Legislation | Laws 662/1949 & 10.607/2002                | `CODIFIED_LEGAL_RULE`                       |
| **Carnaval (Mon/Tue)**          | `B3_TRADING` / `BANKING` | `computeEasterSunday` -48/-47d                   | B3 / CMN / BACEN    | B3 Calendar & CMN Res. 4.880/2020          | `ALGORITHMIC_DERIVATION_FROM_OFFICIAL_RULE` |
| **Ash Wednesday**               | `B3_TRADING` / `BANKING` | `computeEasterSunday` -46d                       | B3 / BACEN          | B3 Circular Letter (13h) / BACEN (12h)     | `ALGORITHMIC_DERIVATION_FROM_OFFICIAL_RULE` |
| **Good Friday**                 | `B3_TRADING` / `BANKING` | `computeEasterSunday` -2d                        | Federal Legislation | Federal Law 9.093/1995                     | `ALGORITHMIC_DERIVATION_FROM_OFFICIAL_RULE` |
| **Corpus Christi**              | `B3_TRADING` / `BANKING` | `computeEasterSunday` +60d                       | BACEN / B3          | BACEN Circular & Municipal/Federal decrees | `ALGORITHMIC_DERIVATION_FROM_OFFICIAL_RULE` |
| **Consciência Negra (Nov 20)**  | `B3_TRADING` / `BANKING` | `generateOfficialBrazilianHolidays`              | Federal Legislation | Federal Law 14.759/2023                    | `CODIFIED_LEGAL_RULE`                       |
| **Balanço Anual (Dec 31)**      | `B3_TRADING` / `BANKING` | `generateOfficialBrazilianHolidays`              | CMN / BACEN / B3    | CMN Res. 4.880/2020 Art. 3º                | `OFFICIAL_SOURCE_MAPPED`                    |
| **SP Holidays (Jan 25, Jul 9)** | `B3_TRADING`             | B3 Unified Trading Schedule                      | B3 VOP Operations   | B3 External Comm. 011/2021-VOP             | `OFFICIAL_SOURCE_MAPPED`                    |
| **Local Project Assumptions**   | None                     | —                                                | None                | No artificial assumptions                  | `NONE`                                      |

### Special Session Semantics (Ash Wednesday)

- **Date**: `2026-02-18`
- **B3_TRADING**: `isOpen = true`, reason: `Quarta-feira de Cinzas (Início das negociações às 13h)`.
- **BANKING**: `isOpen = true`, reason: `Quarta-feira de Cinzas (Início das negociações às 13h)`.
- **Consumer Impact**: For Phase 5D EOD and historical observation classification, consumers require the civil-date binary status (`is_open = true`) to expect daily settlement/closing values. The opening schedule metadata is preserved transparently for informational audit without altering daily observation expectations.

---

## 4. API Endpoints

### Calendars (`/api/v1/calendars`)

- `GET /api/v1/calendars/:calendarType/coverage`: Returns minDate, maxDate, totalDays, openDays, closedDays, sources, and latestImportedAt.
- `GET /api/v1/calendars/:calendarType/resolve?date=YYYY-MM-DD&hasData=boolean`: Resolves day status (`CLOSED_DAY`, `DATA_GAP`, `NOT_PUBLISHED_YET`, `EXPECTED`, `CALENDAR_COVERAGE_MISSING`).
- `POST /api/v1/calendars/:calendarType/update`: Explicit generation and persistence of official calendar sessions and closures for a date range.

### Macroeconomic Series (`/api/v1/macro`)

- `GET /api/v1/macro/context`: Returns latest persisted macroeconomic context summary (`ipcaMonthly`, `selicTarget`, `selicEffective`).
- `GET /api/v1/macro/:seriesId/latest`: Returns latest persisted observation for a given series.
- `GET /api/v1/macro/:seriesId/coverage`: Returns count, minReferenceDate, maxReferenceDate, latestPublishedAt, source, and frequency.
- `POST /api/v1/macro/:seriesId/update`: Explicit ingestion from BCB SGS for a date range with idempotent revision tracking.

---

## 5. UI Integration

- **Web Market Page (`/market`)**:
  - Connects to `/api/v1/macro/context` via React Query (`queryKey: ['macro-context']`).
  - **Freshness Contract**: Configured with `staleTime: 0` and `refetchOnMount: 'always'`, guaranteeing that every intentional visit or remount retrieves the latest persisted macroeconomic context without stale retention after administrative updates (`POST /api/v1/macro/:seriesId/update`).
  - The macro panel (`MacroIndicatorCards`) renders five headline cards: `IBOVESPA`, `SELIC META`, `SELIC EFETIVA`, `IPCA (MENSAL)` and `DÓLAR (PTAX)`.
  - **`SELIC_TARGET` and `SELIC_EFFECTIVE` are surfaced distinctly** (Phase 5D-H1):
    - `SELIC META` — Copom target, e.g. `10.75% a.a.` with `Meta Copom (2026-09-18)`.
    - `SELIC EFETIVA` — annualized effective rate, e.g. `10.65% a.a.` with `Efetiva anualizada (2026-10-16)`.
    - The two series are never merged under a single "TAXA SELIC" label.
  - Displays real persisted IPCA Monthly (`0.21%` with reference month) when present.
  - Retains strict honest placeholder (`—`) only for genuinely absent series; `IBOVESPA` and `DÓLAR (PTAX)` remain honest placeholders until those surfaces are intentionally integrated.
  - **Hydration stability (Phase 5D-H1)**: The card builder (`buildMacroIndicatorCards`) accepts a `hydrated` flag. SSR and the first client hydration render use `hydrated: false`, ignoring any warm React Query cache, so server and initial client markup are byte-identical. After hydration, resolved persisted values are rendered. No `suppressHydrationWarning` is used.

---

## 6. Canonical Baseline Preservation & Reconciliation

The original owner database baseline on port 5434 remains 100% bit-exact and untampered:

- Users: 5
- Portfolios: 5 (including isolated validation fixture `VALIDAÇÃO FX 5C`)
- Accounts: 6
- Transactions: 23 (20 original owner transactions + 3 validation fixture transactions)
- Assets: 6 (4 original owner assets + 2 validation fixture assets)
- Market Quotes: 44 (42 original + 2 validation)
- Market Quote Revisions: 2
- Benchmark Observations: 41
- FX Observations: 1
- Calendar Days: 730
  - `B3_TRADING`: 365 total (248 open + 117 closed)
  - `BANKING`: 365 total (248 open + 117 closed)
  - Combined Total: 730 rows
- Macro Observations: 18 (12 IPCA + 5 SELIC_TARGET + 1 SELIC_EFFECTIVE)
- Macro Observation Revisions: 0 (verified via isolated test suite)
- Migrations: 28

### Canonical Fingerprints

- `original_owner_ledger_fingerprint`: `89b9411dc11d42c5e319c8f898debaca` (MATCH)
- `benchmark_fingerprint`: `96e65282a33c89e734aa92ad9c9b8609` (MATCH)
- `fx_fingerprint`: `12be8af23229bee65c2247d78ec6c501` (MATCH)
- `calendar_fingerprint`: `3258d42335bb638f8167d3c951b2b48e`
- `macro_fingerprint`: `d4ceafff57b3f3615f9621d27b1dd1ae`
