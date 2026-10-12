# ADR-288: Tax Compliance Action Center Is a Derived Orchestration Layer

Status: Accepted (Phase 4K.4)

## Context

Phase 4K.1 answers "what tax obligations exist"; 4K.2 answers "how to
prepare and document payment"; 4K.3 answers "how to remind the investor".
Investors still must mentally reconcile several fiscal screens. Phase 4K.4
adds one unified operational workspace — "what should I work on now, what
comes next, what is already complete" — over already-authoritative state.

## Decision

The Tax Compliance Action Center is a derived orchestration layer over
4K.1, 4K.2, 4K.3 and annual review state; it does not persist or
recalculate fiscal truth.

Concretely (`assembleTaxComplianceActionCenter` /
`projectTaxComplianceCalendar`: pure, deterministic, zero-I/O engines):

- Action identity is semantic
  (`${obligationKey}:${kind}:${sourceFingerprint}`); no random UUID
  business identity; no semantic duplicate action.
- Priority (`CRITICAL/HIGH/MEDIUM/LOW`) and next action are deterministic
  product UX policy, never law; they never alter tax, due dates, payment
  or filing state.
- Every actionable item exposes one canonical next action; the center
  never executes fiscal acts.
- Source fingerprint changes supersede the old current item; a coherent
  single snapshot (timeline + settlements + reminder actions +
  preferences) is assembled once per read — concurrent writes yield
  coherent A or B, never mixed A/B.
- Calendar projects authoritative dates only (due dates, reminder
  triggers, snoozes); evidence-review/informational siblings never mint a
  second due event for one semantic obligation.
- `USER_REPORTED_MATCH` stays user-reported; reminder actions never
  resolve compliance; upstream `BLOCKED`/`PARTIAL` stays visible.
- Current action state is derived, never persisted: no new migration
  (count stays 22), no `tax_compliance_action_items` cache table.
- Endpoints are principal-scoped with 404 anti-enumeration and
  `private, no-store` semantics; clients perform zero fiscal math.

## Consequences

- Sort order (`priority DESC, dueDate ASC NULLS LAST, period ASC,
actionKey ASC`), summary counters (exactly reconciled), center
  fingerprint (order-invariant, `generatedAt`-excluded) and the 24-month
  calendar bound are frozen by `tax-compliance-action-center-v1`.
- Web renders the full center (summary, priority list, month + agenda
  calendar, filters, stale/evidence wording, bounded history); mobile
  renders the condensed equivalent (summary, attention, agenda, review,
  recent completed). Both format server strings verbatim.
- Scale holds: 10k-item assembly ~100ms engine-side; service path keeps a
  constant 123-query shape with zero N+1.
- 4K.1/4K.2/4K.3 engines, contracts and migrations are untouched (zero
  semantic drift).
