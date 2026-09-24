# ADR-095 — Current Market Value Semantics

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3B

## Contexto

Valor de mercado é `quantity` (do replay) × `current quote` (do market data). Precisa de precisão e terminologia honestas antes de performance temporal.

## Decisão

Fórmulas canônicas (sem float, com `Money`/`Quantity`/`Percentage`):

```
marketValue = Money(price, quoteCurrency).multiply(Quantity(quantity).value)
unrealized = marketValue - totalCost  // só se marketValue≠null && totalCost≠null && mesma moeda
unrealizedPercent = unrealized / totalCost × 100 // só se totalCost>0, senão null
```

- `totalCost` desconhecido (`INCOMPLETE`) → `unrealized=null` (nunca 0).
- `totalCost=0` conhecido → `unrealized=marketValue`, `percent=null` (sem div/0).
- Serialização `string` exata (`"4000"`, `"33.333..."`), nunca `number`.
- Nomenclatura: `Valor de mercado`, `Custo total conhecido`, `Resultado não realizado` (não `Patrimônio` nem `Lucro` quando custo incompleto).

## Consequências

- Zero client math: `valuePosition`/`valuePortfolio` no server.
- Percentual só quando matematicamente válido; `ROUND_HALF_UP` 40 dígitos.
