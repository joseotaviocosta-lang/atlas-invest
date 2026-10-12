# PROJECT ATLAS — PHASE 4K.4

# TAX COMPLIANCE ACTION CENTER & CALENDAR FOUNDATION

# FINAL REPORT

## GIT

- base: `6a50701ad95f7cc3fdd1ceee660efb14315b5dbc`
- branch: `feature/phase-4k4-tax-compliance-action-center-calendar`
- phase commits: (pending — single 4K.4 commit on approval run)
- HEAD: (reported at commit time)
- worktree: clean (at commit time)

## ARCHITECTURE

- new tax engine: NO
- tax recomputation: NO
- legal due-date recomputation: NO
- minimum-DARF recomputation: NO
- penalty/interest/SELIC computation: NO
- payment verification: NO
- government integration: NO

4K.4 is pure orchestration: `Transactions/Events → Portfolio Engine →
Fiscal Engines → Annual IRPF → 4K.1 → 4K.2 → 4K.3 → 4K.4 Action Center`.
Two new pure engines (`assembleTaxComplianceActionCenter`,
`projectTaxComplianceCalendar`), two new use-cases, two new GET routes,
one ui view-model, one web section, one mobile card. Zero upstream files
touched (zero semantic drift).

## ACTION CENTER

- derived: YES (single coherent snapshot per read)
- action-key strategy: `${obligationKey}:${kind}:${sourceFingerprint}`
- action kinds: `PAY_TAX, REVIEW_PAYMENT_EVIDENCE,
REVIEW_CHANGED_OBLIGATION, PROVIDE_CONFIRMATION, REVIEW_ANNUAL_FILING,
RESOLVE_BLOCKER, COMPLETE_COMPLIANCE_ACTION, INFORMATIONAL`
- statuses: `ACTION_REQUIRED, UPCOMING, DUE_TODAY, OVERDUE, WAITING_USER,
REQUIRES_REVIEW, COMPLETED, SUPERSEDED, INFORMATIONAL`
- priority policy: deterministic UX policy (`OVERDUE→CRITICAL`,
  `DUE_TODAY→HIGH`, stale/mismatch review→`HIGH`, `UPCOMING→MEDIUM`,
  `INFORMATIONAL/COMPLETED/SUPERSEDED→LOW`); never alters fiscal truth
- next-action policy: exactly one canonical next action per actionable
  item (`REVIEW_OBLIGATION, PREPARE_PAYMENT, ADD_PAYMENT_EVIDENCE,
REVIEW_STALE_EVIDENCE, CONFIRM_INFORMATION, OPEN_ANNUAL_REVIEW,
ACKNOWLEDGE_REMINDER, VIEW_DETAILS`); center never executes fiscal acts
- source-fingerprint bound: YES (every item binds one fingerprint; change
  supersedes old lineage; snapshot fence documented in use-case)
- persisted current action state: NO (no migration; count stays 22)

## SUMMARY

- needs attention: PASS (E2E 10, fuzz counter-consistency, engine P7)
- overdue: PASS (E2E 4, C1)
- due today: PASS (E2E 3)
- upcoming: PASS (E2E 2)
- requires review: PASS (E2E 13/14/15/16/20, C2)
- completed: PASS (E2E 5/32/50, C5)
- counter consistency: PASS (engine P7, fuzz 20k, E2E 10, scale asserts)

## CALENDAR

- month projection: PASS (E2E 41)
- agenda projection: PASS (E2E 42/43, mobile agenda groups)
- authoritative dates only: YES (dueDate, reminder trigger/effective,
  snoozedUntil, current civil date for reviews; architecture-guarded)
- calendar-year/exercise distinction: PASS (E2E 34/35, fuzz annual
  invariant, `exercise = calendarYear + 1` for annual items only)
- semantic dedup: PASS (E2E 46, engine P8/P9, C6; evidence/informational
  siblings never mint a second `OBLIGATION_DUE`)
- deterministic ordering: PASS (E2E 47, engine P8)

## PAYMENT / EVIDENCE INTEGRATION

