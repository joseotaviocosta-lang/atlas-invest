# ADR-289: Tax Compliance Period Close Is an Operational Snapshot and Evidence Packaging Workflow

Status: Accepted (Phase 4K.5)

## Context

Phase 4K.4 answers "what requires attention now". Investors and their
accountants still need to close a fiscal period operationally, see exactly
what remains unresolved, and carry a complete support package out of Atlas
— without anyone mistaking an Atlas screen for a government receipt.

## Decision

Tax compliance period close is an operational snapshot and evidence
packaging workflow; historical close records are persisted, while tax
truth remains authoritative upstream.

Concretely (`assessPeriodCloseReadiness` / `assembleEvidenceBinder`:
pure, deterministic, zero-I/O; `tax_compliance_period_close_records`:
append-only, revisioned):

- Readiness is derived with frozen precedence (`BLOCKED > STALE >
REQUIRES_REVIEW > PARTIAL > READY_TO_CLOSE > NO_ACTIVITY`); clean close
  exists only for `READY_TO_CLOSE`/`NO_ACTIVITY`, everything else fails
  closed (`422`). No exceptional close mode in v1.
- Checklist and unresolved items derive from 4K.1/4K.2/4K.3/4K.4/annual
  state; users never tick fiscal conditions manually.
- Close identity is semantic (subject, scope, period, source + binder
  fingerprints); repeats converge idempotently, except after an explicit
  reopen, which voids currency and makes the reclose a new revision.
- Source changes stale previous closes (`closed(A)` never implies
  `closed(B)`); reminder surfacing never stales a close; history is never
  rewritten.
- The binder consumes upstream values verbatim (evidence metadata only —
  no binary uploads added), enumerates every material unresolved item,
  and ships with the support disclaimer on every surface and export.
- Endpoints are principal-scoped with 404 anti-enumeration and
  `private, no-store` semantics; clients perform zero fiscal math.

## Consequences

- Monthly and annual scopes (and calendar year vs exercise) never mix;
  `USER_REPORTED` evidence is never presented as government verification;
  exports never imitate official documents and neutralize CSV injection.
- One additive table (migration 23) with a revision-uniqueness barrier;
  migrations 1–22 untouched; fresh `0→23`, idempotent second deploy, and
  `22→23` upgrade with full preservation are proven in
  `phase-4k5-canonical-db-evidence`.
- Service path keeps a constant query shape (one timeline load + five
  batch loads); 10k-item readiness holds with zero N+1.
- 4K.1/4K.2/4K.3/4K.4 engines, contracts and migrations are untouched
  (zero semantic drift).
