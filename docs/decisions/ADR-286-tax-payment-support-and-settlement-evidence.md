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

Added via Migration 20 (`20261011000000_add_tax_settlement_records`):

- `id` (UUID PRIMARY KEY)
- `tax_subject_id` (UUID NOT NULL, REFERENCES users)
- `obligation_key` (VARCHAR NOT NULL)
- `revision` (INTEGER NOT NULL)
- `paid_amount` (NUMERIC(38, 18) NOT NULL)
- `paid_at_date` (DATE NOT NULL)
- `payment_method` (VARCHAR NOT NULL)
- `bank_or_channel` (VARCHAR NULL)
- `auth_code_or_protocol` (VARCHAR NULL)
- `document_ref` (VARCHAR NULL)
- `notes` (TEXT NULL)
- `verification_status` (VARCHAR NOT NULL DEFAULT 'USER_REPORTED')
- `source_fingerprint` (VARCHAR NOT NULL)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

Unique constraint: `(tax_subject_id, obligation_key, revision)`
Index: `(tax_subject_id, obligation_key, revision DESC)`

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
