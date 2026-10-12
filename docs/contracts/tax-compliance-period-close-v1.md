# Contract: Tax Compliance Period Close, Evidence Binder & Professional Handoff v1

Contract: `TAX_COMPLIANCE_PERIOD_CLOSE_V1`
Phase: 4K.5 — Tax Compliance Period Close, Evidence Binder & Professional Handoff Foundation
Status: Frozen (v1)

This contract defines the deterministic operational closeout and evidence
packaging layer over already-authoritative Atlas fiscal/compliance state.
Closeout is OPERATIONAL ONLY: it never means legal settlement, Receita
verification, official filing acceptance, debt extinguishment, payment
execution or tax advice.

## 1. Authority Hierarchy (Consume, Never Recompute)

4K.5 consumes, in this order:

- **4K.1** obligations, workflow state, due dates, source fingerprints,
  supersession.
- **4K.2** payment support, settlement evidence (metadata only),
  reconciliation, stale evidence, `USER_REPORTED` status.
- **4K.3** reminder state, acknowledgement, snooze, dismissal, delivery
  history (counts only).
- **4K.4** unified action center, current actionable items, calendar
  projection, summary counters (copied verbatim).
- **4J/4H/4I** annual IRPF orchestration/readiness (annual scope).

Forbidden inside 4K.5: tax-rate calculations, monthly tax recomputation,
loss compensation, IRRF recomputation, minimum-DARF comparison, due-date
derivation, revenue-code derivation, penalty/interest/SELIC, high-income
and annual tax calculation.

## 2. Scopes & Period Identity

`MONTHLY` (`period: "YYYY-MM"`, `month` set, `exercise: null`) and
`ANNUAL` (`period: "YYYY"`, `month: null`, `exercise: calendarYear + 1`)
never mix. The engine re-filters defensively by scope; monthly excludes
annual-review items by construction (`exercise === null`).

## 3. Readiness (Frozen Precedence)

`BLOCKED > STALE > REQUIRES_REVIEW > PARTIAL > READY_TO_CLOSE > NO_ACTIVITY`.

- `READY_TO_CLOSE`: "Atlas has no currently known unresolved operational
  compliance item for this support period according to the available
  authoritative data." NEVER government settlement.
- `BLOCKED`: authoritative upstream material prerequisite (blocking
  obligation, critical action item, blocked payment support).
- `STALE`: a preserved CLOSED record exists for an older source
  fingerprint.
- `REQUIRES_REVIEW`: actionable items, mismatches, stale items,
  awaited confirmations/evidence.
- `PARTIAL`: upstream-declared incompleteness (`darfReadiness: PARTIAL`).
- `NO_ACTIVITY`: empty scope (distinct from `READY_TO_CLOSE`).

`cleanCloseAllowed` is true exactly for `READY_TO_CLOSE`/`NO_ACTIVITY`.

## 4. Checklist (Derived, Never Manually Ticked)

`OBLIGATIONS_REVIEWED | ACTION_ITEMS_RESOLVED | PAYMENT_SUPPORT_REVIEWED |
PAYMENT_EVIDENCE_RECONCILED | STALE_ITEMS_REVIEWED |
ANNUAL_CONFIRMATIONS_RESOLVED | BLOCKERS_CLEARED`, each `COMPLETE |
INCOMPLETE | NOT_APPLICABLE | BLOCKED | REQUIRES_REVIEW`. Only applicable
entries resolve terminally; user acknowledgement never substitutes
authoritative state.

## 5. Clean Close Only

`POST period-close` succeeds (201, or 200 idempotent) only when
`cleanCloseAllowed`. `BLOCKED`/`PARTIAL`/`REQUIRES_REVIEW`/`STALE` fail
closed with `422 PERIOD_CLOSE.NOT_READY`. No exceptional close mode
exists in v1 (`CLOSE_WITH_ACKNOWLEDGED_EXCEPTIONS` deliberately not
implemented): a stale period is reclosed only after its prior close is
explicitly reopened, keeping the audit trail complete.

## 6. Close Records (Immutable, Revisioned, Idempotent)

- Identity: `(taxSubjectId, scope, period, revision)`; revision monotonic.
- Close identity: `(taxSubjectId, scope, period, sourceFingerprint,
binderFingerprint)`.
- Idempotency rule: latest `REOPENED` → a reclose always appends a fresh
  revision (the voided close stays voided); latest `CLOSED` → any
  preserved `CLOSED` row with identical fingerprints converges to
  `IDEMPOTENT` (no duplicate semantic close under concurrency).
