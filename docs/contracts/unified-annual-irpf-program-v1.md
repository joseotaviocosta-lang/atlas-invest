# Unified Annual IRPF Program Contract (v1)

## 1. Overview & Program Scope

This contract defines the architectural invariants, orchestration boundaries, stale-state model, and verification policies for the **Unified Annual IRPF Program** (Phase 4J) within Project Atlas.

The unified annual program is a **pure deterministic projection, aggregation, and review layer** operating above the authoritative fiscal engines (`@atlas/tax-engine` Phase 4H and Phase 4I). It produces consolidated annual readiness assessments, actionable taxpayer guidance, and human/machine-readable filing-support packages.

### Program Boundaries & Non-Goals

1. **NO Tax Recomputation:** The unified annual program NEVER recomputes or alters capital gains, exemptions, withholdings, DARF liabilities, or high-income minimum tax brackets. All fiscal arithmetic is owned exclusively by 4H (Annual IRPF Reporting & Capital Markets) and 4I (High-Income Minimum Tax Engine).
2. **NO Persisted Derived Source of Truth:** Annual states and review packages are ephemeral, recalculated on demand from authoritative ledger and evidence states. No database table acts as a source of truth for computed annual totals.
3. **NO Official Receita Artifact / Transmission:** The generated JSON and CSV exports are strictly **filing-support reference documents** (relatórios de apoio). The system does not transmit declarations to RFB, authenticate with e-CAC/Gov.br, or generate proprietary `.rec`/`.dec` binaries.
4. **NO DARF or Payment Execution:** Annual filing review does not execute payments or generate collection documents.
5. **NO Tax AI:** All rules, classifications, and consistency checks are deterministic algorithms.

---

## 2. Program Authority Hierarchy

```
   ┌─────────────────────────────────────────────────────────────┐
   │                  Authoritative Engines                      │
   │  • Phase 4H: Annual Capital Markets & Investment Income    │
   │  • Phase 4I: Annual High-Income Global Minimum Tax (2026+)  │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             4J.1: Unified Annual Orchestration              │
   │  • Single authoritative consolidated annual state           │
   │  • 5 canonical modules evaluation                           │
   │  • Global status & consistency engine                       │
   │  • Snapshot fence & annualFingerprint generation            │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             4J.2: Unified Annual Review Package             │
   │  • Single authoritative review package projection           │
   │  • Official filing-support legal mappings                   │
   │  • Package fingerprinting (packageFingerprint)              │
   │  • Sanitized JSON & human-readable CSV export serialization │
   └─────────────────────────────────────────────────────────────┘
```

1. **Phase 4J.1 Authority:** Owns the consolidated `UnifiedAnnualState`, combining the 5 canonical modules:
   - `BENS_E_DIREITOS` (Assets & Rights balance)
   - `RENDIMENTOS_ISENTOS` (Exempt & Non-Taxable Income)
   - `RENDIMENTOS_EXCLUSIVOS` (Exclusive/Definitive Taxation Income)
   - `RENDA_VARIAVEL` (Variable Income / Monthly Operations)
   - `ALTA_RENDA_MINIMO_GLOBAL` (High-Income Global Minimum Tax)
2. **Phase 4J.2 Authority:** Owns the projection of `UnifiedAnnualState` into the client-facing `UnifiedAnnualReviewPackage`, filing-support section mappings, and export formats (`application/json`, `text/csv`).

---

## 3. Fingerprint Provenance Chain

The freshness and integrity of the annual program are guaranteed through a hierarchical cryptographic SHA-256 fingerprint chain:

```
[Underlying Ledger & Evidence Source Facts]
       │
       ▼
[4H Module Fingerprint & 4I Review Fingerprint]
       │
       ▼
[4J.1 `annualFingerprint`]  <── (Includes module states, requirements, consistency issues; excludes generatedAt)
       │
       ▼
[4J.2 `packageFingerprint`] <── (Includes annualFingerprint, packageVersion, section mappings; excludes generatedAt)
```

### Invariants of the Fingerprint Chain:

