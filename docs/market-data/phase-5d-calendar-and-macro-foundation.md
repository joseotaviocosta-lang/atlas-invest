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
  - Connects to `/api/v1/macro/context` via React Query.
  - Displays real persisted Selic Target (`10.75% a.a.` with Copom effective date) or Effective Selic rate when present.
  - Displays real persisted IPCA Monthly (`0.44%` with reference month) when present.
  - Retains strict honest placeholder (`—`) when data has not yet been ingested.

---

## 6. Canonical Baseline Preservation

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
- Calendar Days: 0 (prior to explicit ingestion)
- Macro Observations: 0 (prior to explicit ingestion)
- Migrations: 28

### Canonical Fingerprints
- `original_owner_ledger_fingerprint`: `89b9411dc11d42c5e319c8f898debaca` (MATCH)
- `benchmark_fingerprint`: `96e65282a33c89e734aa92ad9c9b8609` (MATCH)
- `fx_fingerprint`: `12be8af23229bee65c2247d78ec6c501` (MATCH)
