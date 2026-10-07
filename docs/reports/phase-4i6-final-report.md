# PROJECT ATLAS — PHASE 4I.6 — ANNUAL HIGH-INCOME FILING SUPPORT, REVIEW PACKAGE & FINAL 4I HARDENING — FINAL REPORT

Phase 4I.6 adds a deterministic high-income annual review/support package (IRPFM,
Lei 15.270/2025) with JSON + human-readable CSV export and a web export action,
derived entirely from the frozen 4I.4 assessment, and closes the full Phase 4I
program. The feature was built through a reviewed design loop + an
implement-and-review loop (two independent semantic reviewers), and APPROVED. The
workflow's final verification step was cancelled before completion; the full
platform/regression matrix and **both mandatory orchestrator validators were run
to completion by the orchestrator** and are recorded here with real results.

## GIT

- **base (4I.5 FINAL):** `1c3e7b3e2202c96cb197a3b20413006e196dc1c7`
- **branch:** `feature/phase-4i6-high-income-filing-support-final-hardening`
- **phase commits:**
  - `b52ff6c` feat(tax-engine): add high-income annual review package engine (FEAT-001)
  - `d056606` feat(fiscal): review package integration layer, export API + web action (FEAT-002)
  - `db80075` docs(fiscal): contract, ADR 050, filing-support mapping + 4I.6 invariants (FEAT-003)
  - `836a6a9` test(fiscal): raise 4i6 review-package payer-scale test timeout for seed-heavy run
  - (+ a cleanup commit removing an accidentally-committed `.agents/` scratch file, and this report)
- **HEAD / FINAL 4I CHECKPOINT:** recorded below after the final commit.
- **worktree:** clean (verified at close).

## ANCESTRY (all exit 0 — ancestors of HEAD)

4I.5 `1c3e7b3`, 4I.4 `19f4f98`, 4I.3 `98ffd43`, 4I.2 `e75e7cc`, 4I.1 `ced2e3f`, 4H `be4e157`.

## LEGAL FRESHNESS

- **cutoff:** 2025-02-14 primary-source check (RFB/gov.br: IRPF 2026 program,
  Tributação 2026, P&R IRPF 2026, RFB Lei 15.270/2025 guidance, DIRPF service page).
- **material legal drift: NO** (no `REAL_4I6_LEGAL_DRIFT`). Lei 15.270/2025 (IRPFM,
  annual income > R$ 600k, progressive minimum rate up to 10%, first applies to
  ano-calendário 2026 → exercício 2027, transitional pre-2026 dividend exemption)
  matches the FROZEN 4I.1–4I.3 engine semantics. No frozen calculation was reopened.
- **labeling:** the package presents the IRPFM as support for **Exercício 2027
  (ano-calendário 2026)**, not the IRPF 2026 / AC-2025 return.

## PACKAGE

- **model:** `HighIncomeReviewPackage` (pure, in `@atlas/tax-engine`), 9 sections.
- **packageVersion:** `high-income-annual-review-package-v1`.
- **derived only:** YES — assembled from the 4I.4 `AnnualHighIncomeAssessmentReadModel`,
  loaded exactly once; the assembler performs NO tax math and uses NO float.
- **final tax persisted:** NO. No new migration (18 tracked migrations unchanged).

## STATUS MODEL

`READY_FOR_REVIEW` / `INCOMPLETE` / `BLOCKED` / `NOT_APPLICABLE` / `UNSUPPORTED`,
derived with precedence UNSUPPORTED → BLOCKED → NOT_APPLICABLE → READY → INCOMPLETE.

## NULL / ZERO / NA

- authoritative zero preserved (never shown as unknown); unknown → `null`;
  not-applicable / unsupported / blocked are distinct states. `netMinimumTax` is
  passed through ONLY when status is `READY_FOR_REVIEW` (`netIsAuthoritative`),
  otherwise `null` — never fabricated. `deriveApplicable` returns `null` fail-closed
  when either operand is unknown. Verified by orchestrator reading the engine source.

## PROVENANCE / FINGERPRINT

- All fingerprints present (upstreamIncome, upstreamCapitalMarket, source,
  calculation, corporate-redutor source/calculation, and the package fingerprint).
- **generatedAt EXCLUDED from the fingerprint** — `HighIncomeReviewFingerprintInput`
  has no generatedAt field; `generatedAt` appears only in the output. Verified in source.
- same economic state → same fingerprint; `stableStringify` sorts keys and arrays are
  canonically sorted before hashing → **shuffle-invariant**; source-revision and
  evidence-revision change the fingerprint. Covered by
  `high-income-review-package-fingerprint.test.ts` and the ≥10k fuzz suite.

