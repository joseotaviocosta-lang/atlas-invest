# ADR-286: Tax Payment Support & Settlement Evidence Foundation

## Status

Accepted (Phase 4K.2)

## Context

Following **Phase 4K.1 (Unified Tax Compliance Obligation Timeline & Operational State)**, investors have unified visibility into their monthly and annual tax obligations. However, investors require practical assistance in preparing for and executing the payment of DARF obligations outside of Atlas, as well as maintaining a structured, immutable record of payments made.

Atlas explicitly does not operate as a financial institution, payment initiation service provider (ITP), or tax filing agent. It is critical that Atlas maintains absolute boundaries:

1. Atlas does not initiate or execute payments (no bank integration, PIX, or boleto generation).
2. Atlas does not integrate with Receita Federal Sicalc or e-CAC to verify or claim official settlement.
3. All user-recorded payment claims are designated as `USER_REPORTED` and subject to prominent disclaimers.
4. If upstream ledger changes alter the underlying obligation amount or fingerprint, previously recorded evidence must be transparently reconciled and flagged as `SUPERSEDED` rather than silently accepted or discarded.

## Decision Drivers

1. **Downstream Pure Projection**:
   - `deriveTaxPaymentSupport()` is a pure projection over authoritative outputs from Phase 4G and Phase 4K.1.
   - It performs zero tax recomputations, rate evaluations, penalty calculations, or deadline modifications.
2. **Strict Append-Only Revisioned Audit Trail**:
   - External payment evidence records are stored in `tax_settlement_records`.
   - Modifying or adding payment evidence always inserts a new revision (`revision = max + 1`) under composite unique constraint `(tax_subject_id, obligation_key, revision)`.
   - Prior revisions are immutable and never updated or deleted in place.
3. **Deterministic Reconciliation Matrix**:
   - Reconciliation status is strictly evaluated against current authoritative obligation:
     - `NONE`: No evidence recorded.
     - `MATCHED`: Sum of paid amounts equals `totalPayable`.
     - `OVERPAID`: Sum of paid amounts exceeds `totalPayable`.
     - `UNDERPAID`: Sum of paid amounts is less than `totalPayable`.
     - `SUPERSEDED`: Source fingerprint of recorded evidence differs from current obligation's cryptographic fingerprint.
4. **Zero Float Financial Arithmetic**:
   - All amounts use string-serialized arbitrary precision decimal types (`Money` / `NUMERIC(38, 18)`).
5. **Security & Anti-Enumeration**:
   - All tenant resources enforce strict anti-enumeration (`404 Not Found` if resource does not belong to authenticated user).
   - Export endpoints enforce OWASP CSV injection escaping for all formula triggers (`=`, `+`, `-`, `@`) and send `Cache-Control: no-store`.

## Decision Details

### 1. Data Model (`tax_settlement_records`)

Added via Migration 20 (`20261011000000_add_tax_settlement_records`) and refined in Phase 4K.2B via Migration 21 (`20261011120000_add_tax_settlement_evidence_fingerprint`):

- `id` (UUID PRIMARY KEY)
- `tax_subject_id` (UUID NOT NULL, REFERENCES users)
- `obligation_key` (VARCHAR NOT NULL)
- `revision` (INTEGER NOT NULL)
- `source_fingerprint` (VARCHAR NOT NULL)
- `evidence_fingerprint` (VARCHAR(64) NOT NULL)
- `payment_date` (DATE NOT NULL)
- `amount_reported` (NUMERIC(38, 18) NOT NULL)
- `revenue_code_reported` (VARCHAR NULL)
- `reference_period` (VARCHAR NOT NULL)
- `external_reference` (VARCHAR NULL)
- `note` (TEXT NULL)
- `verification_status` (VARCHAR NOT NULL DEFAULT 'USER_REPORTED')
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

Constraints and Indexes:

- Revision unique constraint: `@@unique([taxSubjectId, obligationKey, revision], name: "tax_settlement_record_rev_uniq")`
- Semantic identity unique constraint (Phase 4K.2B): `@@unique([taxSubjectId, obligationKey, sourceFingerprint, evidenceFingerprint], name: "tax_settlement_record_semantic_identity", map: "tax_settlement_record_semantic_uniq")`
- Revision ordering index: `@@index([taxSubjectId, obligationKey, revision(sort: Desc)], map: "tax_settlement_record_lookup_idx")`

### 1.1 Semantic Idempotency & Dedup Invariant (Phase 4K.2B)

When a client submits payment evidence identical to an existing record for the same tax subject, obligation key, and source fingerprint:

- `computeTaxSettlementEvidenceFingerprint` produces a deterministic SHA-256 hash using normalized civil date and decimal strings.
- The repository checks the semantic unique constraint and intercepts PostgreSQL `P2002` uniqueness conflicts, returning the existing record with `{ outcome: 'IDEMPOTENT' }`.
- Revisions are monotonic: identical concurrent submissions return revision 1 without revision drift or duplicate rows. Distinct evidence submissions monotonically increment `revision = max + 1`.

### 1.2 Fiscal Authority Boundary (Phase 4K.2B)

- The payment support engine strictly isolates from tax computation rules. It contains **zero** local minimum-DARF (`< 10.00`) logic.
- Obligation payable status and accumulation rules belong exclusively to upstream engines (`TaxObligation` / `@atlas/tax-engine`).
- Payment support strictly checks `obligation.amount > 0` to decide `READY` status.

### 2. Reconciliation Engine

Implemented in `@atlas/tax-engine/compliance/payment-support-engine.ts`:

- Consumes authoritative obligation data from `TaxObligation`.
- Summarizes historical evidence records.
- Flags discrepancy or supersession.
- Emits structured guidance for manual DARF payment outside Atlas.

### 3. API & Export Layer

- Endpoints under `/api/v1/fiscal/compliance/:obligationKey/payment-support` and `/payment-evidence`.
- CSV and JSON export endpoints for accounting and audit packages.

## Consequences

- **Positive**:
  - Investor can safely manage and document external DARF payments with zero ambiguity about official verification status.
  - Complete, auditable, immutable history of payment claims.
  - Clear alerts when fiscal recomputation invalidates previously recorded payment figures.
- **Constraints**:
  - Atlas explicitly disclaims official confirmation from Receita Federal.
