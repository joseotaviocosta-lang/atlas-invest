# ADR-147 — Active Performance Period Consistency

**Status:** Accepted — 2026-09-22 (Fase 3L)
**Context:** Alpha, Information Ratio and Treynor combine several returns. If
the portfolio return, the market return, the risk-free return and Beta came from
different windows (e.g. an annual portfolio return against a daily CDI and a
daily IBOV, or a YTD Beta against a 1Y Alpha), the metrics would be
meaningless.

**Decision:** Every dependency of an active-performance response MUST use the
SAME `effectiveStart` and `effectiveEnd`:

- `Rp` = portfolio TWR over `[effectiveStart, effectiveEnd]`;
- `Rf` = CDI accumulated return over the SAME period (3G `(start, end]` accrual
  convention, ADR-120);
- `Rm` = IBOV return between the first and last benchmark sessions within the
  SAME period;
- `Beta` and the Information Ratio's paired observations = the 3K
  relative-risk pipeline over the SAME period.

The application layer builds ONE calculation context and ONE IBOV range fetch
and ONE CDI range fetch for the request; no secondary period drift is permitted.
The response carries `period`, `marketBenchmark` and `riskFreeProxy` for
provenance. Inception clamp and max range mirror 3E/3H/3I/3J/3K.

**Instrumentation proof:** the use case derives a SINGLE `effectiveStart` /
`effectiveEnd` and passes it to every dependency. Trace tests spy on the
providers and assert that:

- the IBOV `getObservations` range fetch is called exactly once with
  `(IBOV, effectiveStart, effectiveEnd)` (Rm and Beta share it);
- the CDI `getRateObservations` range fetch is called exactly once with
  `(CDI, effectiveStart, effectiveEnd)` (Rf);
- every historical valuation date requested for Rp lies within
  `[effectiveStart, effectiveEnd]`;
- the Information Ratio consumes the 3K paired observations unchanged (no
  second alignment);
- the response `period` equals the effective period.

These hold for explicit periods, the default period, and inception-clamped
periods. A dependency using a different period would fail the trace assertions.

**Consequences:** Active metrics are internally consistent by construction;
period drift is structurally impossible within a single response and is guarded
by regression tests.
