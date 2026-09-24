# ADR-129 — Volatility Annualization & Precision Policy

**Status:** Accepted — 2026-09-21 (Fase 3I)
**Context:** Annualizing daily volatility requires √252, and any square
root forces a decision about floating-point vs decimal arithmetic in a
codebase that forbids floats for financial math.

**Decision:**

- Convention: `annualizedVolatility = dailyVolatility × sqrt(252)` (252
  business days, standard daily-market annualization), exposed explicitly as
  `annualizationFactor: "252"` in engine results and API responses. The
  factor is valid because Layer B (ADR-132) feeds market-day-compatible
  observations; had the sample been calendar-day, the methodology — not just
  the constant — would have to change. Swapping 252 → 365 to preserve
  calendar-day code is explicitly forbidden.
- Precision policy distinguishes two regimes:
  - **Financial exact arithmetic** (sums, means, variances): `Quantity`
    decimal arithmetic (40 digits, `ROUND_HALF_UP`) — zero IEEE drift.
  - **Statistical irrational operations** (square root): Newton-Raphson
    iteration `x ← (x + v/x) / 2` in the SAME decimal arithmetic, converged
    to decimal equality (≤100 iterations), in ONE boundary function
    (`decimalSqrt`). It throws fail-closed on negative input.
- No `Math.sqrt` / `Math.pow` / `Number()` / `parseFloat` exists anywhere in
  `@atlas/risk-engine` (architecture-grep enforced). If a future operation
  ever required a float conversion, it would need encapsulation,
  documentation, finite/range validation, round-trip conversion, explicit
  tolerance, property/regression tests and its own ADR — none of which was
  needed here.
- Regression pins: `sqrt(2)` and `sqrt(252)` within `1e-12` of float truth;
  `+1/−1/+1/−1` annualized ≈ 18.3303% pinned.

**Consequences:** Exact where exactness is possible, controlled where the
operation is inherently irrational — with the boundary explicit and tested.
