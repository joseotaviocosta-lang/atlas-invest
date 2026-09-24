# ADR-096 — Partial Valuation and Completeness

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3B

## Contexto

Nem toda posição terá quote (símbolo não coberto, falha provider) ou custo (TRANSFER_IN sem custo). Valuation precisa ser parcial e explícito, não falhar nem inventar.

## Decisão

- `QUOTE_UNAVAILABLE` → `marketValue=null`, `status=QUOTE_UNAVAILABLE`.
- `COST_INCOMPLETE` → `marketValue` pode existir, `unrealized=null`, `status=COST_INCOMPLETE`.
- `STALE` → `marketValue` valuado com `freshness=STALE`, `status=QUOTE_STALE`, nunca mascarado como FRESH.
- `CURRENCY_MISMATCH` → `marketValue=null`, sem FX.

Completeness do portfólio:

```
COMPLETE | PARTIAL_QUOTES | PARTIAL_COST | PARTIAL_CURRENCY | PARTIAL_STALE | PARTIAL_MULTIPLE
```

- `valuedPositions`, `unavailablePositions`, `totalsByCurrency` só sobre as 8 válidas de 10 (parcial).
- Falha parcial do provider → 200 parcial; falha total → 200 com todos unavailable (nunca derruba `GET /state`).

## Consequências

- UX mostra `Valuation parcial: 8/10` e badges por status.
- `historical mode` (`asOf`) oculta valuation (current ≠ histórico).
