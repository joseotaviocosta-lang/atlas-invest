# Phase 5S-C — Transaction Rectification (append-only)

## Existing ledger semantics

- Ledger is append-only: `Transaction` rows are created via canonical
  `TransactionFactory` validation; no update/delete path exists in the
  codebase (verified by grep: only `create`/`createMany`/`find*` on
  `ITransactionRepository`).
- All financial engines consume the **raw ledger** via
  `findByPortfolioId` (ordered by `tradeDate, createdAt, id`) and
  `replayPortfolio`: quantity, cost basis, realized P&L, valuation,
  income, performance, allocation, contribution tracking.
- Prior to 5S-C a rectify flow already existed (compensating reversal +
  optional replacement committed in one DB transaction, identified by
  `ATLAS_RECTIFY` external ids and `[COMPENSAÇÃO ref <id>]` /
  `[CORREÇÃO ref <id>]` notes). No link table, no reason requirement,
  no chain resolution, second attempts returned 400.
- No correction/reversal/supersession primitive existed on the
  `Transaction` model; tax `supersedes` concepts are unrelated.

## Raw vs effective ledger

- **RAW ledger**: every persisted `Transaction`, including originals,
  compensating reversals and replacements. Used for audit, history,
  reconciliation identity (run links and decisions keep pointing at
  the original).
- **EFFECTIVE ledger**: raw ledger **as replayed** — the compensating
  leg nets the original economically, the replacement carries the
  corrected effect. No filtering is needed: the replay already nets
  out (100 BUY − 100 SELL + 60 BUY = 60). 5S-C adds identity links so
  UI/navigation can resolve A→B→C to the terminal replacement
  without touching replay.
- Chain resolution: `resolveEffectiveTransactionId` (repository) and
  `resolveEffectiveTransactionId` (portfolio-strategy pure helper)
  follow original→replacement links to the terminal; cancelled
  terminals resolve to null; cycles return null (structurally
  impossible — replacements are always freshly created).

## Caller matrix

| Caller                                                                         | RAW or EFFECTIVE                                                                           | Why                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| portfolio state / valuation / allocation / performance / income / contribution | EFFECTIVE (replay nets)                                                                    | Corrected amounts must drive calculations; original is neutralized by compensation |
| tax/fiscal                                                                     | raw transactions + own heuristics (audited: no direct transaction-type dependency changed) | No new signals; tax engines unchanged                                              |
| reconciliation (run links, decisions)                                          | RAW identity                                                                               | Historical facts keep pointing at the original; never rewritten                    |
| review workspace linked rows                                                   | RAW + `rectified` display flag                                                             | Shows "Posteriormente retificada" without changing identity                        |
| history list/detail                                                            | RAW + badges/chain                                                                         | Both legs visible; status marks SUPERSEDED/CORRECTION/CURRENT                      |

## Rectification model

- `POST /api/v1/portfolios/:portfolioId/transactions/:transactionId/rectifications`
  does not exist as a separate route; the existing
  `POST .../transactions/:transactionId/rectify` endpoint is the
  authorized mutation (strict Zod DTO, unknown fields rejected).
- Modes: `RECTIFY` (compensation + replacement) and `CANCEL`
  (compensation only). Only BUY/SELL are eligible (canonical writer
  constraint); corporate actions, income, transfers and deposits are
  explicitly out of v1 scope.
- Replacement is a **complete canonical transaction** (type, account,
  asset, quantity, unitPrice, fees, tradeDate, notes) validated by
  `TransactionFactory`; never a partial patch. Provider is
  `ATLAS_RECTIFY`; external ids are `reversal:<id>[:key]` /
  `replacement:<id>[:key]` — never inherited from the original.
- Reason is **required** (1–500 chars, trimmed, sanitized by Zod),
  persisted on the link row and inlined into leg notes for legacy
  readability. Actor is server-derived (`userId` from auth principal);
  timestamp is server-derived (`decidedAt`).
- Atomicity: compensating + replacement + link commit in a single
  interactive Prisma transaction (`createWithTransactions`). Partial
  application is impossible (covered by failure-injection test).

## Schema

- New table `transaction_rectifications` (migration
  `20261026130000_add_transaction_rectifications`, #43):
  `id, portfolioId, originalTransactionId, compensatingTransactionId,
replacementTransactionId?, mode, reason, decidedByPrincipal,
decidedAt, createdAt`.
- FKs: portfolio → CASCADE; original/compensating/replacement →
  RESTRICT (ledger never deleted through decisions).
- Uniques: one outgoing link per original; compensating and
  replacement identities unique (chain stays linear; replacements
  always fresh so cycles are structurally impossible).
- Index on `portfolioId`. No backfill: pre-table rectifications keep
  working through notes/external-id conventions with legacy
  resolution fallback.

## Chaining

- A→B: link(original=A, replacement=B). Rectifying B creates
  link(original=B, replacement=C) → chain A→B→C.
- Detail/409 answers resolve to the **terminal** replacement (C).
- Superseded nodes report SUPERSEDED with forward navigation;
  middle-of-chain nodes prioritize SUPERSEDED over CORRECTION so UI
  always moves forward. Cancelled terminals have null replacement.
- `GET /api/v1/transactions/:id` returns `rectification: { status,
effectiveTransactionId, chain[] }` (null when untouched).

## Auditability

- Link row answers: original, compensating, replacement, reason,
  actor (`decidedByPrincipal`), timestamps (`decidedAt/createdAt`).
- Reason is immutable (no update/delete endpoint for links; undo is a
  new rectification of the current replacement).
- Original UPDATE/DELETE is statically forbidden (architecture test).

## Idempotency / races

- Same `idempotencyKey` → deterministic replay of the existing legs
  - link ids (200, `isIdempotentReplay: true`).
- Different key / no key on an already-rectified original → 409
  `TRANSACTION.ALREADY_RECTIFIED` with `details.effectiveTransactionId`.
- Concurrent winners: unique constraint on original decides; losers
  re-read the winner and return 409 (no orphan legs: legs + link are
  one transaction).

## Financial engine integration

- No engine changed: replay already nets compensation. Verified by
  state test (100 → 60 nets to 60, never 160) and existing suites
  (state, valuation, allocation, performance, income, contribution,
  composition, data-quality, review, manual entry, B3 simulated).

## Reconciliation preservation

- `IntegrationRunTransaction` and `ReconciliationDecision` rows are
  never updated by rectification (static guard + regression suite).
- Review detail exposes `rectified: boolean` per linked row for
  display only ("Posteriormente retificada").

## UX

- Web operations ledger: server-driven SUPERSEDED/CORRECTION badges
  (legacy notes fallback), "Corrigir" only on current BUY/SELL,
  "Ver correção" scrolls to the replacement, required reason,
  client no-change guard, Antes→Depois diff, append-only
  confirmation copy ("A operação original será preservada no
  histórico..."), 409 navigates to the effective transaction.
- History timeline: Retificada/Correção badges (pass-through from
  API read model).
- Reviews: "Posteriormente retificada" on web + mobile.
- Mobile: read-only (no mutation CTA); reviews show the flag.

## Security

- Ownership enforced (portfolio + transaction scope, anti-enumeration
  404). No provider/external ids copied. No raw principal in UI/API
  responses (actor stays server-side; error bodies carry only the
  whitelisted `effectiveTransactionId`). Reason bounded/sanitized.

## Migration

- Before: 42. After: 43. Additive only; `prisma migrate deploy`
  green on the test DB.
