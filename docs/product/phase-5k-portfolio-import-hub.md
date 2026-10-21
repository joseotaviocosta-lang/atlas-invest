# Phase 5K — Portfolio Import Hub & Canonical Reconciliation

Investor-facing bulk import of historical activity into the immutable
transaction ledger. File-based in 5K (`GENERIC_CSV`); broker/B3 live APIs
remain architecturally ready but NOT connected.

## Invariant

```
EXTERNAL DATA
→ IMPORT ADAPTER (CSV template)
→ NORMALIZATION (@atlas/import-engine, pure)
→ PREVIEW / VALIDATION (server, no writes)
→ DUPLICATE DETECTION (source identity + canonical fingerprint)
→ USER CONFIRMATION (explicit, per-row decisions)
→ CANONICAL TRANSACTIONS (CreateTransactionUseCase.executeMany)
→ IMMUTABLE LEDGER (append-only)
→ PORTFOLIO ENGINE / TAX / PERFORMANCE (unchanged consumers)
```

The importer is NOT a second portfolio engine: it never computes positions,
costs, gains or taxes. It only reads external data, normalizes it,
reconciles it and writes canonical transactions through the existing ledger
path.

## Packages

- `@atlas/import-engine@0.1.0` — pure, zero I/O. Depends only on
  `@atlas/domain`. Owns: RFC-4180 CSV parsing (string cells only),
  canonical template mapping (PT/EN headers), normalization (civil dates,
  decimal strings, operation synonyms), deterministic SHA-256 fingerprints,
  ticker/account resolution helpers, duplicate classification, summary.
  All outputs are deeply frozen.
- API layer (`apps/api/src/application/imports/`) — orchestration only:
  ownership checks, repo lookups (assets list, portfolio accounts, ledger
  window), engine calls, `executeMany` writes, receipts.
- Web (`apps/web/src/app/(app)/portfolio/import`) — Import Hub UI.
  Zero financial math; formats server strings via `@atlas/ui`.

## Canonical template

Columns: `data; ticker; operacao; quantidade; preco_unitario; taxas; moeda;
corretora; conta; external_id` (+ optional `settlement_date`, `notes`).
Header aliases accept PT/EN spellings. Operations: `COMPRA/C/BUY/B` →
`BUY`, `VENDA/V/SELL/S` → `SELL`. Other known operations (dividends, JCP,
splits, deposits…) parse as `UNSUPPORTED` and are never written in 5K.

Decimals accept BR (`1.234,56`) and ISO (`1234.56`) spellings and stay
strings end-to-end. Dates accept `DD/MM/AAAA` and `AAAA-MM-DD`, validated
as real civil dates. Currency defaults to `BRL`.

## Dedupe (two layers, no silent merges)

1. **Source identity**: `provider|externalId`, backed by the DB unique
   constraint `(portfolioId, provider, externalId)`.
2. **Canonical fingerprint**: SHA-256 over normalized
   `portfolio|account|asset|type|tradeDate|quantity|unitPrice|fees|currency`
   with `NUMERIC`-aware decimal comparison (trailing zeros ignored, so
   `38.50` matches persisted `38.5`). A price-insensitive variant flags
   probable duplicates for human review.

Outcomes: `NEW`, `EXACT_DUPLICATE` (auto-excluded), `PROBABLE_DUPLICATE`
(shown, importable only with explicit action), `CONFLICT` (same external
id, different values — requires resolution, never force-written).

Idempotency: re-confirming the same file creates zero transactions and
reports all rows as skipped duplicates. Cross-import dedupe works across
sources because the canonical fingerprint is source-agnostic.

## Provenance

Every imported transaction carries `source: 'CSV'`, `provider` (broker
label, uppercased) and `externalId` when present, plus a note
`Importado de <arquivo> (linha <n>)`. Nothing is rewritten afterwards.

## API

- `POST /api/v1/portfolios/:id/imports/preview` → `{ data: { candidates, summary, provider, fileName } }`. No writes.
- `POST /api/v1/portfolios/:id/imports/confirm` → `{ data: receipt }`
  with `created`, `skippedDuplicates`, `skippedByUser`, `failed[]`,
  `transactionIds`. Ownership via principal (404 anti-enumeration),
  `IMPORT.INVALID_INPUT` → 400, cross-portfolio → 409.

No import tables were added (migration count stays 31, stateless
preview/confirm). Import history is deferred to 5K.1.

## Security

Portfolio ownership enforced on every call; per-row account overrides are
re-validated against the portfolio; unknown assets never auto-create;
CSV cells are data-only (no formula evaluation, no macros — XLSX not
accepted in 5K); 2 MB / 2000-row limits; no filesystem persistence of
uploads.

## Deferred (explicitly NOT in 5K)

`GENERIC_XLSX`, `B3_EXPORTED_FILE`, `B3_API`, broker APIs (`XP`, `RICO`,
`CLEAR`, `BTG`, `INTER`), background sync, OAuth broker connections,
scheduler integration, import history persistence, undo/ reversal UI
(ledger stays append-only; use existing rectification semantics).

## B3 future compatibility (Phase 5L sketch)

The B3 investor-data integration should reuse this exact pipeline:
`B3 API → B3 Adapter → NormalizedCandidate → Reconciliation → Ledger`.
Required datasets: positions, movements (negotiations/trades). B3 records
map to candidates with `provider: 'B3'` and B3 movement IDs as
`externalId`; the canonical fingerprint then dedupes B3 rows against
earlier CSV imports of the same trades automatically. Consent, licensing
and commercial terms with B3 are out of scope for engineering phases.
