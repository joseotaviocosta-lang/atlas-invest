# Ticker Successor Mapping — Corporate Identity Without Ledger Events

Ticker is not permanent economic identity. When B3 renames a symbol 1:1, Atlas
follows the continuity through an explicit, audited mapping — never through
synthetic SELL/BUY, transfers, or position patches.

## 1. Identity semantics

- Identity key: `AssetId` (unchanged). The ledger, replay keys, position keys
  and history keep referencing the original asset row.
- Current symbol: resolved per date via the successor registry
  (`resolveCurrentTicker`). Unknown tickers pass through untouched.
- Historical symbol: events and snapshots keep their epoch ticker; nothing is
  rewritten.
- Successor representation: a frozen code registry
  (`packages/domain/src/entities/asset-successors.ts`), the single centralized
  source. No parallel arrays, no additions to `B3_REFERENCE_CATALOG`, no
  ticker-string parsing, no notes improvisation.

## 2. Mapping source (explicit, 1:1 only)

| predecessor | successor | relation      | ratio | effectiveDate | date source                |
| ----------- | --------- | ------------- | ----- | ------------- | -------------------------- |
| MALL11      | PMLL11    | TICKER_RENAME | 1     | 2025-11-14    | FIRST_OBSERVED_IN_B3_FILES |
| MRFG3       | MBRF3     | TICKER_RENAME | 1     | 2025-11-28    | FIRST_OBSERVED_IN_B3_FILES |

`effectiveDate` is a first-evidence lower bound from official B3 files
(2024 reports show predecessors; 2025 reports show successors), deliberately
conservative: before that date the predecessor symbol stays authoritative.
Only ratio `'1'` is supported; anything else fails closed. No chains,
self-maps, duplicates, or textual-similarity inference (all pinned by tests).

Evidence: 2024 annual report holds MRFG3 200 / MALL11 16; 2025 annual report
holds MBRF3 200 / PMLL11 16; movement file references PMLL11 from 14/11/2025
and MBRF3 from 28/11/2025; loan income still references legacy MRFG3.

## 3. Display behavior

- Current position surfaces (web `PositionRow`, mobile `PositionCard`) render
  the current symbol with an "anteriormente X" note, e.g. PMLL11
  (anteriormente MALL11). Routing, keys and quantities use the row's own
  ticker/assetId.
- Historical snapshots dated before effectiveness keep the epoch ticker.
- History/event feeds are untouched: each event keeps its epoch ticker.

## 4. Import behavior

- `resolveAsset` falls back through the successor map: MBRF3 resolves to the
  canonical MRFG3 asset row (flagged `viaSuccessor`), PMLL11 to MALL11. Exact
  ticker rows always win; unknown tickers stay NOT_FOUND; no asset rows are
  ever auto-created by the mapping.
- Successor resolution is NOT importability: the 12 MBRF3 movement rows stay
  subject to loan/shadow/review gates (proven UNSUPPORTED in preview).
- Reconciliation grouping: `canonicalReconciliationKey` folds both sides of a
  rename to one key (`ticker:MRFG3`); `reconcilePositions` itself is untouched.

## 5. Market data

- `resolveMarketDataSymbol` prefers the current symbol (MRFG3 row → `MBRF3.SA`
  on suffix providers). Identity stays `assetId`. Behavior changes only for
  mapped tickers; everything else resolves exactly as before.

## 6. Tax / cost behavior

- A rename realizes no gain, creates no disposal/acquisition, creates no DARF,
  resets no cost: there is deliberately NO ledger event. Cost basis status
  (including INCOMPLETE) and known totals pass through untouched. The tax
  engine observes economic continuity (same AssetId, same quantities) and was
  not modified.

## 7. Known mappings and reconciliation effect

- MALL11 16 (Atlas) vs PMLL11 16 (B3) → canonical MATCH.
- MRFG3 200 (Atlas) vs MBRF3 200 donor-loaned (B3) → canonical MATCH.
- Coverage 33/40 → 35/40. Raw Atlas positions stay 41 (no Atlas-side duplicates
  exist); canonical grouping merges only against the B3 side.

## 8. Persistence decision (STEP 4)

No migration (45 → 45). A DB-backed asset-relation table is a documented
non-goal for this phase; the frozen code registry is the auditable source until
a third mapping (or a non-1:1 case) forces the upgrade. If that happens, migrate
the registry content 1:1 — never reinterpret history.

## 9. Out of scope (unchanged)

ITSA4 +15.7, EGIE3 −200, VIVT3 +200, KCRE11 +80 representation, SNAG11
subscription pricing, SNEL13→SNEL11 conversion mechanics.
