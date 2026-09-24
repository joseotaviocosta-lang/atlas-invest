# ADR-126 — Performance Chart Client Boundary

**Status:** Accepted — 2026-09-21 (Fase 3H)
**Context:** The chart must render server-computed series without reintroducing
financial math into Web/Mobile.

**Decision:** The client renders only (`PortfolioPerformanceSeriesViewModel`):

- Allowed: mapping pixels/geometry, formatting dates (`formatLocalDateDisplay`)
  and percentages (`formatPercentage`), tooltip labels, legend, zero line,
  skeleton/error/empty/partial states, accessibility fallback text.
- Forbidden: calculating returns, normalizing (subtract first point, divide
  levels), compounding CDI (`dailyFactor`, `accumulatedFactor`), chaining
  subperiods, neutralizing flows, annualizing, `calculateTWR`,
  `calculateBenchmarkReturn`, `calculateRateBenchmarkReturn`, `Math.pow` for
  finance, `parseFloat`/`Number()` on financial values for computation.
  (`Number()` on canonical decimal strings solely for SVG/pixel coordinates
  is visual geometry, documented inline, and covered by architecture guards
  that forbid financial keywords instead.)
- No chart library was added (audit §69): the web chart is hand-rolled inline
  SVG; the mobile chart is hand-rolled `View` segments. No new dependency,
  no bundle-size or security review needed.
- Failure isolation: the series query is independent; if it fails, the
  TWR/XIRR summary stays visible with
  "Não foi possível carregar o histórico de performance."
- Unavailable series never renders a flat 0% line; it renders
  "Histórico insuficiente para montar o gráfico."
- Accessibility: `role="img"` with `aria-label`, per-point `<title>` tooltips
  on web, screen-reader point list fallback, `accessibilityLabel` on mobile.

**Consequences:** Zero client financial math; architecture tests grep-guard
both chart components and both performance screens.
