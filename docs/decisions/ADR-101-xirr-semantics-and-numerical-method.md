# ADR-101 — XIRR Semantics and Numerical Method

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3C

## Contexto

XIRR precisa de sinal, convergência e segurança numérica.

## Decisão

- **Input:** `dated cash flows` + `ending liquidation value` (inflow final). `DEPOSIT` (INFLOW) é outflow do investidor (`-`), `WITHDRAWAL` (OUTFLOW) é inflow (`+`), `endingValue` é inflow (`+`).
- **Semântica:** precisa `≥1 positivo e ≥1 negativo`, senão `NO_SOLUTION`.
- **Método:** Newton-Raphson `r_{n+1}=r_n - f/f'` com `t=days/365.2425`, `f= Σ CF/(1+r)^t`, `tolerance 1e-7`, `maxIter 100`, `guess 0.1`, bounds `[-0.9999,10]`. Bisection fallback se `f'==0` ou `fLow*fHigh>0`.
- **Status:** `CONVERGED|NO_SOLUTION|INSUFFICIENT_DATA|NUMERICAL_FAILURE`, `iterations`, `returnPercentage|null`. Nunca `Infinity` silencioso.
- **Precisão:** `Math.pow` é único float controlado (documentado), com `Percentage` exato no resultado.

## Consequências

- `calculateXIRR` determinístico, `Object.freeze`, testado com `10%` simples, `irregular dates`, `no solution`.
