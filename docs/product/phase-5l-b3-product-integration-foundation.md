# Phase 5L — B3 Product Integration Foundation

Product-oriented architectural foundation for a future official B3 B2B
integration. **No live B3 connection exists.** No credentials, endpoints,
certificates, tokens or scraping in this phase — by design, not by omission.

Related: `docs/product/phase-5k-portfolio-import-hub.md` (the import
pipeline this foundation plugs into).

## Current architecture (5K, as built)

```text
GENERIC_CSV text
  → parseCsv (RFC-4180, string cells, BOM/CRLF/quotes)
  → mapHeaders (PT/EN aliases, strict required columns)
  → normalizeRow (civil dates, decimal strings, operation synonyms)
  → resolveAsset / resolveAccount (AssetId identity, never ticker)
  → classifyOne (source identity + canonical SHA-256 fingerprint)
  → preview (stateless, zero writes)
  → user decisions (skip / override / force probable)
  → confirm via CreateTransactionUseCase.executeMany (single-porfolio
    batch, per-portfolio mutex, unique-constraint recovery)
  → immutable ledger (source, provider, externalId, notes)
  → Portfolio Engine replay / tax / performance (unchanged consumers)
```

Key properties reused by 5L without modification: exact decimal strings
end-to-end, `NUMERIC`-aware canonical comparison, append-only ledger with
`(portfolioId, provider, externalId)` uniqueness, provenance on every event,
`TRANSFER_IN`/`TRANSFER_OUT` legs with `transferGroupId` that never emit
`RealizedDisposal`.

## Target architecture (5L → 5Q)

```text
Sources (B3 API · CSV/broker export · manual entry · future connectors)
  ↓
Adapters (source parsing only — this phase adds the B3 contract)
  ↓
Canonical events (domain Transaction: 16 frozen types + source /
  provider / externalId / transferGroupId provenance)
  ↓
Reconciliation (ledger history vs source snapshots; NEW in 5L, pure)
  ↓
Ledger (append-only, single writer: executeMany)
  ↓
Read models (positions · valuation · tax · reporting)
```

Business rules never depend on B3 payload shape: the adapter translates,
the domain validates, the ledger records.

## Canonical model decision

No new ledger event type is introduced. The domain `Transaction` union is
the canonical investment event: it already carries every 5L-required field
(source, externalSourceId→`externalId`, provider, account, portfolio,
`AssetId`, trade/settlement dates, quantity, unit price, fees/taxes,
currency, notes, `transferGroupId`). `RECONCILIATION` metadata lives on the
reconciliation output, never on the ledger. Position snapshots use the new
`SourceSnapshotRow` (assetId + quantity + `asOf`) — explicitly not a
transaction.

`INTEREST` / `CORPORATE_ACTION` / `CUSTODY_ADJUSTMENT` / `OTHER` are not
ledger types: interest-like B3 natures map to the existing income family
(`DIVIDEND`/`JCP`/`FII_INCOME`); corporate-action natures map to the
existing `SPLIT`/`REVERSE_SPLIT`/`BONUS`/`AMORTIZATION` family or
`UNSUPPORTED`; custody moves map to mirrored `TRANSFER_*` legs.
Unmapped natures fail closed to `UNSUPPORTED`/`INVALID` — never invented.

## B3 mapping (contract, pinned at 5O certification)

| B3 capability        | Atlas canonical concept                                      | 5L status            |
| -------------------- | ------------------------------------------------------------ | -------------------- |
| POSITIONS            | `SourceSnapshotRow[]` → `reconcilePositions` vs replay state | contract + pure impl |
| MOVEMENTS            | `B3MovementRecord` → `normalizeB3Movement` → candidate       | contract + pure impl |
| TRADES               | `B3MovementRecord` (COMPRA/VENDA) → BUY/SELL                 | contract + pure impl |
| PROVISIONED_EVENTS   | `B3MovementRecord` (DIVIDENDO/JCP/…) → deferred income       | contract + pure impl |
| AUTHORIZATION_STATUS | `SyncState` machine                                          | types + transitions  |
| GUIDE                | capability list + mapping table (this doc)                   | documented           |
| LAST_AVAILABLE_DATA  | `asOf` on snapshots; D-1 documented expectation              | documented           |

B3 movement natures are provisional labels; the definitive codification is
pinned against the B3 API Guia during certification. Nothing here performs
HTTP.

## Source abstraction

`@atlas/import-engine` is the source-agnostic boundary: `normalizeRow`,
`resolve*`, `classifyOne`, `reconcilePositions`, `transitionSyncState` are
pure and source-unaware. Adapters (`csv.ts` parser, `b3.ts` mapping) convert
source shapes into the pipeline. Portfolio mutation happens only in
`CreateTransactionUseCase.executeMany`. Per AGENTS.md, engines stay UI-free
and the domain stays I/O-free.

## Idempotency

Two layers, both deterministic and tested:

1. source identity `provider|externalId` (DB unique backstop);
2. canonical SHA-256 fingerprint over normalized fields, NUMERIC-aware
   (`38.50` ≡ `38.5`), source-agnostic — so a CSV import and a later B3 sync
   of the same trade collide instead of duplicating.
   `sync #1 → created; sync #2 → 0 writes` is covered for same-source repeats
   and CSV↔B3 cross-source pairs.

## Reconciliation

`reconcilePositions(ledger, snapshot)` returns per-asset
`MATCHED | DIVERGENT (±delta) | MISSING_LOCAL | MISSING_SOURCE |
UNRESOLVED`, with counts. A D-1 snapshot never rewrites history; divergence
is reported, never auto-corrected. Correction, when needed, flows through
canonical ledger events.

## B3 × CSV duplication policy

Same canonical trade from both sources → `EXACT_DUPLICATE` (auto-excluded,
auditable). Near matches → `PROBABLE_DUPLICATE` for human review, never
auto-merged. Same external id with different values → `CONFLICT`, must be
resolved explicitly. No destructive heuristics.

## Provenance

Every candidate preserves `source` (`CSV` today, `B3` tomorrow), `provider`
(uppercased source label), `externalId` (movement id), `pairKey` →
`transferGroupId` for custody pairs, and import notes. Reconciliation entries
reference `asOf` snapshots, never raw credentials.

## Security boundary

Implemented now: ownership isolation (404 anti-enumeration), no secret
handling of any kind, no filesystem persistence of uploads, formula-safe
text cells, fail-closed unknown payloads, synthetic-only fixtures.

Future (certification/production, NOT in 5L): OAuth2 + investor consent
tracking, mTLS client certificates, B2B client credentials in a secret
manager (never in repo/env files), encrypted secret storage, authorization
revocation handling, least-privilege scopes, log redaction rules (no CPF,
token, certificate, account number), audit trail of syncs, environment
separation (certification vs production B3), B3 homologation process.

## Product rollout (candidates — not started)

- **5L — foundation** (this phase: contracts, fixtures, tests, docs)
- **5M — simulated B3 sync** (in-memory/mock provider driving the real
  pipeline + confirm wiring for `transferGroupId`)
- **5N — connection UX** (connect/authorize/preview/reconcile screens)
- **5O — certification-ready HTTP client** (OAuth/mTLS, pinned mapping)
- **5P — real B3 certification** (homologation environment)
- **5Q — production rollout** (licensed B2B credentials, monitoring)

## Deferred (explicitly not in 5L)

Live B3 calls, broker APIs, schedulers, confirm-path `transferGroupId`
wiring (5M), income `amount` candidate wiring (with income scope), import
history persistence, undo UI, any migration (count stays 31).
