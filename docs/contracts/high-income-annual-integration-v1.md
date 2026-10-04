# Contract — High-Income Annual Integration v1

- **Contract ID:** `high-income-annual-integration-v1`
- **Phase:** 4I.4 (application integration, evidence persistence, API foundation)
- **Status:** FROZEN
- **Upstream (immutable):** `high-income-minimum-tax-foundation-v1` (4I.1/4I.1A),
  `high-income-minimum-tax-calculation-v1` (4I.2),
  `high-income-corporate-redutor-v1` (4I.3), Phase 4H annual state
- **Legal anchor:** Lei nº 15.270/2025 (arts. 16-A/16-B, Lei 9.250/1995)

---

## 1. Scope

Freezes the application flow that turns authoritative 4H annual facts plus persisted evidence
into a derived high-income assessment served over authenticated HTTP. Covers the application
service, evidence persistence and revisions, status precedence, API, ownership, fingerprints,
stale invalidation, query shape and null/zero semantics.

Out of scope: UI, DARF, payment, refund, Receita submission, Tax AI, client-side tax math,
document upload, certified-rate inputs.

## 2. Application flow (canonical, one direction)

authenticated principal → tax subject (principal-derived) → authoritative 4H annual facts
(investment income + capital-market summaries, consumed via their canonical use-cases) →
persisted evidence (bulk) → 4I.1 snapshot assembly → 4I.1 applicability → 4I.2 calculation →
4I.3 redutor → derived view → API response. No reverse dependency; no formula in the
application layer (exact decimal assembly of authoritative monthly/category facts only).

## 3. Upstream dependencies and assembly rules

- **4H.4 payers → 4I items:** per-payer `dividendGross` → `DIVIDEND`, `jcpGross` → `JCP`,
  `fiiIncomeGross` → `FII_INCOME` (eligibility consumed as classified upstream); payer identity
  is the upstream `payerId` (ticker/asset), never the display name.
- **4H.4 withholding → facts:** JCP `totalWithheldTax` → `EXCLUSIVE_SOURCE_WITHHOLDING`;
  dividend `totalWithheldTax` → `ART_6A_ANTICIPATED_WITHHOLDING` (positive amounts only).
- **4H.3 months → gains:** exact annual sums of monthly `profitOrLoss` per category
  (normal → `EQUITY_CAPITAL_GAIN`, day-trade → `EQUITY_DAY_TRADE_GAIN`, FII → `FII_CAPITAL_GAIN`);
  non-positive annual nets contribute no item (not income). Exempt months count (exempt from
  income tax ≠ excluded from the minimum base).
- **What is NOT mapped:** category IRRF and 6015 DARF payments (not §3 credits); market values;
  loss carryforwards as income.
- **Upstream limitation (documented):** the served 4H.4 path classifies listed FII as verified
  and raises no transition claims, so transition-eligible items cannot arise here; the domain
  handles them when present. Investment income outside Atlas (salaries, rents) is covered only
  via attested `ANNUAL_INCOME_TOTAL` evidence.
- **4H.4 `BLOCKED` → application `BLOCKED` + `BLOCKED_UPSTREAM_4H_INCOME`** (no authoritative
  result from a blocked upstream).

## 4. Evidence persistence

Table `high_income_evidence_records`. Only non-derivable facts are stored; every calculation
(income totals, bases, rates, reductions, fingerprints) is recomputed on read.

- **Types:** `CORPORATE_TAX` (payer-scoped 4I.3 inputs), `ANNUAL_ADJUSTMENT_IRPF` (adjustment
  amount), `ANNUAL_INCOME_TOTAL` (attested total, feeds `authoritativeTotalAnnualIncome`).
- **Typed columns** (no opaque JSON): payer, payer type, profit period, mode, six book amounts,
  adjustment amount, authority, source, conflict flag, upstream pin, fingerprints, revision,
  supersedes chain, resolution note, principal, timestamps.
- **Identity:** `(taxSubjectId, calendarYear, payerKey, evidenceType, profitPeriodExercise,
revision)` unique; `payerKey = payerId ?? '_ANNUAL_'`. Same payer with distinct profit
  periods coexists (multi-period fails closed in the engine, per 4I.3).
- **Append-only revisions:** same content → idempotent; changed content → new revision with
  `supersedesId`; history retained; P2002-guarded optimistic retry (max 3).
- **Conflict:** a revision that changes AUTHORITATIVE content from another source is marked
  `CONFLICT`; resolution (`KEEP_EXISTING` restores pre-conflict content, `ACCEPT_NEW` keeps
  current content) always creates a new revision. No authoritative net while conflicted.
