# ADR-160 — Deterministic Scenario Semantics

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** Scenario analysis can be mistaken for forecasting. It must be
unambiguously a deterministic, explicit, reproducible hypothesis.

**Decision:** Every scenario is:

- **explicitly defined** by the caller (type + numeric inputs) — no hidden
  assumptions, no AI-generated assumptions, no crisis presets;
- **deterministic** — same input always yields the same output;
- **auditable** — the result echoes the scenario and exposes per-component
  base/stressed/impact values;
- **non-probabilistic** — no likelihood, probability, distribution or Monte
  Carlo; no parametric VaR/CVaR simulation;
- **non-predictive** — outputs are labeled "Impacto estimado no cenário",
  "Hipótese", "Simulação"; never "previsão", "vai cair" or "perda esperada".

Predefined scenarios (MARKET_DOWN_10, …, RATES_DOWN_100BPS) are UX convenience
only; each maps to explicit inputs. Dated/crisis names (2008, Covid, Black
Monday) are forbidden without a real historical replay.

**Consequences:** Scenario output is always a hypothesis, never a forecast.
