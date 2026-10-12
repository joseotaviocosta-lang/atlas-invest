# Contract: Tax Compliance Reminders & Notification Orchestration v1

## 1. Scope & Purpose

This contract defines the derived reminder model, user-action semantics,
notification delivery foundation, preference policy, API endpoints, and
security invariants for **Phase 4K.3: Tax Compliance Reminders & Deadline
Notification Orchestration Foundation**.

Atlas helps the investor not forget what needs attention and when. Atlas
**does not** recompute tax, legal deadlines, minimum-DARF thresholds,
penalties, interest, or SELIC; **does not** execute payments; **does not**
integrate with banks, PIX, boletos, Sicalc, gov.br/e-CAC, or Receita Federal;
and **does not** send email/SMS/WhatsApp/push beyond in-app surfacing.

## 2. Upstream Authority (never recomputed here)

- **4K.1** `TaxComplianceObligation`: status, due date, severity,
  sourceFingerprint, supersession state, requirements.
- **4K.2** `TaxPaymentSupport`: support/reconciliation state, stale evidence,
  requires-review state.
- 4K.3 consumes current compliance state. It never becomes a source of
  fiscal truth.

## 3. Domain Types & Enums

### 3.1 Enums

- **`TaxComplianceReminderKind`**: `UPCOMING_DUE | DUE_TODAY | OVERDUE |
ACTION_REQUIRED | EVIDENCE_REQUIRED | PAYMENT_EVIDENCE_REVIEW |
STALE_SOURCE | ANNUAL_REVIEW_REQUIRED`. Every kind is backed by a current
  upstream state; no kind is synthesized from thin air.
- **`TaxComplianceReminderStatus`**: `PENDING | SCHEDULED | DELIVERED |
ACKNOWLEDGED | SNOOZED | DISMISSED | SUPERSEDED | CANCELLED`.
- **`TaxComplianceReminderActionType`**: `ACKNOWLEDGE | SNOOZE | DISMISS`.
- **`TaxComplianceReminderChannel`**: `IN_APP | MOBILE_IN_APP`.
- **`TaxComplianceNotificationDeliveryStatus`**: `DELIVERED |
SKIPPED_SUPERSEDED`. External-delivery success is never invented.

_Fiscal Authority Boundary Note_: reminder lead times (default 7/3/1 days)
are product UX policy, not tax law. `reminderAt = dueDate - leadTime` uses
the already-authoritative dueDate; the legal deadline itself is never
derived here.

### 3.2 `TaxComplianceReminder`

```typescript
export interface TaxComplianceReminder {
  readonly reminderKey: string; // `${obligationKey}:${kind}:${triggerAt}`
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceReminderKind;
  readonly triggerAt: string; // civil YYYY-MM-DD
  readonly effectiveAt: string; // triggerAt, or snoozedUntil while snoozed
  readonly status: TaxComplianceReminderStatus;
  readonly severity: 'INFO' | 'ACTION' | 'WARNING' | 'BLOCKING';
  readonly title: string; // lock-screen-safe, never amounts/credentials
  readonly message: string; // in-app detail, upstream strings verbatim
  readonly actionTarget: string; // '/tax'
  readonly deliveryChannels: readonly TaxComplianceReminderChannel[];
  readonly dedupKey: string; // `${reminderKey}:${sourceFingerprint}`
  readonly sourceVersion: '4K.3';
  readonly snoozedUntil: string | null;
  readonly actedAt: string | null;
  readonly isStale: boolean;
}
```

### 3.3 `TaxComplianceReminderPreferences`

```typescript
export interface TaxComplianceReminderPreferences {
  readonly remindersEnabled: boolean;
  readonly upcomingEnabled: boolean;
  readonly overdueEnabled: boolean;
  readonly annualEnabled: boolean;
  readonly leadTimes: readonly number[]; // 1..30, max 5, ascending canonical
}
```

Defaults: all enabled, leadTimes `[7, 3, 1]` (canonicalized ascending
`[1, 3, 7]` on read). Defaults are safe and not spammy.

### 3.4 `TaxComplianceNotificationEvent`

```typescript
export interface TaxComplianceNotificationEvent {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly reminderKey: string;
  readonly sourceFingerprint: string;
  readonly channel: TaxComplianceReminderChannel;
  readonly triggerAt: string;
  readonly deliveredAt: string;
  readonly deliveryStatus: TaxComplianceNotificationDeliveryStatus;
  readonly attempt: number;
  readonly dedupKey: string; // `${reminderKey}:${channel}:${sourceFingerprint}`
  readonly createdAt: string;
}
```