- **Authority is server-controlled:** `PJ_FINANCIAL_STATEMENTS`/`RFB_PREFILLED` + complete
  corporate fields → `AUTHORITATIVE`; bare `TAXPAYER_CONFIRMED` corporate → never authoritative;
  adjustment/income totals via attestation with complete fields → `AUTHORITATIVE` (first-party
  filing facts, analogous to manual-confirmed fiscal inputs). Clients request; the server decides.
- **Certified effective rates:** not supported (no derived-rate persistence; the ratio is always
  recomputed from raw book figures).

## 5. Revision semantics and staleness

- Corporate rows pin the payer aggregate fingerprint at write time; adjustment/income-total rows
  pin the income-summary fingerprint. A pin mismatch at read marks the row STALE (response
  `evidence[].stale`), demotes its authority, and fails the net closed. New 4H facts therefore
  rebuild the result with a changed fingerprint and never silently reuse outdated evidence.
- Cross-year: evidence is strictly `(subject, year)`-scoped; 2026 evidence never authorizes 2027.

## 6. Status precedence (application)

`UNSUPPORTED_YEAR` (no rule set) > `BLOCKED` (integrity, conflict, upstream) >
`UNSUPPORTED_INPUT` > `REQUIRES_CONFIRMATION` > `INCOMPLETE_REDUCTION_DATA` >
`INCOMPLETE_CREDITS` > `CALCULABLE` > `NOT_APPLICABLE`. Implemented by the engines; the
application only injects the upstream-blocked override.

## 7. API

- `GET /api/v1/fiscal/annual/:calendarYear/high-income` → `{ data: assessment }` (full §36
  field set; all money as decimal strings; nulls preserved).
- `POST /api/v1/fiscal/annual/:calendarYear/high-income/evidence` → 201 `{ data: row, meta:
{ outcome, created } }`; idempotent retry returns the existing row with `created: false`.
- `POST .../evidence/:evidenceId/resolve` → 200 `{ data: row, meta: { outcome } }`
  (`KEEP_EXISTING`/`ACCEPT_NEW`).
- Auth required (401 otherwise). Ownership is principal-derived; `taxSubjectId`/`userId` are
  never accepted from the client. Payer references must resolve to the subject's upstream payer
  set (else 404 `FISCAL.FOREIGN_PAYER`). Cross-user access is impossible by construction and
  verified by isolation tests.
- Errors: `FISCAL.INVALID_YEAR` (400), `FISCAL.INVALID_EVIDENCE` (400),
  `FISCAL.FOREIGN_PAYER` (404), `FISCAL.EVIDENCE_CONFLICT` (409),
  `FISCAL.SNAPSHOT_INCONSISTENT` (400 retryable fence), `INTERNAL_ERROR` (500).

## 8. Ownership, fingerprints, consistency

- Every row is `(taxSubjectId)`-scoped with `createdByPrincipal`; FK cascade from users; no
  orphans (users truncate cascades; verified by migration + tests).
- Source fingerprint = content hash; row fingerprint binds content + revision. Calculation and
  snapshot fingerprints change on any evidence/source revision (rebuild determinism: same
  sources + same evidence ⇒ same result and fingerprints).
- Snapshot consistency: append-only evidence watermark (count + maxUpdatedAt) fenced around
  the build with a single rebuild; a persistent race returns `FISCAL.SNAPSHOT_INCONSISTENT`
  instead of a stale authoritative status. No calculation cache (no stale cache possible).

## 9. Query shape

Bounded and N+1-free by construction: upstream use-cases (portfolios, per-portfolio ledger,
batched assets, 12 bounded monthly liability runs, obligations list), one bulk evidence list,
two watermark aggregates. Measured: 93 queries for the reference setup, byte-identical query
shapes for 1 vs 5 payers; evidence access is exactly list(1) + watermark(2). No per-payer,
per-evidence, per-income or per-section queries.

## 10. Null/zero semantics

Known-zero amounts persist and serialize as `"0"`; unknown stays `NULL`/absent and fails
closed; missing evidence is never zero; conflicting evidence never computes. All public
financial values are decimal strings (validated `^\d{1,18}(\.\d{1,18})?$`, non-negative).

## 11. No persisted calculation

No table stores `grossMinimumTax`, `netMinimumTax`, rate, base or redutor results. The API
response is assembled per request from sources + evidence. No cache, no DARF, no payment,
no refund, no Receita flow, no Tax AI, no client math.
