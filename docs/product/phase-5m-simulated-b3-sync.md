# Phase 5M — Simulated B3 Sync (End-to-End Product Pipeline)

Status: implemented. No live B3 connection, no secrets, no network, no
migrations (count stays 31).

Related: `docs/product/phase-5l-b3-product-integration-foundation.md` (the
contracts this phase drives) and `docs/product/phase-5k-portfolio-import-hub.md`
(the canonical pipeline reused verbatim).

## Flow (as built)

```text
SimulatedB3Provider (in-memory, deterministic)
        ↓  B3SyncSourceProvider contract (capabilities from 5L)
Authorization gate (SyncState machine is authoritative)
        ↓  AUTHORIZED / SYNCED / PARTIAL only; else fail-closed
getMovements + getProvisionedEvents
        ↓  raw B3MovementRecord (fictitious)
normalizeB3Movement (canonical 5K pipeline: same dates, decimals, mapping)
        ↓
resolveAsset / resolveAccount (AssetId identity, never ticker)
        ↓
classifyOne (source identity + canonical SHA-256 fingerprint)
        ↓  NEW vs EXACT_DUPLICATE vs PROBABLE_DUPLICATE vs CONFLICT
SimulatedB3SyncResult (pure read model: preview, ZERO writes)
        ↓  human / caller decision
confirm via CreateTransactionUseCase.executeMany (single canonical writer)
        ↓
append-only ledger (source B3, provider, externalId, transferGroupId)
        ↓
read models (GET /state positions · valuation · tax · performance consumers)
        ↓
reconcilePositions (ledger-derived vs source snapshot; never rewrites history)
```

Second sync: same historical records + new records → old rows classify
`EXACT_DUPLICATE` (zero writes), only new rows become import candidates.
A third identical run writes zero events.

## What is simulated

- `SimulatedB3Provider` (`packages/import-engine/src/b3-simulated.ts`):
  fixed snapshots (`SNAPSHOT_1`, `SNAPSHOT_2`), in-process only.
- Authorization outcomes: `AUTHORIZED`, `REVOKED`, `REQUIRES_REAUTHORIZATION`
  (via the 5L state machine, no tokens exchanged).
- Provider outage (`UNAVAILABLE`) and truncated pages (`PARTIAL_MOVEMENTS`)
  as typed, explicit outcomes — never real sockets or timeouts.
- Two synthetic custody accounts (`CONTA SINTETICA 5M-A/B`) and a mirrored
  `TRANSFERENCIA` pair sharing `B3-5M-TRF-001`.
- All tickers are public market symbols; all amounts, accounts, custodians
  and identifiers are fictitious.

## What is production-real

- `normalizeB3Movement`, `resolve*`, `classifyOne`, `reconcilePositions`,
  `transitionSyncState` — the exact functions the future HTTP client will call.
- `ConfirmPortfolioImportUseCase` decision loop and `buildCommand`
  (now forwards `transferGroupId` and records `source: 'B3'` for B3 rows).
- `CreateTransactionUseCase.executeMany` — the single ledger writer, with
  per-portfolio mutex and unique-constraint idempotent recovery.
- The append-only `Transaction` ledger and the frozen Portfolio read API
  (`GET /state`), verified end-to-end against Postgres (`atlas_test`).
- Deduplication: source identity `B3|<movementId>` plus canonical
  fingerprint, NUMERIC-aware (`30.00` ≡ `30`), cross-source (CSV ↔ B3).

## Transfer wiring (5L pendency resolved)

- `TRANSFERENCIA_SAIDA/ENTRADA` now normalize to first-class
  `TRANSFER_OUT`/`TRANSFER_IN` candidates (quantity only; priced or fee'd
  "transfers" go to `NEEDS_REVIEW`, never auto-converted).
- `pairKey` → `transferGroupId` survives raw → normalized → classified →
  confirm → persisted `Transaction` on both legs; legs never become `BUY`/`SELL`
  and emit no `RealizedDisposal` (domain/portfolio-engine invariant, unchanged).
