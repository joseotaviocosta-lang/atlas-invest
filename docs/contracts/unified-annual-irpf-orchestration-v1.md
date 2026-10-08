# Unified Annual IRPF Orchestration — Read Contract v1 (Phase 4J.1)

Status: Frozen (Phase 4J.1). This document pins the frozen read surface of the
unified annual IRPF orchestration layer. It is **orchestration only**: it
projects the already-computed authoritative outputs of Phase 4H and Phase 4I
into one deterministic annual fiscal state. It computes no tax, persists nothing,
and introduces no new migration.

Related decisions: ADR-278 (projection-only), ADR-279 (consistency = identity +
provenance + payer identity), ADR-280 (two inconsistency codes), ADR-281
(honest-null ruleVersions), ADR-282 (architecture allow-list).

## 1. The one route

`GET /api/v1/fiscal/annual/:calendarYear`

- Authenticated principal only. Ownership is server-derived; the route accepts
  **no** client subject/portfolio id. Foreign/missing resources resolve to an
  empty/`NO_ACTIVITY` state, never `403` (anti-enumeration).
- `Cache-Control: private, no-store` on **every** response — success (200) and
  all error paths (400 param validation, 401 unauthenticated, 422 outer fence,
  500). The directive is applied by a route-scoped middleware
  (`UnifiedAnnualNoStoreMiddleware`) that runs before guards/pipes/handler, so it
  is present even when the request never reaches the successful handler body. The
  middleware is scoped to this route only and skips the sibling literal
  `annual/opening-positions`, so no other route's cache behavior changes.
- Declared **after** all existing `annual/...` routes so the bare parametric
  route never captures the literal `annual/opening-positions`.

### Status / error table

| Condition                                                     | HTTP                                                          | code                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| Non-integer / tampered year param                             | 400                                                           | `VALIDATION.INVALID_INPUT`           |
| Out-of-range year                                             | 400                                                           | `FISCAL.INVALID_YEAR`                |
| Unauthenticated / bad JWT                                     | 401                                                           | (guard default)                      |
| Foreign subject/portfolio                                     | 200 (empty/`NO_ACTIVITY`)                                     | — (never 403)                        |
| 4I inner fence fails twice                                    | 200, HIGH_INCOME `BLOCKED` + `UPSTREAM_SNAPSHOT_INCONSISTENT` | —                                    |
| Unified outer fence fails twice                               | 422                                                           | `FISCAL.UNIFIED_ANNUAL_INCONSISTENT` |
| `PersistenceError` from a single-input load                   | 500 (propagated)                                              | `PERSISTENCE.ERROR`                  |
| `PersistenceError` from the positions fan-out (per portfolio) | 200, ANNUAL_POSITIONS `BLOCKED`                               | — (`MODULE_LOAD_FAILED`)             |

## 2. Response body (`UnifiedAnnualResponse`)

```jsonc
{
  "calendarYear": 2026,
  "declarationExercise": 2027,
  "status": "REQUIRES_ACTION",
  "summary": {
    "moduleCount": 5,
    "readyCount": 3,
    "actionRequiredCount": 1,
    "blockedCount": 0,
    "noActivityCount": 0,
    "notApplicableCount": 1,
    "unsupportedCount": 0,
    "consistencyIssueCount": 0,
    "blockingIssueCount": 0,
  },
  "modules": [
    {
      "module": "ANNUAL_POSITIONS",
      "source": "4H.2",
      "status": "READY",
      "authoritative": true,
      "blockingReasons": [],
      "requirements": [],
      "sourceFingerprint": "…",
      "calculationFingerprint": null,
    },
  ],
  "requirements": [
    {
      "key": "READINESS_EVIDENCE::…::…::…",
      "module": "READINESS_EVIDENCE",
      "category": "…",
      "nativeType": "…",
      "subjectReference": "…",
      "status": "PENDING",
      "blockingReason": null,
    },
  ],
  "consistencyIssues": [
    {
      "code": "SOURCE_FINGERPRINT_MISMATCH",
      "severity": "BLOCKING",
      "modules": ["INVESTMENT_INCOME", "HIGH_INCOME_MINIMUM_TAX"],
      "detail": "…",
    },
  ],
  "sourceFingerprint": "…",
  "annualFingerprint": "…",
}
```

The wire shape flattens the pure `UnifiedAnnualIrpfState`:
`calendarYear/declarationExercise/status/sourceFingerprint/annualFingerprint`
are lifted from `identity`; `modules/requirements/consistencyIssues/summary`
pass through. **Dropped from the wire:** `identity.taxSubjectId` (internal),
`identity.generatedAt` (non-deterministic; excluded from the fingerprint) and
`identity.ruleVersions` (internal provenance input).

## 3. Modules and their canonical sources

| Module                    | Source | Authority                                    |
| ------------------------- | ------ | -------------------------------------------- |
| `ANNUAL_POSITIONS`        | 4H.2   | position report (fanned out over portfolios) |
| `CAPITAL_MARKETS`         | 4H.3   | annual capital-market fiscal summary         |
| `INVESTMENT_INCOME`       | 4H.4   | annual investment income summary             |
| `READINESS_EVIDENCE`      | 4H.5   | annual tax readiness / evidence              |
| `HIGH_INCOME_MINIMUM_TAX` | 4I     | high-income minimum-tax assessment           |

