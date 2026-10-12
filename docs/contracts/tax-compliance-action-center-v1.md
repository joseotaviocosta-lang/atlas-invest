# Contract: Tax Compliance Action Center & Calendar Foundation v1

Contract: `TAX_COMPLIANCE_ACTION_CENTER_V1`
Phase: 4K.4 — Tax Compliance Action Center & Calendar Foundation
Status: Frozen (v1)

This contract defines the unified operational compliance workspace that
combines current obligations, due dates, reminder state, payment-support
state, evidence/reconciliation state, annual review tasks, user workflow
state, source changes/staleness, next required actions, calendar
representation and history/audit visibility — without recomputing any
fiscal truth.

## 1. Authority Hierarchy (Consume, Never Recompute)

4K.4 consumes, in this order:

- **4K.1** `TaxComplianceObligation`: identity, status, due date, revenue
  code, amount/payable state, source fingerprint, workflow state,
  supersession.
- **4K.2** payment hints: payment support status, user-reported evidence,
  reconciliation status (`NO_EVIDENCE | USER_REPORTED_MATCH |
USER_REPORTED_MISMATCH | STALE_SOURCE`), stale evidence review
  requirements.
- **4K.3** reminders: scheduled/snoozed/acknowledged/dismissed states,
  effective dates, preferences.
- **4J/4H/4I** annual review/readiness context (calendar year + exercise).

4K.4 never derives tax rates, exemption thresholds, minimum-DARF
thresholds, revenue codes, legal due dates, IRRF logic, loss compensation,
payment verification, reminder trigger policy, or annual/high-income
calculations.

## 2. Action Identity

```ts
actionKey = `${obligationKey}:${kind}:${sourceFingerprint}`;
```

Deterministic semantic identity. No random UUID as business identity.
Same upstream item repeated yields exactly one action item.

## 3. Action Item Kinds

`PAY_TAX | REVIEW_PAYMENT_EVIDENCE | REVIEW_CHANGED_OBLIGATION |
PROVIDE_CONFIRMATION | REVIEW_ANNUAL_FILING | RESOLVE_BLOCKER |
COMPLETE_COMPLIANCE_ACTION | INFORMATIONAL`

No kind exists without authoritative upstream state backing it.

## 4. Operational Statuses

`ACTION_REQUIRED | UPCOMING | DUE_TODAY | OVERDUE | WAITING_USER |
REQUIRES_REVIEW | COMPLETED | SUPERSEDED | INFORMATIONAL`

## 5. Priority (UX Policy, Not Law)

`CRITICAL | HIGH | MEDIUM | LOW`, derived deterministically from
already-authoritative facts:

- `OVERDUE` actionable → `CRITICAL`
- `DUE_TODAY` → `HIGH`
- stale evidence / mismatch review → `HIGH`
- `UPCOMING` → `MEDIUM`
- `INFORMATIONAL` / `COMPLETED` / `SUPERSEDED` → `LOW`

Priority never alters tax, due date, payment state, obligation state or
annual filing state. Same inputs → same priority. Clock access only via
injected `todayCivilDate`.

## 6. Next Action

Every actionable item exposes exactly one canonical next action:

`REVIEW_OBLIGATION | PREPARE_PAYMENT | ADD_PAYMENT_EVIDENCE |
REVIEW_STALE_EVIDENCE | CONFIRM_INFORMATION | OPEN_ANNUAL_REVIEW |
ACKNOWLEDGE_REMINDER | VIEW_DETAILS`

4K.4 never executes fiscal acts itself.

## 7. No False Completion

An obligation is never marked complete because a reminder was
acknowledged/dismissed, payment support was viewed, a CSV was exported,
or the user opened the screen. Completion requires the authoritative
upstream workflow state.

`USER_REPORTED_MATCH` means only: user-reported evidence matches current
Atlas obligation data. It is never `PAID_BY_GOVERNMENT`,
`GOVERNMENT_VERIFIED` or `RECEITA_CONFIRMED`.

## 8. Source Fingerprints & Snapshot Consistency

Every item binds a single `sourceFingerprint`. When it changes, the old
item becomes historical (`SUPERSEDED`) and a new current item uses the
new fingerprint. Old dismissals/acknowledgements/evidence follow existing
4K.2/4K.3 semantics. Assembly runs once over one coherent snapshot
(timeline + settlements + reminder actions + preferences); concurrent
upstream writes shift which snapshot a later read observes — never a
mixed A/B item.