- Reopen appends `REOPENED` (explicit reason, 1–280 chars); only the
  latest `CLOSED` record is reopenable (`422` otherwise, `404` for
  foreign ids). Prior rows are never mutated.
- `closed(A)` never implies `closed(B)` when fingerprints differ.
- Audit retained per event: who (principal), when, source/binder
  fingerprints, revision, mode/status. Audit is NOT legal certification.

## 7. Source Fingerprint

SHA-256 over sorted obligation/item/hint entries (status, severity,
amount verbatim, kind, priority, reconciliation). Order-invariant,
timestamp-free. Reminder surfacing state (`ACK`/`SNOOZE`/`DISMISS`) is
deliberately EXCLUDED (reminder actions never resolve compliance, so
they must never stale a close). Evidence-only additions on non-payable
months enrich the binder (new binder revision on reclose) without
staling the source lineage.

## 8. Evidence Binder (Support Package Only)

Sections: `PERIOD_IDENTITY | CLOSE_READINESS | OBLIGATIONS |
ACTION_CENTER | PAYMENT_SUPPORT | PAYMENT_EVIDENCE | REMINDERS_WORKFLOW |
UNRESOLVED_ITEMS | SOURCES_METADATA | DISCLAIMERS`. Unresolved items are
mandatory when applicable (enumerated per `(ref, kind)` — one obligation
may appear as blocker AND mismatch). Evidence rows are verbatim metadata
(`externalReference` rendered CSV-injection-safe; canonical value
unchanged in storage/API). No binary attachments (the 4K.2 model stores
metadata only; no upload infrastructure added).

`binderFingerprint` is SHA-256 over canonical content minus
`generatedAt`; same semantics in any order → identical JSON/CSV bytes.

## 9. Export (Support-Only Handoff)

JSON + single-file CSV (`;` delimiter, CRLF, OWASP-escaped cells). No ZIP
(no archive infrastructure invented). Filenames carry scope + period only
(`atlas-fechamento-{mensal|anual}-{period}-apoio.{csv|json}` — no PII, no
traversal; server validates, client strips defensively). `Content-Disposition:
attachment`, `private, no-store`. Never imitates DARF layout, Receita
receipt, DIRPF receipt or clearance certificate.

## 10. API

- `GET period-close/readiness?scope&calendarYear&month?&exercise?`
- `POST period-close` (201 created / 200 idempotent / 422 not ready).
- `POST period-close/:id/reopen` (201 / 200 idempotent / 404 / 422).
- `GET period-close/history?scope?&period?&limit&offset` (deterministic
  `scope ASC, period DESC, revision DESC`).
- `GET period-close/binder?...` (current binder + readiness).
- `GET period-close/binder/export?...&format=json|csv` (download).

Principal-scoped throughout; `taxSubjectId` never trusted from clients;
foreign resources → `404`; no stack traces; no sensitive payload logging.

## 11. Presentation Invariants

- Web: period selector, readiness status, checklist, unresolved items,
  close action (with operational notice), binder preview (collapsible
  sections), export buttons, history with reopen flow, stale warning.
- Mobile: condensed equivalent (status, checklist, unresolved, close,
  history, binder summary); export explicitly deferred to desktop.
- Calendar year ≠ exercise, always distinguished. Upstream
  `BLOCKED`/`PARTIAL` stays visible; errors never become "all clear".
- Clients format server strings verbatim; zero fiscal math.

## 12. Persistence

One additive table (`tax_compliance_period_close_records`, migration
23); revisions append-only; `(subject, scope, period, revision)` unique
is the concurrency barrier. No other new tables. Migrations 1–22
untouched; no `db push`.

## 13. Performance

Readiness/checklist/binder O(n), dedup O(n), history O(n)/indexed, sort
O(n log n); no O(n²); no N+1 per obligation/evidence/reminder/action
item/close revision (one timeline load + five batch loads, constant
shape); bounded memory.

## 14. Anti-Scope

No tax engine, no deadline engine, no payment engine, no legal
certification, no government filing, no tax advice, no Sicalc/gov.br
automation, no Receita submission, no DIRPF transmission, no bank/PIX/
boleto integration, no official DARF generation, no Tax AI.
