# ADR-099 — External Cash Flow Semantics

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3C

## Contexto

TWR/XIRR precisam distinguir capital externo (que não é retorno) de eventos internos.

## Decisão

**External:** `DEPOSIT` (`INFLOW`) e `WITHDRAWAL` (`OUTFLOW`) — `EXTERNAL_CONTRIBUTION`/`WITHDRAWAL`.

**Não external:** `BUY`, `SELL`, `DIVIDEND`, `JCP`, `FII_INCOME`, `FEE`, `TAX`, `TRANSFER_IN/OUT`, `SPLIT`, `BONUS`, `AMORTIZATION`, `SUBSCRIPTION` (compra via direito, internal). `TRANSFER` entre contas do mesmo portfolio net 0 consolidado.

- `DIVIDEND/JCP/FII` permanecem em `value` (aumentam retorno).
- `FEE/TAX` reduzem `value` (diminuem retorno), nunca neutralizados.
- Mesmo dia netado exato: `deposit 1000` + `withdrawal 200` → `800` via `Money`.

## Consequências

- `TWR` neutraliza `DEPOSIT/WITHDRAWAL`; `XIRR` usa `DEPOSIT` como outflow do investidor (`-`) e `WITHDRAWAL` como inflow (`+`).
- Documentado e testado com `internal transfer` invariance.
