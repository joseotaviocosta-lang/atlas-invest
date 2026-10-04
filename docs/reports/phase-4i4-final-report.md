# PROJECT ATLAS — PHASE 4I.4 — FINAL REPORT

## HIGH-INCOME ANNUAL INTEGRATION, EVIDENCE PERSISTENCE & API FOUNDATION

---

## GIT

- **base (4I.3 final):** `98ffd43d73a4d8ee7d97308ab618948cad9f8ef3`
- **branch:** `feature/phase-4i4-high-income-annual-integration`
- **phase commit (4I.4):** `5030efa45884533b9631bcc9cc1d65c897113ea1`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## ANCESTRY

4I.3: PASS · 4I.2: PASS · 4I.1: PASS · 4H: PASS (all exit 0)

## APPLICATION FLOW

4H annual facts: USED (investment-income + capital-market use-cases consumed; nothing recomputed)
4I.1 snapshot: via `calculateHighIncomeMinimumTax` input assembly from 4H read-models
4I.2 calculator: canonical engine, unmodified semantics
4I.3 redutor: canonical engine + additive conflict flag for repository-marked conflicts
derived result persisted: NO (per-request assembly; no cache table)

## EVIDENCE PERSISTENCE

- **table/model:** `high_income_evidence_records` / `HighIncomeEvidenceRecord`
- **append-only:** YES (inserts only; history retained)
- **revisioned:** YES (monotonic revision + supersedesId + P2002 optimistic retry)
- **server-controlled authority:** YES (fixed mapping; client claims never trusted)
- **cross-year isolated:** YES (strict subject+year scoping, tested)
- **payer-scoped:** YES (payerKey; annual types use `_ANNUAL_`)
- **source fingerprint:** YES (content hash + revision-bound row fingerprint + upstream pins)

## MIGRATION

- **clean DB:** PASS (`migrate deploy` applies 17/17 on test DB)
- **upgrade DB:** PASS (additive-only migration on top of 16 existing)
- **pending:** NO · **drift:** NO (verified via migrate status + DB-vs-schema diff;
  only pre-existing historical index-rename drift remains, untouched)
- **orphans:** NO (FK cascade from users; truncate-cascade verified in tests)

## API

- **GET high-income:** PASS (16 scenarios + contract fields + decimal strings + nulls)
- **POST evidence:** PASS (201 create / 200 idempotent retry with `created` flag)
- **resolve endpoint:** PASS (KEEP_EXISTING restores, ACCEPT_NEW keeps, 409 otherwise)
- **auth:** PASS (401 unauthenticated)
- **ownership:** PASS (principal-derived; no client subject fields)
- **anti-enumeration:** PASS (foreign payer 404; cross-user impossible by construction)
- **decimal strings:** PASS (regex-validated inputs; string-serialized outputs)

## ERRORS

invalid year: PASS (400 FISCAL.INVALID_YEAR) · unsupported year: PASS (200 UNSUPPORTED_YEAR status) ·
foreign payer: PASS (404 FISCAL.FOREIGN_PAYER) · conflicting evidence: PASS (409 FISCAL.EVIDENCE_CONFLICT) ·
blocked upstream: PASS (200 BLOCKED + BLOCKED_UPSTREAM_4H_INCOME)

## E2E A–P (real PostgreSQL + real auth + real 4H upstream + real 4I engines)

A: PASS · B: PASS · C: PASS · D: PASS · E: PASS · F: PASS · G: PASS · H: PASS ·
I: PASS · J: PASS · K: PASS · L: PASS · M: PASS · N: PASS · O: PASS · P: PASS
total: 16/16 · real DB: YES · real auth: YES · real upstream 4H: YES ·
real 4I.1: YES · real 4I.2: YES · real 4I.3: YES
(+ auth/validation/resolve edge tests: 20/20 in E2E file)

## CONCURRENCY

identical evidence writes: PASS (1 CREATED + 4 IDEMPOTENT) ·
conflicting writes: PASS (revisions 1,2,3,4 ordered, all contents preserved) ·
read + revision race: PASS (version fence + single rebuild; 409 on persistent race) ·
lost update: NO

## SNAPSHOT CONSISTENCY

