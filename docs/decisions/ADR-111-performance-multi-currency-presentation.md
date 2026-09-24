# ADR-111 — Performance Multi-Currency Presentation

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3E

## Contexto

`BRL` e `USD` não podem ser somados.

## Decisão

`currencies: { BRL: { twr, xirr }, USD: {...} }` separados, sem `retorno consolidado` cross-currency, sem `FX`. `TWR`/`XIRR` por moeda, nunca `BRL+USD`. `Performance UX` mostra seções `BRL` e `USD` separadas.

## Consequências

- `view-model` preserva `currencies` como `Record<Currency, ...>` (não array), `web`/`mobile` grid `BRL`/`USD`.
- `architecture` guard `No cross-currency total`.
