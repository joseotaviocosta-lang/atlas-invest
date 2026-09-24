# ADR-163 — Rate Shock Boundary

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** A rate shock needs an interest-rate sensitivity (modified
duration). Full bond pricing is out of scope for 3O.

**Decision:**

- **Audit result:** the canonical domain/schema has **no**
  `modifiedDuration`/`convexity`/`maturity`/`coupon` field. Therefore, in 3O,
  `RATE_SHOCK` is **UNSUPPORTED** (`SCENARIO.UNSUPPORTED_RATE_SHOCK`) — no fake
  math, no fabricated sensitivity, no inferred duration from maturity/coupon/
  yield.
- The engine exposes a guarded linear-duration formula for future use, applied
  **only if an explicit `modifiedDuration` is provided**:
  `ΔV/V ≈ −modifiedDuration × rateShockDecimal`, where
  `rateShockDecimal = bps / 10000` (`100 bps = 1.00 p.p.`).
  This is a **linear duration approximation** (no convexity).
- A shock that would drive the stressed value to `≤ 0` → `UNAVAILABLE`
  (`SCENARIO.RATE_SHOCK_NEGATIVE_VALUE`).
- The application never populates `modifiedDuration` (no canonical source), so
  the API always returns `RATE_SHOCK` as `UNAVAILABLE`/unsupported, and the UI
  disables the rate presets with an explanation.

**Consequences:** No fabricated interest-rate sensitivity; the contract/boundary
is ready for a future duration-aware phase.