Center fingerprint (`centerFingerprint`) is SHA-256 over sorted semantic
entries + summary, excluding `generatedAt` and render order. Same
semantic set in different input order → same fingerprint.

## 9. Sort Order (Frozen)

`priority DESC, dueDate ASC (NULLS LAST), period ASC, actionKey ASC`.

## 10. Summary Counters

`needsAttention | overdue | dueToday | upcoming | requiresReview |
completed | annualReview | informational | total` — provided by the
backend ViewModel and exactly reconciled to action classification.
No client aggregation.

## 11. Calendar Projection

Authoritative dates only: obligation `dueDate`, actionable reminder
trigger/effective dates, `snoozedUntil` dates, and the current civil date
for review items. No legal date is inferred locally.

Event types: `OBLIGATION_DUE | REMINDER | PAYMENT_EVIDENCE_REVIEW |
ANNUAL_REVIEW | USER_SNOOZE` — only when backed by upstream data.
`OBLIGATION_DUE`/`ANNUAL_REVIEW` project only from obligation-state
items (never from evidence-review or informational siblings, preventing
duplicate dues for one semantic obligation). Event identity
`${sourceKey}:${eventType}:${eventDate}` is deterministic and deduped.
Annual items preserve `calendarYear` and `exercise` separately.
Range bound: max 24 months (744 days); wider/inverted/malformed ranges
fail closed with `400`. Filters: `eventType`, `status`, plus the
presentation alias `status=ATTENTION` (maps exactly to
`OVERDUE|DUE_TODAY|ACTION_REQUIRED|REQUIRES_REVIEW|WAITING_USER` —
canonical upstream statuses only, no fiscal interpretation).

## 12. API

- `GET /api/v1/fiscal/compliance/action-center?calendarYear&month&status&priority&kind&limit&offset`
  → `200 { data: items[], meta: { summary, centerFingerprint, generatedAt, totalCount, limit, offset } }`.
- `GET /api/v1/fiscal/compliance/calendar?calendarYear&from&to&eventType&status`
  → `200 { data: events[], meta: { from, to, totalCount } }`.

Detail payloads are not duplicated: items expose `actionTarget`
(`/tax`) for canonical navigation to existing 4K.1/4K.2 views.
Authenticated principal owns all data (`taxSubjectId` from principal,
never trusted from client). Foreign subject/resource → `404`
anti-enumeration. All responses `Cache-Control: private, no-store`.
No public/shared caching. No sensitive fiscal payload logging.

## 13. Presentation Invariants

- Web: summary counters, priority list, month + agenda calendar, filters,
  stale banner ("Dados desta obrigação foram alterados. Revise
  novamente."), `USER_REPORTED` evidence wording, reminder state shown
  without masquerading as resolution, bounded recent history.
- Mobile: condensed equivalent (summary, attention list, upcoming agenda,
  review items, recent completed) + agenda/list grouped by date.
- Calendar cells carry non-sensitive indicators only; amounts appear
  after opening the authenticated item.
- Empty states: no activity / no action required / no items in period /
  no history. Error states: loading / error / retry — never silently
  converted into "all clear". Upstream `BLOCKED`/`PARTIAL` stays visible.
- Annual `calendarYear != exercise`, always distinguished.

## 14. Persistence

Current action state is derived, never independently persisted. No new
migration (migration count stays 22). User workflow state continues to
live in 4K.1 actions, 4K.2 evidence and 4K.3 reminders/preferences/
delivery — no fourth copy.

## 15. Performance

Assembly `O(n)`, dedup `O(n)`, summary `O(n)`, calendar `O(n)`, sort
`O(n log n)`; no `O(n²)` blocker; no N+1 per obligation/evidence/
reminder/annual item (bounded query shape); bounded memory.

## 16. Anti-Scope

No tax engine, no deadline engine, no payment engine, no annual
calculator, no notification engine, no government integration, no Sicalc
automation, no gov.br/e-CAC automation, no Receita submission, no DIRPF
transmission, no bank integration, no PIX/boleto, no Tax AI.
