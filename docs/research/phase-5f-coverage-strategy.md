# Phase 5F — Coverage Strategy (Research)

**Status:** approved for implementation.
**Scope:** persisted-coverage-driven backfill orchestration. No production scheduler, no deployment.

## 1. Coverage sources (read-only, persisted DB)

| Domain        | Coverage read                             | Per-item existence check           | Calendar source           |
| ------------- | ----------------------------------------- | ---------------------------------- | ------------------------- |
| Market quotes | `findRange` / valuation reads             | `findByAssetDate(asset, date)`     | `B3_TRADING`              |
| IBOV          | `getCoverage` + `findObservation`         | `findObservation(IBOV, date)`      | `B3_TRADING`              |
| CDI           | `getCoverage` + `findObservation`         | `findObservation(CDI, date)`       | `BANKING`                 |
| FX USD/BRL    | `getCoverage` + `findObservation`         | `findObservation(USD, BRL, date)`  | `BANKING`                 |
| FX EUR/BRL    | `getCoverage` + `findObservation`         | `findObservation(EUR, BRL, date)`  | `BANKING`                 |
| IPCA          | `getCoverage` + `findObservations(month)` | any obs in `[month-01, month-end]` | none (publication rule)   |
| SELIC_TARGET  | `findObservations(date, date)`            | event rows only (may be empty)     | none (event-driven)       |
| SELIC_EFFECT  | `findObservations(date, date)`            | `findObservations(date, date)`     | `BANKING`                 |
| Calendars     | `getCoverage` + `findDays(year)`          | full-year day count                | self (official generator) |

No live provider is consulted during planning. Dry-run = zero `fetch` calls.

## 2. Canonical taxonomy (reuses Phase 5D)

`classifyObservationStatus` semantics are reused verbatim:

- `EXPECTED` — open session with data present (skip).
- `CLOSED_DAY` — calendar explicitly closed (never eligible).
- `DATA_GAP` — open session, coverage present, provider data absent (**only eligible state**).
- `NOT_PUBLISHED_YET` — future date or unpublished IPCA month (never eligible).
- `CALENDAR_COVERAGE_MISSING` — no calendar row / outside coverage (blocks observation planning for that period; calendar backfill runs first).

Backfill orchestration states (derived, not stored):

- `COVERED` / `ALREADY_COVERED` — persisted data present.
- `BACKFILL_REQUIRED` — `DATA_GAP` eligible.
- `BACKFILL_NOT_REQUIRED` — empty universe / nothing to do.
- `BACKFILL_BLOCKED_BY_CALENDAR` — calendar gap first.

## 3. Eligibility rule

Only `DATA_GAP` is eligible. Closed days, unpublished periods and
calendar-missing dates are classified as skips with explicit reasons and are
never fetched. IPCA months `>=` current month are `NOT_PUBLISHED_YET`.
Future civil dates are `NOT_PUBLISHED_YET`, never backfilled.

## 4. Windows and compaction

Eligible single periods are deduplicated, sorted ascending, and compacted:
contiguous daily periods merge into one window (`from..to`); month/year
domains produce one window spanning the sorted set. Compaction is display and
estimation only — execution remains per single period (one child `JobRunner`
run each) so locking, history and retry stay period-exact.

## 5. Bounds (per execution)

| Domain        | Max range | Rationale                        |
| ------------- | --------- | -------------------------------- |
| MARKET_QUOTES | 90 days   | heaviest (per-portfolio fan-out) |
| BENCHMARK_*   | 366 days  | within provider 5y cap           |
| FX_*          | 366 days  | within provider 5y cap           |
| MACRO_IPCA    | 744 days  | ~24 months, within 10y macro cap |
| MACRO_SELIC_* | 366 days  | within 10y macro cap             |
| CALENDAR_*    | 366 days  | one year + margin                |

Plans with more than 90 eligible periods require explicit
`confirmLargeBackfill: true`. More than 40 windows or 366 periods per
execution is rejected. Unbounded requests (missing/inverted/future-abusing
ranges) are rejected with 400.

## 6. Dependencies and ordering

- `B3_TRADING` calendar → market, IBOV.
- `BANKING` calendar → CDI, FX, SELIC_EFFECTIVE.
- Macro IPCA / SELIC_TARGET follow publication/event semantics, independent
  of trading calendars.
- Calendar backfill precedes observation backfill when coverage is missing.

No circular dependencies. No auto-repair on user-facing GETs.

## 7. What is intentionally deferred

Production cloud scheduler, staging deployment, alerting, centralized
observability, operator admin UI, recurring execution, archival
all-history backfill, direct IBOV/PTAX headline integrations,
cross-currency historical TWR, foreign tax, deployment.