- One 5L test assertion updated to the specified behavior (legs are now
  importable custody moves, still never trades); the pair-key invariant it
  guarded is preserved and extended.

## Income wiring (5L pendency, scoped)

- B3 `amount` values (`DIVIDENDO`, `JCP`) are now carried on the candidate
  as exact decimal strings (`87,30` → `87.30`) and preserved at the domain
  level (`TransactionFactory.createIncome`).
- Ledger writes for income stay deferred: income rows classify `UNSUPPORTED`
  and are never importable as trades. Amount carriage is the 5M wiring step;
  income write-scope belongs to a future income-scope phase. No quantity or
  price is ever invented; mismatch fails closed (`INVALID_AMOUNT`).

## Sync result model (future UI fuel, pure read model, no persistence)

`SimulatedB3SyncResult`: `recordsFetched`, `movementRecords`,
`provisionedRecords`, `normalized`, `newCandidates`, `exactDuplicates`,
`probableDuplicates`, `conflicts`, `unsupported`, `invalid`, `summary`,
`reconciliation { entries, summary, status }`, `unresolvedSnapshotTickers`,
`sourceAsOf`, `lastSuccessfulSyncAt` (echoed input, set by the caller after
confirm), `partial`, `recommendedEvent` (`SYNC_SUCCEEDED` | `SYNC_PARTIAL`).

## Failure semantics

| Condition                                                       | Outcome                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `REVOKED`, `REQUIRES_REAUTHORIZATION`, `NOT_CONNECTED`, `ERROR` | `B3_SIMULATED.SYNC_BLOCKED`, zero candidates                     |
| Source reports non-syncable status                              | `B3_SIMULATED.SYNC_BLOCKED` (`SOURCE_NOT_AUTHORIZED`)            |
| Provider outage                                                 | `SimulatedB3ProviderError` (`B3_SIMULATED.PROVIDER_UNAVAILABLE`) |
| Partial page                                                    | `partial: true`, `SYNC_PARTIAL`, reconciliation `INCOMPLETE`     |
| Unknown movement nature                                         | `INVALID` + `UNKNOWN_OPERATION`, excluded from confirm           |
| Divergence ledger vs snapshot                                   | `DIVERGENT` + signed `delta`; never auto-corrected               |

## Security boundary (structural)

- `b3-simulated.ts` imports only relative engine modules; CI-asserted scans
  (in-suite) forbid `fetch`/`axios`/`undici`, URLs, `process.env`, API keys,
  certificates and private keys in the simulated source.
- No new endpoint: nothing public is called `connect-b3`. B3 rows are
  confirmable only through the existing import confirm path / `executeMany`.
- No PII/secrets in fixtures or provider (scanned: no CPF, CNPJ, tokens).
- Provenance on every event: `source`, `provider`, `externalId`, fingerprint.

## What remains future (not in 5M)

- B3 HTTP transport, OAuth2 + investor consent, mTLS, certificates, B2B
  credentials in a secret manager, consent callback, certification (5O),
  homologation (5P), production monitoring.
- Multi-instance advisory locking (the confirm mutex stays single-instance;
  deployment requirement before multi-instance production).
- Income ledger write-scope, import history persistence, undo UI.
- Connection UX (5N) — no user-facing "Conectar à B3" in this phase; one
  honest display-label fix only (transfers no longer render as "Venda").

## Verification

- `pnpm test:import-engine` — 73 passed (21 new 5M pure-pipeline tests).
- `pnpm vitest run --config vitest.api.config.ts
tests/api/b3-simulated-sync.test.ts tests/api/b3-confirm-wiring.test.ts`
  — 6 passed (real writer + real `/state` + real confirm use-case).
- `tests/api/portfolio-import*.test.ts` — 14 passed (CSV path unbroken).
- `pnpm test:architecture` — 229 passed.
- `tests/web/portfolio-import*.test.ts` — 16 passed.
- `typecheck` for `@atlas/import-engine`, `@atlas/api`, `@atlas/web` — clean.
- `eslint` on all touched files — clean; `prettier --write` applied.
- Migrations: 31 + lockfile, unchanged (zero new migrations).