1. **Provenance Equivalence:** Every review package guarantees `package.provenance.annualFingerprint === annualState.annualFingerprint`.
2. **Exclusion of `generatedAt`:** Timestamps representing calculation execution time are strictly excluded from both `annualFingerprint` and `packageFingerprint`.
3. **Order Invariance:** Permutations in the order of input modules, requirements, consistency issues, or payer records produce mathematically identical fingerprints.
4. **Version Sensitivity:** A change in `packageVersion` or rule versions immediately alters `packageFingerprint`.

---

## 4. Stale-State Detection & Freshness Model

Staleness is evaluated deterministically without database export history:

```typescript
function isPackageCurrent(
  exportedPackageFingerprint: string,
  currentPackageFingerprint: string,
): boolean {
  return exportedPackageFingerprint === currentPackageFingerprint;
}
```

1. **Source Fact Modification:** Any modification to underlying transactions, custody balances, or corporate actions changes upstream fingerprints, causing `annualFingerprint` and `packageFingerprint` to change.
2. **Evidence Modification:** Any update or revision to high-income evidence or taxpayer confirmations alters upstream state and changes the package fingerprint.
3. **Requirement State Change:** When taxpayer actions resolve pending requirements, the updated state produces a fresh fingerprint.
4. **Export Freshness Invariant:** Every export request (`GET /api/v1/tax/annual/:year/review-package/export`) executes against the current authoritative state, ensuring that exported packages are never stale at the moment of generation.
5. **Historical Integrity:** A previously downloaded export document remains historically valid for the exact state and fingerprint it captures; staleness reflects that the live system state has advanced.

---

## 5. Global Status & Consistency Semantics

### Status Precedence & Invariants:

1. **No Optimism Rule:** The review package status can NEVER be more optimistic than the underlying 4J.1 unified annual status (`package.status === annualState.overallStatus`).
2. **`READY_FOR_REVIEW` Prerequisites:** The global status can be `READY_FOR_REVIEW` if and only if:
   - No `BLOCKING` consistency issues exist;
   - No unresolved mandatory evidence requirements exist;
   - No material upstream modules are in `UNSUPPORTED` or `FAILED` state;
   - All material modules are `READY`.
3. **`NO_ACTIVITY` Distinctness:** A tax year with zero taxable facts or positions evaluates to `NO_ACTIVITY`, which is semantically distinct from `READY_FOR_REVIEW`.
4. **Non-Material Modules:** A `NOT_APPLICABLE` or pre-effective module (such as high-income rules for tax years prior to 2026) does not block overall annual readiness.

### Null vs. Zero Semantics:

Across all layers (API, Package, JSON export, CSV, UI):

- `0` (or `"0.00"`): Explicit economic zero value.
- `null`: Honest absence of data or non-applicable field.
- `"UNAVAILABLE"` / `"UNKNOWN"`: Value cannot be authoritatively determined due to missing upstream evidence.

---

## 6. Security, Isolation & HTTP Cache Policy

1. **Principal Isolation:** The authenticated user principal (from JWT access token) strictly governs access. Client-supplied `userId`, `taxSubjectId`, or portfolio identifiers in request bodies or query params are ignored or rejected.
2. **Anti-Enumeration:** Requests targeting resources of other users return `404 Not Found` (never revealing existence via `403`).
3. **Cache-Control Header:** All fiscal, annual, review, and export endpoints enforce `Cache-Control: private, no-store` across all response codes (`200`, `400`, `401`, `404`, `422`, `500`).
4. **Zero Shared Cross-User Cache:** No shared memory cache exists across principals.
5. **CSV Formula Injection Defense:** All string values in CSV exports starting with `= | + | - | @ | \t | \r` are safely sanitized/escaped with a leading single quote (`'`).
6. **Export Sanitization:** Exported files contain zero internal database IDs (UUIDs), tokens, password hashes, connection strings, or server paths.
7. **XSS & Header Injection:** Filenames and header values strictly sanitize CR/LF and special characters.

---

## 7. Canonical Persistence & Migration Governance

- **Database Engine:** PostgreSQL 16.x (`CANONICAL_PG16`) is the sole canonical persistence engine for Project Atlas.
- **Migration History:** 18 canonical sequential migrations tracked in `prisma/migrations`.
- **Zero Push Rule:** `prisma db push` is strictly prohibited in production and CI; all schema management occurs via `prisma migrate deploy`.