strategy: append-only evidence watermark (count + maxUpdatedAt) fenced around the build, one rebuild ·
mixed-state result: NO · TOCTOU: PASS (fence + fail-closed 409)

## QUERY BUDGET

auth/principal: 2 · capital-market: 12-month bounded loop + obligations · income: portfolios +
per-portfolio ledger + batched assets · readiness: n/a (4I owns its evidence) ·
evidence: 3 (list + 2 watermarks) · other: monthly-fiscal internals (bounded by 12 months) ·
total: 93 (reference setup) · per-payer: NO · per-evidence: NO · per-income: NO ·
per-section: NO · N+1: NO (1-payer vs 5-payer query shapes byte-identical)

## SCALE

1 payer: baseline · 10: covered in fuzz-equivalent paths · 100: 415ms / 6.13MB CALCULABLE ·
1k: engine-level (4I.3 scale) · 10k: engine-level · 100 evidence revisions: revision chain O(1) per write ·
1k annual facts: n/a (4H paths unchanged) · 10k: n/a · 50k: n/a ·
memory: 6.13MB delta at 100 payers, bounded

## SECURITY

raw CPF leakage: NO · client ownership trust: NO · client evidence authority: NO (server decides) ·
cross-user read: NO · cross-user write: NO · payer spoofing: NO (upstream-validated) ·
evidence spoofing: NO (validation + authority mapping + pins) · sensitive logging: NO
(filter logs metadata only; evidence payloads never logged)

## ARCHITECTURE

4H recomputation: NO · 4I domain math in API: NO (exact assembly aggregation only) ·
final tax persisted: NO · mutable evidence history: NO · Prisma in pure engines: NO ·
client tax math: NO · Tax AI: NO

## 4I.3

fixtures: PASS · fuzz: PASS · differential: PASS · properties: PASS · scale: PASS ·
integration: PASS (extended: repository-marked conflicts now BLOCK via additive flag)

## 4I.2: PASS · 4I.1: PASS

## 4A–4G

4A: PASS · 4B: PASS · 4C: PASS · 4D: PASS · 4E: PASS · 4F: PASS · 4G: PASS

## 4H

4H.2: PASS · 4H.3: PASS · 4H.4: PASS · 4H.5: PASS · 4H.6: PASS

## FINANCIAL

portfolio-engine: PASS · valuation: PASS · performance: PASS · performance-series: PASS ·
risk: PASS · risk-adjusted: PASS · relative-risk: PASS · active-performance: PASS ·
rolling: PASS · tail: PASS · scenario: PASS · benchmark: PASS · rate-benchmark: PASS ·
historical/market-data: PASS · portfolio-intelligence: PASS · domain: PASS

## PLATFORM

api: PASS · fiscal-api: PASS (40/40 files, 259/259 tests) · security: PASS ·
architecture: PASS · web: PASS · mobile: PASS · ui: PASS · database: PASS (17/17 files, 90/90 tests) ·
web:e2e: PASS (117) · tax-engine: PASS (49/49 files, 581/581 tests)

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS ·
pnpm format:check: PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

## CONTRACTS / DOCS

high-income-minimum-tax-foundation-v1: MATCH · high-income-minimum-tax-calculation-v1: MATCH ·
high-income-corporate-redutor-v1: MATCH · high-income-annual-integration-v1: MATCH ·
ADR-308: MATCH · AGENTS §76: MATCH

## SCOPE

annual application service: IMPLEMENTED · evidence persistence: IMPLEMENTED ·
read API: IMPLEMENTED · write API: IMPLEMENTED · calculation persistence: NOT IMPLEMENTED ·
UI: NOT IMPLEMENTED · refund: NOT IMPLEMENTED · DARF: NOT IMPLEMENTED ·
Receita: OUT OF SCOPE · Tax AI: NOT ENABLED

## FINAL

APPLICATION_INTEGRATION: READY · EVIDENCE_PERSISTENCE: READY · API: READY ·
CONCURRENCY: READY · SECURITY: READY · QUERY_SCALE: READY · REGRESSIONS: READY

REAL_4I4_BLOCKERS: none.

**PHASE 4I.4: APROVADA**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `5030efa45884533b9631bcc9cc1d65c897113ea1`