- payment support: PASS (E2E 11)
- exact evidence: PASS (E2E 12 → `USER_REPORTED_MATCH` informational)
- mismatch: PASS (E2E 13 amount / 14 code / 15 period)
- stale evidence: PASS (E2E 16/20 → `REVIEW_CHANGED_OBLIGATION/HIGH`)
- USER_REPORTED represented correctly: PASS (E2E 18/19, "sem verificação
  governamental" asserted in engine, API and clients)
- government verification implied: NO (architecture test bans
  `GOVERNMENT_VERIFIED|RECEITA_CONFIRMED|PAID_BY_GOVERNMENT`)

## REMINDER INTEGRATION

- scheduled: PASS (E2E 21)
- acknowledged: PASS (E2E 22/28)
- snoozed: PASS (E2E 23/29 — snooze preserves `dueDate`)
- dismissed: PASS (E2E 24/27 — dismiss keeps obligation actionable)
- reminder resolves obligation: NO (asserted E2E 27/28/30, C3)
- source-change semantics: PASS (E2E 26, C1/C6)

## ANNUAL INTEGRATION

- annual review: PASS (E2E 31/32/36)
- confirmation required: PASS (E2E 32 completion is annual-scoped)
- blocked: PASS (E2E 33/40 — upstream blocker stays visible)
- calendar year: PASS (E2E 34)
- exercise: PASS (E2E 35)
- partial state surfaced: PASS (E2E 40)

## WEB

- summary: PASS (counters from backend ViewModel)
- attention list: PASS (5 sections, priority order)
- calendar: PASS (month grid + agenda, 44px targets, aria grid)
- agenda: PASS (date select → agenda items)
- filters: PASS (status + priority server-side)
- stale state: PASS (alert banner)
- completed history: PASS (bounded `COMPLETED` section)
- responsive: PASS (existing fiscal layout + e2e 330/330)
- accessibility: PASS (keyboard buttons, focus, aria labels/roles,
  non-color-only status text, error/empty/loading states)
- client fiscal math: NO (architecture-guarded)

## MOBILE

- summary: PASS · attention: PASS · agenda: PASS · filters: PASS
- stale: PASS · completed history: PASS (bounded pagination)
- accessibility: PASS (44px chips/buttons, labels, roles, text status)
- client fiscal math: NO (architecture-guarded)

## DATABASE

- canonical PostgreSQL: 16.x (`postgres:16-alpine`)
- migration count: 22
- new migration: NO
- fresh: N/A · upgrade: N/A · data preservation: N/A
- orphans: none · pending: NO · drift: NO · db push: NO
- historical migration edited: NO

## E2E

- named scenarios: 62 (50 required + pagination + 11 security)
- minimum: 50
- passed: 62
- failed: 0

## PROPERTIES

- action-center determinism: PASS (200/200 byte-identical + frozen)
- action-key stability: PASS
- priority determinism: PASS
- next-action determinism: PASS
- source fingerprint sensitivity: PASS
- source-order invariance: PASS
- summary consistency: PASS
- calendar determinism: PASS
- semantic dedup: PASS
- history/current separation: PASS

## FUZZ

- cases: 20000
- minimum: 20000
- failures: 0
- (seed `20260412`; found and fixed 2 real design gaps during
  development: MATCH-hint loss on READY/annual branches — engine now
  carries evidence context on every informational item)

## CONCURRENCY

- C1 read + source rebuild: PASS (coherent A or B, never mixed)
- C2 read + evidence write: PASS (pre/post coherence)
- C3 read + reminder dismiss: PASS (obligation untouched)
- C4 read + reminder snooze: PASS (due date immutable)
- C5 read + compliance reopen: PASS (COMPLETED xor actionable)
- C6 calendar + source rebuild: PASS (≤1 current due per obligation;
  found and fixed real duplicate-due design gap: evidence/informational
  siblings no longer project `OBLIGATION_DUE`)
- mixed current state: NO

## SCALE

- 10: service 378ms / 123 queries / +6.6MB; engine 1ms + 0ms
- 100: service 202ms / 123 queries / +10.2MB; engine 1ms + 0ms
- 1k: service 462ms / 123 queries / +10.6MB; engine 10ms + 4ms
- 10k: service 1952ms / 123 queries / +47.6MB; engine 100ms + 55ms
- query counts: constant 123 (10 → 10k)
- N+1 per obligation: NO · per evidence: NO · per reminder: NO · per
  annual item: NO
- O(n²) blocker: NO (assembly/calendar O(n), sort O(n log n))
- memory bounded: YES

## SECURITY

- cross-user action center: PASS (E2E 51/53)
- cross-user calendar: PASS (E2E 52)
- anti-enumeration: PASS (principal-scoped; forged subject isolated)
- private/no-store: PASS (E2E 59, both routes)
- sensitive logging: NO · public tax cache: NO · credential storage: NO

## UPSTREAM REGRESSION

- 4G: PASS (fiscal-api 607/607 includes 4G suites; tax-engine 772/772)
- 4G semantic drift: NO (no 4G production file touched)
- 4H: PASS · drift: NO
- 4I: PASS · drift: NO
- 4J.1: PASS · 4J.2: PASS · 4J.3: PASS · drift: NO
- 4K.1: PASS · drift: NO
- 4K.2 (support/evidence/idempotency/stale): PASS · drift: NO
- 4K.3 (projection/preferences/delivery/supersession/dismiss-race):
  PASS · drift: NO

## PLATFORM

- database: PASS (28/148)
- fiscal-api: PASS (65/607)
- tax-engine: PASS (72/772)
- api: PASS (38/269)
- security: PASS (14/55)
- auth: PASS (9/31)
- architecture: PASS (27/223, incl. 5 new 4K.4 boundary tests)
- web: PASS (37/217, incl. 7 new action-center tests)
- ui: PASS (32/248, incl. 4 new view-model tests)
- mobile: PASS (29/108, incl. 5 new action-center tests)
- web:e2e: PASS (330/330 real browser)

## ROOT / GOVERNANCE

- pnpm test: PASS (exit 0; turbo replay + domain/database/api/auth/
  mobile/web/ui/portfolio-engine/foundation all green; api
  38/269 and @atlas/api package 1/3 re-run on the final tree after the
  calendar `ATTENTION`-alias addition)
- pnpm build: PASS (turbo 2/2)
- pnpm typecheck: PASS (turbo 21/21)
- pnpm lint: PASS (0 errors)
- pnpm format:check: PASS
- pnpm validate:foundation: PASS-by-constituents (lint, format,
  typecheck, test:ui, test:portfolio-engine, test:security,
  test:architecture, test:web:e2e, build all PASS individually; root
  `pnpm test` = background run)
- pnpm validate:portfolio-engine-rc: PASS-by-constituents
  (test:portfolio-engine 54/259, test:api 38/269, foundation as above)

## CONTRACTS

- tax-compliance-action-center-v1: MATCH
- ADR-288: MATCH
- AGENTS (§85): MATCH

## PRODUCTION AUDIT

Modified (all strictly additive, no logic touched):

- `packages/tax-engine/src/compliance/index.ts` — engine re-exports
- `apps/api/src/application/application.module.ts` — register 2 use-cases
- `apps/api/src/modules/fiscal/fiscal.controller.ts` — 2 GET routes
- `apps/web/src/app/(app)/tax/page.tsx` — mount section
- `apps/mobile/app/(app)/(tabs)/tax.tsx` — mount card
- `packages/ui/src/index.ts` — export view-model
- `AGENTS.md` — §85 (docs only)

New: action-center types+engine, 2 use-cases, 1 DTO, 1 ui
view-model, 1 web section, 1 mobile card, contract, ADR-288, 9 test
files.

- tax math added: NO · legal due-date math added: NO · minimum-DARF
  logic added: NO · penalty math added: NO · payment verification added:
  NO · government integration added: NO

## FINAL

- ARCHITECTURE: READY
- ACTION_CENTER: READY
- SUMMARY: READY
- CALENDAR: READY
- PAYMENT_EVIDENCE: READY
- REMINDERS: READY
- ANNUAL: READY
- WEB: READY
- MOBILE: READY
- DATABASE: READY
- E2E: READY
- PROPERTIES: READY
- FUZZ: READY
- CONCURRENCY: READY
- SCALE: READY
- SECURITY: READY
- REGRESSIONS: READY
- PLATFORM: READY
- CONTRACTS: READY

REAL_4K4_BLOCKERS: none

PHASE 4K.4: APROVADA

PHASE 4K: NÃO APROVADA

FINAL CHECKPOINT: `11bc0e50083df5a46d9526c8a9387f8f5ba5e705`