Each module declares a single source-of-truth (no duplication). Only 4I
populates `calculationFingerprint`; it is `null` for all 4H modules.

## 4. Status vocabulary and precedence

- Module status: `READY | PARTIAL | REQUIRES_CONFIRMATION | BLOCKED | NO_ACTIVITY | NOT_APPLICABLE | UNSUPPORTED`.
- Global status: `READY_FOR_REVIEW | REQUIRES_ACTION | PARTIAL | BLOCKED | NO_ACTIVITY | UNSUPPORTED`.
- Frozen precedence: `BLOCKED > REQUIRES_ACTION > PARTIAL > READY_FOR_REVIEW > NO_ACTIVITY`.
- No status collapse: `BLOCKED` never degrades to `PARTIAL`; an unmapped native
  value never maps to `READY` (it becomes `UNSUPPORTED` + `UNMAPPED_STATUS`).
- Every native→unified adapter is exhaustive and **fails closed**. In particular:
  the `ANNUAL_POSITIONS` completeness fold recognises only
  `COMPLETE/PARTIAL/BLOCKED/REQUIRES_CONFIRMATION` and maps any other value to
  `UNSUPPORTED` + `UNMAPPED_STATUS` (it never falls through to `READY`); the
  `READINESS_EVIDENCE` overall-status mapper maps any unknown value to
  `UNSUPPORTED` and always attaches `UNMAPPED_STATUS` so the state can explain
  what prevents readiness (never an empty blocking-reason set under `UNSUPPORTED`).
- `NOT_APPLICABLE`/`NO_ACTIVITY` modules do not by themselves block. A material
  `UNSUPPORTED` module prevents a global `READY_FOR_REVIEW`. HIGH_INCOME is
  material only for in-window years (≥ 2026).
- **Every decisive precedence branch folds over MATERIAL modules only.** A
  non-material module (a pre-2026 HIGH_INCOME `UNSUPPORTED_YEAR`, or a
  non-material 4I evidence-fence race that maps HIGH_INCOME to `BLOCKED`) can
  **never** drive the global status: it neither forces a global `BLOCKED` nor
  keeps a dormant subject out of `NO_ACTIVITY`. Concretely, a pre-2026 empty
  subject is exactly `NO_ACTIVITY` (not a false `READY_FOR_REVIEW`), and a
  non-material fence race leaves an otherwise-coherent general package untouched.
  A **material** `BLOCKED` module still fails closed to global `BLOCKED` — this
  is a materiality scope, not a status collapse. Correspondingly, the
  forced-snapshot `UPSTREAM_NOT_READY` consistency signal is emitted only when
  HIGH_INCOME is material.
- The global fold inspects module requirements and blocking reasons, not just the
  status enum: a material, participating module (`READY`/`PARTIAL`/`NO_ACTIVITY`)
  carrying an unresolved required requirement (status not `SATISFIED`/`WAIVED`) or
  a non-null blocking reason is **action-owned** and escalates to
  `REQUIRES_ACTION`. A passive `PARTIAL` (no open action) stays `PARTIAL`.
- The 4J-synthesised blocking reasons are a closed set: `MODULE_LOAD_FAILED`,
  `UNMAPPED_STATUS`, `UPSTREAM_SNAPSHOT_INCONSISTENT`. Native 4H/4I
  `blockingReasons` pass through verbatim.

## 5. Requirement identity (semantic-key dedup)

- Key format: `` `${module}::${category}::${normalizedSubjectReference}::${nativeType}` ``.
- The key **never** contains a DB UUID. The subject-wide subject (the
  taxSubjectId itself) collapses to the `_ANNUAL_` sentinel; any raw UUID subject
  is replaced by a stable non-reversible short marker. Payer references (tickers)
  are normalized verbatim.
- Identical keys collapse to one requirement; similar labels with different keys
  stay separate.
- A duplicate key whose entries carry different status/blocking reason is
  resolved **deterministically and fail-closed**: the most-unresolved status wins
  (`SATISFIED < WAIVED < PENDING < STALE`, unknown native statuses fail closed to
  the most severe), ties break on a non-null blocking reason then lexicographic
  order — so the winner is independent of input order (never first-wins).

## 6. Consistency rules

Consistency compares identity + gross-economic provenance (fingerprints) +
payer identity only. Codes: `YEAR_MISMATCH`, `EXERCISE_MISMATCH`,
`SOURCE_FINGERPRINT_MISMATCH`, `PAYER_IDENTITY_MISMATCH`, `STALE_CONFIRMATION`,
`CONFLICTING_EVIDENCE`, `UPSTREAM_NOT_READY`.

