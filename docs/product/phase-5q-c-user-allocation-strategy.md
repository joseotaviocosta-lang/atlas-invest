# Phase 5Q-C — User-Defined Allocation Strategy

Status: implementation complete, awaiting owner review/push. B3 CERT stays blocked (`ENGINEERING_READY_FOR_CERT`, `CERT_ACCESS_BLOCKED` — untouched; no B3 code paths affected).

## Why user-defined

The Atlas never invents a target allocation: no model portfolio, no profiler, no "60/40 default". The user declares explicit per-asset-class targets; the Atlas only compares the current portfolio against them and reports deviations in neutral language. Intent stays with the investor; facts and arithmetic stay with the Atlas.

## Strategy model

- One strategy per portfolio: a set of `{category, targetBp}` rows (no separate header entity — the portfolio itself is the identity).
- Categories: exactly the allocation engine's vocabulary — the 8 domain asset types (`STOCK FII ETF BDR FIXED_INCOME TREASURY FUND CASH`) plus the engine's `'OTHER'` catch-all. No sectors, issuers, regions or currencies (inventing them would create comparisons against data that does not exist).
- Zero targets are normalized away on write (`0` == absent, documented); an all-zero write is rejected — use DELETE to clear.

## Basis-point storage

`targetBp: integer` (`4000` = 40%). Locale parsing (`25,5` → `2550`) happens at the UI edge with decimal-string math (never `parseFloat`, which would read `'25,5'` as `25`); the backend re-validates ranges and the exact total. All comparisons and deviations are integer arithmetic.

## 100% invariant

Active targets must total exactly `10000` bp. The backend is the authority: strict Zod DTO (unknown fields rejected, integer 0–10000, known categories, no duplicates) + service-level sum check + atomic replace in a single transaction (delete + insert). Concurrent replaces converge to one complete strategy (last writer wins, never mixed) via P2002 retry.

## Comparison semantics

`deviation = current − target` (integer bp), tolerance ±100bp inclusive (`ON_TARGET`); otherwise `ABOVE_TARGET` / `BELOW_TARGET`. No `OVERWEIGHT`/`UNDERWEIGHT` language anywhere — those terms imply a professional judgment the Atlas does not make. pt-BR: "Acima da meta / Abaixo da meta / Na meta / Dados indisponíveis".

## Tolerance

±1 p.p. is a UI/decision threshold: how far a category may drift before it counts as materially different from the user's own target. It is NOT an acceptable-risk statement, NOT suitability, NOT advice. Centralized (`STRATEGY_TOLERANCE_BP`), tested at the boundary.

## Data quality

Comparisons require a knowable denominator: translated total (`AVAILABLE`) or a single-currency bucket. Coverage below 80% or multi-currency without translation yields all-`UNAVAILABLE` rows with an explicit qualifier ("considera X% do valor conhecido") instead of a fabricated comparison. Unparseable weights fail closed the same way.

## Multi-currency

Fail-closed by design: no summing across currencies, no FX invention. The UI explains the limitation instead of showing partial math. `KNOWN_VALUE_<CUR>` / `KNOWN_VALUE` denominator labels keep the denominator explicit.

## Unclassified assets

Assets without a known type fall into the engine's existing `'OTHER'` class, which is itself targetable. Unvalued assets (no quote) are excluded from weights and surfaced through the coverage qualifier — never silently ignored, never invented.

## Review integration

A declared, breached strategy (any category outside tolerance, coverage permitting) emits one `STRATEGY_ALLOCATION_DEVIATION` signal (severity REVIEW — attention, never WARNING): `{categoriesOutsideTarget, worstDeviationBp, worstCategory, coverageBp}`, CTA "Ver estratégia". No strategy or no breach → no signal. Drill-down shows the current comparison table with an explicit no-history limitation (targets are not versioned in v1).

## Advice boundary

No "rebalance", no buy/sell, no trade generation, no orders, no optimization, no projections. Copy states facts ("A alocação atual difere das metas que você definiu") and navigates ("Ver estratégia", "Editar metas"). Enforced by boundary tests across engine, API, web and mobile copy.

## Historical limitation

Targets are current-only: the detail shows the present comparison and explicitly states there is no target history (`SINGLE_SNAPSHOT_ONLY`). No backdated comparisons, no invented past targets.

## Future evolution

- 5Q-D may add rebalance _simulation_ (hypothetical aportes) on top of this intent layer — explicitly not in this phase.