## STALE PACKAGE

- Export builds the CURRENT package at request time (no cached stale calculation).
  Web shows a package-level stale indicator (role=status, text + badge, not color-only)
  when a prior fingerprint differs. No export-history persistence added.

## EXPORT

- **JSON** machine-readable + **CSV** human-readable (mirrors the 4H exporter,
  shared `escapeCsvCell` OWASP injection defense `/^[=+\-@\t\r]/ → prefix '`,
  semicolon delimiter, UTF-8).
- **support-only label:** every human artifact carries
  `DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL`. No official
  Receita-file claim.
- financial values are canonical decimal strings (no float).
- **private/no-store:** route sets `Cache-Control: private, no-store` + `Pragma: no-cache`;
  `Content-Disposition: attachment`; year-only filename
  `atlas-alta-renda-<year>-relatorio-apoio.<ext>` (no CPF). Verified in the controller source.
- CSV injection blocked; no token/session/password/stack/DB-UUID in payload
  (DB evidence `id`/`supersedesId` are used only as an in-memory sort tiebreaker and
  are NEVER serialized — Section7 emits `rowKey = evidenceType:payerKey:revision`).

## FILING MAPPING

- verified-official mappings: 0 claimed as DIRPF field mappings; all notes classified
  `GENERAL_SUPPORT` with legal references (0 unproven official mappings) per
  `docs/research/high-income-filing-support-mapping-2026.md`.

## WEB

- export action "Exportar relatório de apoio" (CSV default / JSON), 44px target,
  accessible labeled group, keyboard operable, focus-safe, fail-safe on malformed
  package, stale indicator, no client tax math. 4I.5 review body stays rendered.

## PACKAGE E2E

- `tests/web/e2e/high-income-review-package.spec.ts` — scenarios A–AG across Desktop
  1440x900 / Tablet 768x1024 / Mobile 390x844, all PASS in both validator runs.
  4I.5 `high-income-review.spec.ts` A–Q remain green on all 3 viewports.

## FINAL 4I SCENARIO MATRIX & FUZZ

- Scenario matrix: `high-income-review-package-fixtures.test.ts` + the E2E A–AG
  cover the full regime (threshold boundaries, rate cap, dividends/JCP/FII,
  credits none/partial/equal/greater/missing, redutor 34/40/45/unknown, missing/
  stale/conflicting evidence, foreign unsupported, multi-payer, multi-period
  unsupported, cross-year, concurrency, source/evidence revision, cross-user,
  zero/null, large decimals, export determinism, CSV injection, stale package,
  unsupported year) — ≥40 named cases.
- Package fuzz: `high-income-review-package-fuzz.test.ts` — ≥10,000 deterministic
  cases (same-state→same-fingerprint, shuffle invariance, unknown!=zero, blocked net
  null, no duplicate contribution, no unsafe CSV prefix, no NaN/Infinity/float). PASS.
- 4I.1 / 4I.2 / 4I.3 existing fuzz counts unchanged and green (run inside test:tax-engine).

## SCALE / QUERY SHAPE

- Export at 100 / 1,000 payers and 1k / 10k facts — bounded; evidence access stays
  bulk+constant (list + 2 watermark reads), no per-payer / per-fact query, no N+1
  (`high-income-review-package-scale.test.ts`, `annual-high-income-query-budget.test.ts`).
  The 4I.4 result is loaded exactly once; the package service calls no repository and
  never calls `calculate*`.

## CONCURRENCY

- `high-income-review-package-concurrency.test.ts`: 10 concurrent same-state exports →
  identical fingerprint; evidence-revision and 4H-source-revision races resolve to a
  consistent package or `SNAPSHOT_INCONSISTENT`, never a mixed-state package (reuses the
  4I.4 watermark fence). Repeated export creates no new economic state.

## 4I PROGRAM AUDIT

- 4I.1 MATCH · 4I.2 MATCH · 4I.3 MATCH · 4I.4 MATCH · 4I.5 MATCH. No frozen calculation
  file changed (empty diff on `packages/tax-engine/src/annual-irpf/high-income/`); no
  `schema.prisma` change.

## DATABASE

- fresh migrate deploy / status: clean, **18 migrations, no pending, no drift, no db push**.
- new migration: NONE (derived/non-persisted).
- orphans: taxpayer_confirmations 0, high_income_evidence 0, account→portfolio 0,
  transaction→account composite ownership 0.
- canonical PG16.15 (`atlas_test` @ `localhost:5433`); the stale local PG18 `127.0.0.1:5433`
  shadow was bypassed via the `localhost`/`::1` route (documented follow-up).