**Payer identity is checked one-directionally.** `PAYER_IDENTITY_MISMATCH` fires
only when 4I references a payer absent from the 4H.4 income payer universe
(`orphanInHighIncome`) — the only valid provenance invariant, since 4I derives
from 4H facts. The reverse (a 4H.4 income payer absent from 4I's redutor/evidence
subset) is expected for a diversified filer and is never flagged.

**Stale evidence is correlated to the requirement it can actually satisfy, by
`evidenceType` + scope — never by raw id, and never "any stale row + any open
requirement".** 4I requirement subjects are the aggregate tax-subject id, a
different namespace than an evidence row's `payerId`, so ids are not compared
directly. Instead each stale evidence row is mapped (via the frozen 4I ingestion
mapping) to the specific requirement code it feeds, and `STALE_CONFIRMATION`
fires only when THAT requirement is itself unresolved (not SATISFIED/WAIVED):

| evidenceType             | satisfies requirement              | scope                                     |
| ------------------------ | ---------------------------------- | ----------------------------------------- |
| `CORPORATE_TAX`          | `CORPORATE_EFFECTIVE_TAX_EVIDENCE` | payer-scoped (row must carry a `payerId`) |
| `ANNUAL_ADJUSTMENT_IRPF` | `ANNUAL_ADJUSTMENT_TAX_DUE`        | annual-scoped (`payerId === null`)        |
| `ANNUAL_INCOME_TOTAL`    | `ANNUAL_INCOME_TOTAL`              | annual-scoped                             |

An unrelated obsolete row (e.g. a stale `ANNUAL_INCOME_TOTAL` already satisfied
by canonical 4H income) can no longer flip an otherwise `REQUIRES_ACTION`
package to `BLOCKED` while a separate corporate/adjustment requirement is the
real open item. An unknown `evidenceType` fails CLOSED (gates when anything is
open) so a new 4I evidence kind never silently stops blocking. No id is leaked.

**Amount comparison is NOT done per payer** and is not done at all by default.
It is uncomputable from the frozen read models (4I exposes only per-category
aggregate gross and flat `payerIds[]`, no per-payer gross). `ANNUAL_AMOUNT_MISMATCH`
is dropped as blocking; the type member exists only for a WARNING-only variant
(category-aggregate, `Money` decimal-string equality, never float, never
per-payer) and is not emitted by default. Legitimate same-fact-different-tax-
classification is never flagged.

## 7. Fingerprint

- `sourceFingerprint` = SHA-256 over the module source markers (identity
  provenance subset).
- `annualFingerprint` = SHA-256 over the full canonical content (modules,
  evidence fingerprints, consistency issues, requirements, ruleVersions).
- `generatedAt` is **excluded** from both fingerprints.
- Module-order and requirement-order independent (canonical sort before hash),
  and consistency-issue `modules` member order independent (nested arrays are
  canonicalized on the serialized object, not only inside a comparator).
- The `ANNUAL_POSITIONS` source marker folds a canonical digest of the derived
  position report content (quantity, total/average cost, asset identity,
  cost-basis + completeness status, opening-position application/id, report
  version) plus the folded report version — never `generatedAt`, never the raw
  ledger — so a content change that preserves summary counts still changes the
  fingerprint and is caught by the outer fence.
- Any authoritative source revision (changed module fingerprint/status, new
  evidence/confirmation revision, changed consistency set) changes the fingerprint.

## 8. Snapshot consistency (two fences)

- Inner 4I fence → 400 `FISCAL.SNAPSHOT_INCONSISTENT`, caught and mapped to
  HIGH_INCOME `BLOCKED` + `UPSTREAM_SNAPSHOT_INCONSISTENT`.
- Outer unified fence → 422 `FISCAL.UNIFIED_ANNUAL_INCONSISTENT` (never emits a
  mixed-state READY).

## 9. Guarantees

- **No persistence / no migration.** The layer persists nothing; `prisma/migrations`
  is unchanged by 4J.1.
- **No tax math.** No capital gains, average price, monthly tax, annual market
  result, dividends, JCP, FII tax, high-income threshold/rate, corporate redutor
  or credits are computed.
- **Security / no leak.** The body carries no subject id, no DB UUID, no raw
  monetary amount, no token and no stack — only statuses, fingerprints, counts
  and requirement metadata. Logs carry only technical metadata.
- **Scale / query.** The payload is `O(modules + positions-summary + requirements)`,
  bounded and independent of ledger size; the positions fan-out is linear in
  portfolio count. De-duplication of the direct + transitive capital-market /
  investment-income loads is scoped to a single composed `load()` **snapshot**
  (a fresh scope per load, and a separate fresh scope for the outer fence's
  after-read): the snapshot retains settled results for its lifetime so a delayed
  transitive call reuses the already-computed value (exactly one compute per
  category per snapshot — a deterministic, timing-independent query shape). The
  scope is NOT a process-wide singleton and NOT a cross-request/cross-user cache;
  a global fiscal cache is forbidden.

## 10. Consumed read-model contracts

This layer consumes (never recomputes) the frozen read models of 4H.2–4H.5 and
4I via their existing application use-cases. See the high-income review-package
contract and the 4H annual read models for the upstream field definitions.
