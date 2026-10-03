# ADR 048: Annual Tax Readiness, Evidence Management & Taxpayer Confirmations

**Status:** Accepted  
**Date:** 2026-10-02  
**Deciders:** Project Atlas Architecture Council  
**Context:** Phase 4H.5 — Annual Completeness, Evidence & Taxpayer Confirmation

---

## 1. Context and Problem Statement

Preparing annual Brazilian income tax returns (DIRPF) requires authoritative and complete evidence across multiple fiscal sub-domains:

- Custody positions at opening and closing of the calendar year;
- 12 months of net capital gain/loss calculations;
- Monthly DARF 6015 obligations, carry-forwards, and actual payment status;
- Dividend transition eligibility (Lei 15.270/2025);
- FII income tax exemption requirements (Lei 11.033/04 c/c Lei 14.754/23);
- Official withholding tax evidence (IRRF);
- Investment income aggregations (Dividends, JCP, FII).

When data or evidence is missing or ambiguous, how should Project Atlas evaluate readiness, surface actionable requirements, and allow the taxpayer to formally confirm or upload evidence without recalculating financial facts or compromising audit integrity?

---

## 2. Decision Drivers

1. **Deterministic Completeness:** Readiness must be evaluated by a pure domain function (`buildAnnualTaxReadinessAssessment`) without side effects.
2. **Precedence Hierarchy:** Blocking conditions (`BLOCKED`) must always take precedence over confirmations needed (`REQUIRES_CONFIRMATION`), which in turn supersede partial (`PARTIAL`), ready (`READY`), or no activity (`NO_ACTIVITY`).
3. **Audit Trail & Stale Detection:** If underlying data changes after a user confirms a fact (e.g. new retroactive transaction added), the confirmation must be flagged as `STALE` via cryptographic fingerprint matching (`sourceFingerprint`).
4. **Monotonic Revisions:** Confirmation records in the database (`TaxpayerConfirmationRecord`) must support revisions and revoking without destroying historical audit trails.
5. **Strict Anti-Enumeration:** Cross-user resource access must return `404 Not Found` or `401 Unauthorized`.
6. **Bounded Query Performance:** Reading annual readiness must execute in bounded queries and sub-second latency.

---

## 3. Considered Options

- **Option A:** Ad-hoc front-end checks evaluating whether lists are empty.
  - _Rejected:_ Violates Rule 8.5 / 1.8 (zero financial/fiscal logic in client-side code).
- **Option B:** Mutable flags stored directly in portfolio/transaction tables.
  - _Rejected:_ Violates append-only transaction ledger invariants.
- **Option C:** Pure Domain Readiness Engine + Dedicated `taxpayer_confirmations` Repository + View Model projections.
  - _Selected:_ Preserves clean architecture, auditability, pure functional testability, and deterministic replay.

---

## 4. Decision Outcome

**Chosen Option:** **Option C**.

- Implemented `packages/tax-engine/src/annual-irpf/annual-tax-readiness-engine.ts`.
- Created Prisma model `TaxpayerConfirmationRecord` and `ITaxpayerConfirmationRepository`.
- Built API endpoints `GET /api/v1/fiscal/annual/:calendarYear/readiness` and `POST /api/v1/fiscal/annual/:calendarYear/confirmations`.
- Integrated UI view models in `packages/ui` and responsive web components in `apps/web`.

---

## 5. Consequences

- **Positive:**
  - 100% deterministic evaluation verified by 10,000-case fuzzing and scale tests.
  - Clear user guidance through actionable evidence requirements.
  - Robust stale confirmation detection preventing silent data drift.
- **Negative / Trade-offs:**
  - Requires maintaining SHA-256 fingerprint generation consistent across fiscal data representations.
