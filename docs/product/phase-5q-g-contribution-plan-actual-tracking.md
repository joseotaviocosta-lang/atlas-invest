# Phase 5Q-G — Contribution Plan vs Actual Tracking (Facts Only)

## Plan vs transaction

```text
PLAN   = user-declared future intent (name, date, per-category amounts).
ACTUAL = ledger transactions explicitly CONFIRMED by the user.
```

Plans never reference transactions implicitly; transactions never point
back at plans. The link table stores only the relation + audit state.
Amounts, dates, categories and currencies always come from the ledger
(Transaction) and the plan (items) at read time — never copied.

## Eligible actual events

| Type                                         | Counts as actual? | Why                                              |
| -------------------------------------------- | ----------------- | ------------------------------------------------ |
| DEPOSIT                                      | YES               | Explicit external cash in; has amount + currency |
| BUY                                          | NO                | Purchase ≠ proven contribution (rotation risk)   |
| SUBSCRIPTION                                 | NO                | Purchase semantics, same reason as BUY           |
| TRANSFER_IN                                  | NO                | No monetary amount on the event                  |
| DIVIDEND / JCP / FII_INCOME                  | NO                | Income, not contribution                         |
| SELL / TRANSFER_OUT / WITHDRAWAL / FEE / TAX | NO                | Outflows / expenses                              |
| SPLIT / REVERSE_SPLIT / BONUS / AMORTIZATION | NO                | Non-cash or non-contribution events              |

Sources are agnostic (MANUAL/CSV/BROKER_NOTE/B3/...): eligibility is by
type, never by origin. The matrix is centralized in the engine
(`ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES`); v1 counts DEPOSIT only.
Category mapping: DEPOSIT has no asset, and a cash deposit is cash by
definition → `CASH`. Asset-backed rows use the canonical asset type when
it is a known strategy category, else `OTHER` (nothing invented).

## Candidate vs confirmed

- UNLINKED: absence of a row (default).
- CANDIDATE: derived on read (never persisted, never counted).
- CONFIRMED: persisted user action; the only state that feeds totals.
- REJECTED: persisted memory so a dismissed candidate never reappears;
  also the unlink target (audit preserved, never hard-deleted).

Confirm/reject/unlink are all idempotent; confirm-while-CONFIRMED and
reject-while-REJECTED succeed without side effects.

## Manual confirmation

Flow: user opens a plan → reviews derived candidates → clicks
"Vincular" → row becomes CONFIRMED. Or pastes any eligible transaction
into the same endpoint — candidates are a convenience, not a gate.
Blocking rules: ineligible type, currency mismatch vs the plan, foreign
transaction (404), already CONFIRMED to another plan (400, single actual
owner), cancelled plan (400, read-only).

## Rejection

"Não é deste plano" persists REJECTED. Re-confirming a rejected link
flips it back to CONFIRMED on explicit action. Unlinking a confirmed
link (Desvincular) flips it to REJECTED — the audit row stays.

## Tracking aggregation

```text
plannedTotal  = Σ plan items (exact decimals)
actualTotal   = Σ CONFIRMED ledger amounts (exact decimals)
difference    = actual − planned (signed, neutral)
completionBp  = round(actual / planned × 10000), null if planned = 0
byCategory    = union of planned + actual categories, canonical order
confirmedCount / candidateCount
```

"R$ 300 abaixo do valor planejado" / "R$ X acima do valor planejado"
are neutral facts; "94% do valor planejado foi identificado em
operações confirmadas" is a factual ratio — never called a score.

## Category mapping

Plan items already carry categories. Actuals resolve per transaction:
DEPOSIT → CASH; asset type if known else OTHER. Planned-but-unmatched
categories show actual 0; actual-only categories (e.g. CASH deposits
against a STOCK-only plan) show planned 0 with their deviation.

## Date policy

Candidates derive from a centralized window: plannedDate − 7d to
+14d (lexicographic ISO compare, manual civil-day math — no `Date`,
no timezone). Ordering: date distance, then exact amount distance to
the planned total, then trade date, then id. Capped at 50, bounded
query (`take: 200`) — no ledger scan.

## Currency policy

Candidates require `transaction.currency === plan.currency`; manual
confirm enforces the same. A plan whose live basis currency diverges
reports `CURRENCY_MISMATCH` instead of converting. No FX invented.

## No auto-confirm guarantee

`getPlanTracking` never calls `links.confirm` (architecture test slices
the method body to prove it). Candidates exist only in the response
payload. Confirmation requires the explicit POST confirm endpoint with
a human-supplied transaction id (strict UUID DTO).

## No ledger mutation

The plan/tracking stack imports transaction/asset readers only. No
`CreateTransactionUseCase`, no `TransactionRepository` writer import
(concrete class), no `prisma.transaction.create/update/delete` anywhere
in the path (architecture-scanned, including web/mobile surfaces).
Rectification stays append-only in the ledger module; tracking reads
the canonical current row by id.

## Mobile

Mobile shows the tracking summary, confirmed operations and read-only
candidates (with a web-only note for linking). Complete/cancel stay
native; create/edit stay web-only. No dead CTAs, no execution.

## Future matching evolution

`5Q-H — Contribution Tracking Automation & Assisted Matching` may
revisit heuristics only after real usage proves which ones are safe.
Never: fuzzy/inferred matching, auto-completion of plans, return/tax
projections, suitability, B3 CERT coupling.
