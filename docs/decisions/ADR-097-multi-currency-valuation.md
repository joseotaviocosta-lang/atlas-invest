# ADR-097 — Multi-Currency Valuation

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3B

## Contexto

Carteira pode ter `BRL` e `USD` (mesmo ticker em exchanges diferentes com `AssetId` distinto). Somar sem FX cria patrimônio fictício.

## Decisão

- `BRL` e `USD` **nunca** somados. `totalsByCurrency: { BRL: { marketValue, knownCost, unrealized }, USD: { ... } }`.
- `marketValue` só se `quote.currency === position.currency`; senão `CURRENCY_MISMATCH`.
- `unrealized` só se mesma moeda e ambos conhecidos.
- `currencies: ['BRL','USD']` em `summary`; UI renderiza blocos separados `BRL`/`USD`, nunca `patrimônio total` único.

## Consequências

- Sem conversão implícita; FX só no futuro `FX Engine` explícito.
- Testes cobrem `BRL only`, `USD only`, `BRL+USD` segregado, `partial` por moeda.
