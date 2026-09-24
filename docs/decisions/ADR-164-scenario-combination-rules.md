# ADR-164 — Scenario Combination Rules

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** Combining shocks risks double-counting the same exposure — a
direct equity shock and a benchmark Beta shock both move the same equity market
value.

**Decision:**

- **Forbidden combination:** a direct equity shock **and** a benchmark shock in
  the same scenario (same exposure). → `400 SCENARIO.CONFLICTING_SHOCKS`.
- **Allowed combinations:** direct asset-class shock + rate shock, or benchmark
  shock + rate shock.
- A `COMBINED` scenario with no shock at all → `SCENARIO.INVALID_SHOCK`.
- Component impacts are additive on the same base **only** because components
  never overlap by construction. When a component is unsupported (e.g. rate),
  the supported components still drive the stressed value and the currency
  status is `PARTIAL`; the unsupported component is never fabricated.

**Consequences:** No silent double-counting; combination semantics are explicit.
