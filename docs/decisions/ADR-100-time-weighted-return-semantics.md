# ADR-100 — Time-Weighted Return Semantics

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3C

## Contexto

TWR deve isolar retorno de mercado de aportes, ser chainable e auditável.

## Decisão

- **Subperíodo:** `R = (Ending - Beginning - NetFlow) / Beginning` (flows no fim do dia). Documentado; limitação: sem valuation intraday, flow assume boundary.
- **Segmentação:** por datas de `observations` e `cashFlows` (antes do flow → flow → após). `NetFlow` em `endDate` pertence ao subperíodo `[start,end]`.
- **Chaining:** `(1+r1)*(1+r2)*...-1` com `Quantity`/`Percentage` exato, `Object.freeze`, nunca `Number`/`Math.pow` para TWR.
- **Edge:** `beginning=0` → `INVALID_INPUT`; `<2 obs` → `INSUFFICIENT_DATA`; `duplicate date` → `INVALID_INPUT`; `value<0` → `INVALID_INPUT`; `start>end` → `INVALID_INPUT`.

## Consequências

- `TimeWeightedReturnResult { returnPercentage, subperiods, status, dataAvailability }` determinístico.
- Properties: `no flows + flat → 0%`, `zero flow` não altera, `internal transfer` zero efeito.