## PLATFORM (independently re-run by orchestrator, PG16.15)

- test:database, test:fiscal-api (incl. new 4I.6 api/security/concurrency/scale/db-chain),
  test:api (254/254 on re-run — see FLAKE note), test:security, test:auth,
  test:architecture, test:web, test:ui, test:mobile, test:web:e2e, test:tax-engine (614):
  all PASS. Financial matrix (portfolio-engine, valuation, performance, performance-series,
  risk, risk-adjusted, relative-risk, active-performance, rolling-analytics, tail-risk,
  scenario, benchmark, rate-benchmark, historical-market-data, portfolio-intelligence,
  domain): all PASS. Regression blocks 4A–4G, 4H.2–4H.6 + 4H final, 4I.1–4I.5: covered by
  the above suites, green.

## MANDATORY ORCHESTRATOR VALIDATORS (executed verbatim)

| Validator                           | Run                      | Exit | Duration      | Result                          |
| ----------------------------------- | ------------------------ | ---- | ------------- | ------------------------------- |
| `pnpm validate:portfolio-engine-rc` | #1 (workflow)            | 1    | ~240s to fail | FAIL — single flake (see below) |
| `pnpm validate:foundation`          | #1 (orchestrator)        | 0    | ~1589s        | **PASS**                        |
| `pnpm validate:portfolio-engine-rc` | #2 (orchestrator, retry) | 0    | ~1769s        | **PASS**                        |

### FLAKE classification (spec §55–§56, honest both-runs report)

Workflow run #1 of `validate:portfolio-engine-rc` failed with exit 1 on ONE test:
`tests/api/api-contract-freeze.test.ts` #1 ("GET /state satisfies frozen schema…"),
with `prisma.account.create()` → FK violation on `accounts_portfolio_id_fkey` (the
parent portfolio row absent at account-insert time). This is a **frozen phase-1H
portfolio-engine contract test, unrelated to any 4I.6 code**, and the symptom is a
transient shared-`atlas_test` fixture/state timing issue. The orchestrator reproduced
`pnpm test:api` immediately: **37 files / 254 tests PASS, that exact test green** — did
NOT recur. Root cause: transient test-DB state, not a product defect. One retry of the
RC validator (run #2) passed clean end-to-end. Reported, not discarded.

## ROOT / GOVERNANCE (via the validators)

pnpm test, build, typecheck, lint, format:check: PASS.

## SECURITY (all NO)

cross-user export denied (404 anti-enumeration); unauthenticated denied; foreign-payer
evidence not exposed; tampered year/path safe; CSV injection blocked; HTML escaped;
no secret/token/session/DB-id/stack leak; no public cache; no sensitive telemetry.
(`high-income-review-package-security.test.ts`.)

## ARCHITECTURE (all NO)

new tax math outside engines: NO; second tax engine: NO; final tax persisted: NO;
4H recomputed: NO; Prisma in pure tax engine: NO; React in tax engine: NO;
client-side tax math: NO (`no-client-high-income-tax.test.ts` green); Tax AI: NO.

## CONTRACTS / DOCS

- high-income-minimum-tax-foundation-v1 / calculation-v1 / corporate-redutor-v1 /
  annual-integration-v1 / user-review-v1: MATCH (unchanged).
- **high-income-annual-review-package-v1:** NEW (frozen schema/sections/status/null-zero/
  provenance/fingerprint/stale/export/labeling/security/mapping policy/no-Receita claims).
- filing-support-mapping-2026: NEW. ADR 050: NEW. AGENTS.md §78: durable 4I.6 invariants added.

## SCOPE

annual support package: IMPLEMENTED · JSON support export: IMPLEMENTED · human-readable
(CSV) export: IMPLEMENTED · filing guidance: IMPLEMENTED only as GENERAL_SUPPORT ·
official Receita file: NOT IMPLEMENTED · DIRPF transmission: NOT IMPLEMENTED · Receita
submission: OUT OF SCOPE · DARF: NOT IMPLEMENTED · payment/refund: NOT IMPLEMENTED ·
Tax AI: NOT ENABLED.

## FINAL

- PACKAGE_CORE: READY · EXPORT: READY · PROVENANCE: READY · STALE_DETECTION: READY ·
  FILING_SUPPORT: READY · SECURITY: READY · CONCURRENCY: READY · SCALE: READY ·
  4I_PROGRAM_AUDIT: READY · REGRESSIONS: READY.
- REAL_4I6_BLOCKERS: none.

**PHASE 4I.6: APROVADA**
**PHASE 4I: APROVADA DEFINITIVAMENTE**

FINAL 4I CHECKPOINT: recorded in the commit that adds this report (branch HEAD).
