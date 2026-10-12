# ADR-287: Tax Compliance Reminders & Notification Orchestration Foundation

Status: Accepted (Phase 4K.3)

## Context

Phase 4K.1 answers "what needs attention"; Phase 4K.2 answers "how to
prepare and document payment". Investors still forget. Phase 4K.3 adds a
deterministic reminder and notification orchestration layer on top of the
already-approved compliance state, without becoming a new fiscal authority.

## Decision

Fiscal reminders are derived from authoritative compliance state
(`projectTaxComplianceReminders`: 4K.1 obligations + 4K.2 payment hints +
preferences + actions + injected civil today → frozen read models);
user reminder actions (acknowledge/snooze/dismiss) and in-app delivery
history are persisted separately and never mutate fiscal truth.

## Consequences

- Reminder identity is semantic
  (`${obligationKey}:${kind}:${triggerAt}`) with dedup key
  (`${reminderKey}:${sourceFingerprint}`); no random UUID business identity.
- Reminder timing derives from the authoritative dueDate
  (`reminderAt = dueDate - leadTime`); the legal deadline is never derived.
- Lead times (default 7/3/1) are product UX policy, documented as not law.
- Acknowledge/dismiss never resolve compliance; snooze shifts surfacing
  only (future civil date, ≤365 days, expiry resurfaces).
- Source change supersedes old instances; suppression never carries over;
  history is append-only and preserved.
- Delivery is in-app only, explicitly recorded, idempotent per
  `(reminder, channel, source)`; stale delivery claims are rejected.
- Overdue yields exactly one instance per source; no per-cycle spam; no
  penalty/interest/SELIC computation anywhere.
- Persistence is additive (migration 22: reminder actions, notification
  events, preferences); 4K.1/4K.2 engines, contracts, and migrations are
  untouched (zero semantic drift).
- Endpoints are principal-scoped with 404 anti-enumeration and
  `private, no-store` semantics; previews minimize sensitive content.