## 4. Semantics

### 4.1 User actions (reminder surfacing only)

- `ACKNOWLEDGE` ("user saw it") — never means paid/filed/resolved/accepted.
- `DISMISS` ("do not show this instance again") — never means resolved.
- `SNOOZE` (requires future `snoozedUntil`, ≤365 days) — shifts surfacing
  only; never changes dueDate, obligation, payment, or tax state. Expiry
  resurfaces the same instance as `DELIVERED`.

### 4.2 Source change

Every reminder binds `(obligationKey, sourceFingerprint)`. When the source
changes, the old instance becomes `SUPERSEDED` (history preserved) and a
fresh instance is derived. Old acknowledgement/dismissal is never reused
across a changed source.

### 4.3 Payment evidence

- `USER_REPORTED_MATCH` raises no pending-payment nag (a match is still
  user-reported, never government confirmation — and never claimed as such).
- `USER_REPORTED_MISMATCH` raises `PAYMENT_EVIDENCE_REVIEW`.
- `STALE_SOURCE` raises `STALE_SOURCE` with the canonical message: "Os dados
  desta obrigação foram alterados. Revise novamente antes de considerar o
  item resolvido."

### 4.4 Overdue

One `OVERDUE` instance per obligation+source (trigger `dueDate + 1`), no
per-cycle spam. Overdue content states that Atlas computes no
penalty/interest/SELIC.

### 4.5 Delivery

In-app surfacing is recorded explicitly per `(reminder, channel, source)`.
Retries are idempotent (same canonical event). Delivery against a stale
fingerprint is rejected (404), never invented. Failed delivery never alters
compliance state.

## 5. API

- `GET /api/v1/fiscal/compliance/reminders?calendarYear&status&kind&triggerFrom&triggerTo`
  → `200 { data, meta: { totalCount, generatedAt } }`.
- `POST /api/v1/fiscal/compliance/reminders/:reminderKey/actions` →
  `201 { data: record }` (`CREATED | SUPERSEDED` revision; structurally
  idempotent resubmission returns the same revision).
- `POST /api/v1/fiscal/compliance/reminders/:reminderKey/deliveries` →
  `201 { data: event }` (`DELIVERED`, idempotent per dedup key).
- `GET /api/v1/fiscal/compliance/reminders/:reminderKey/deliveries` →
  `200 { data: events }` (newest first).
- `GET /api/v1/fiscal/compliance/reminder-preferences` → `200 { data }`
  (defaults when never configured).
- `PUT /api/v1/fiscal/compliance/reminder-preferences` → `200 { data }`.

All reminder routes: authenticated principal owns access (`taxSubjectId`
from principal, never client); foreign keys → `404` (never `403`);
`Cache-Control: private, no-store` (+ `Pragma: no-cache` on exports where
applicable); strict Zod DTOs (snooze bounds, lead-time bounds, note ≤1000,
no silent field coercion).

## 6. Persistence (migration 22, additive only)

- `tax_compliance_reminder_actions` — append-only `(taxSubjectId,
reminderKey, revision)` unique `tax_compliance_reminder_action_rev_uniq`.
- `tax_compliance_notification_events` — dedup unique `(taxSubjectId,
dedupKey)` `tax_compliance_notification_event_dedup_uniq`.
- `tax_compliance_reminder_preferences` — single row per subject (upsert).

Migrations 1–21 untouched. No `db push`. No historical migration edits.

## 7. Privacy & Claims

- Titles are lock-screen-safe ("Você tem uma obrigação fiscal próxima do
  vencimento" style); amounts/details only inside the authenticated app.
- Notifications never claim Receita sent the alert, government confirmed a
  payment, or a debt is officially overdue beyond the Atlas source.
- Logs never carry amounts, evidence payloads, receipt numbers, bank data,
  credentials, tokens, or full notification payloads.
- Support-only disclaimer on every surface: Atlas does not process payments
  nor transmit data to Receita Federal.

## 8. Performance

- Projection `O(n)`, dedup `O(n)`, preference fold `O(n)`, sort
  `O(n log n)`; no `O(n²)` blocker; no N+1 per reminder/action/event
  (timeline + settlements + actions + preferences = bounded query shape).
