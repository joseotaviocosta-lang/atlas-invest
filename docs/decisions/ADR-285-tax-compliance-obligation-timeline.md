# ADR-285: Unified Tax Compliance Obligation Timeline & Operational State

## Status

Accepted (Phase 4K.1)

## Context

Project Atlas has completed the full calculation and orchestration pipeline for Brazilian personal taxation:

- **Phase 4G**: Monthly capital markets calculation (equity normal/day-trade, FIIs, IRRF credit pools, composed 6015 DARFs).
- **Phase 4H**: Annual IRPF calculation modules (capital markets annual summary, investment income categorization, Bens e Direitos opening/closing position valuation, declarations).
- **Phase 4I**: High-income minimum effective taxation (Lei nº 15.270/2025 amending Lei nº 9.250/1995, calendar year 2026 / exercise 2027, corporate redutor facts, attested income).
- **Phase 4J**: Unified annual IRPF program orchestration, consistency checks, and multi-format review package exports.

While these engines compute exact liabilities, positions, and readiness indicators, investors need a cohesive **Compliance Workspace**: an operational timeline answering:

1. "What do I need to pay or do this month?"
2. "Are there overdue obligations?"
3. "What documents, confirmations, or evidence are missing for annual filing?"
4. "Is professional accountant review required?"

## Decision Drivers

1. **Separation of Tax Engine Truth and Workflow State**:
   - The tax calculation remains pure and derived (Source of Truth is the Transaction Ledger and verified external facts).
   - The compliance timeline is a deterministic projection over the authoritative engine outputs plus persisted user workflow action records.
2. **Zero Government Affiliation & Non-Verification Disclaimer**:
   - Atlas is not integrated into Sicalc or Receita Federal e-CAC in Phase 4K.1.
   - User actions marking tasks as completed (`USER_REPORTED_COMPLETION`) record internal tracking only and must explicitly display disclaimers.
3. **Immutability & Cryptographic Supersession**:
   - Modifying upstream transactions or tax facts recalculates the state and changes its cryptographic fingerprint.
   - Stale user actions are marked `SUPERSEDED`, prompting the investor to re-verify the new figures without deleting past historical action logs.
4. **Tenant Isolation & Security**:
   - Strict anti-enumeration: queries or action posts referencing other taxpayers return `404 Not Found`.

## Decision Details

### 1. Unified Obligation Key

Each obligation has a deterministic key:

```
${taxSubjectId}:${period}:${kind}:${sourceRef}
```

Example: `00000000-0000-0000-0000-000000000001:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`

### 2. Timeline Sorting Order

Timeline items are deterministically sorted by:

1. `dueDate` ASC (`null` values placed at year-end baseline or after dated entries).
2. `severityWeight` DESC (`BLOCKING` > `WARNING` > `ACTION` > `INFO`).
3. `obligationKey` ASC (lexicographical).

### 3. State Transitions & Supersession

- Initial state: Derived directly from engine outputs (`OPEN`, `ACTION_REQUIRED`, `AWAITING_EVIDENCE`, `READY`).
- Persistence model: `REVISIONED_APPEND_ONLY` recorded in table `tax_compliance_actions`. Every state mutation (completion, dismissal, reopen) inserts a new monotonic revision record without mutating or deleting prior rows.
- Concurrency control: Handled deterministically at database level by unique constraint on `(tax_subject_id, obligation_key, revision)`.
- Replay: During timeline generation, if a user action exists with a matching `sourceFingerprint`, the state transitions to `COMPLETED` or `DISMISSED`. If the fingerprint differs, the obligation is flagged `SUPERSEDED` or re-evaluated to `ACTION_REQUIRED`.

### 4. Pure Projection & Reconciliation Boundary

- `compliance-timeline-engine.ts` is strictly a deterministic projection and reconciliation engine (`PURE_PROJECTION_AND_RECONCILIATION`).
- It contains zero tax formulas, zero rate tables, zero deadline recomputations, zero floating-point arithmetic.
- All monetary amounts, due dates, thresholds, and module readiness statuses are consumed directly from upstream authoritative engines (Phase 4G `TaxObligation` and Phase 4J `UnifiedAnnualIrpfState`).

### 5. Multi-Platform Support (Web & Mobile)

- Unified presentation across Web (`apps/web`) and Mobile (`apps/mobile`) via shared UI tokens and contracts in `@atlas/ui`.
- Zero client-side fiscal calculations on either platform.

## Consequences

- **Positive**:
  - Investor has full clarity on all monthly and annual compliance steps in a single unified view across web and mobile.
  - Zero risk of fiscal drift or duplicate tax logic.
  - Comprehensive, immutable revisioned audit trail of investor compliance actions.
- **Negative / Constraints**:
  - Requires maintaining backward-compatible projection logic across 4G, 4H, 4I, 4J engines.
