# ADR-116 — Benchmark Multi-Currency and Unavailable Semantics

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3F

## Contexto

`IBOV` é `BRL`. Carteiras podem ter posições em `USD`. Não há camada de câmbio nesta fase.

## Decisão

- Comparação de benchmark é permitida **apenas para `BRL`**. Moeda não `BRL` → `benchmark: null`,
  **sem FX** e sem agregação cross-currency.
- `UNAVAILABLE` (benchmark não obtido) nunca é exibido como `0%`; a UI mostra travessão `—` ou a
  mensagem `Benchmark indisponível para este período.` / `CDI indisponível para este período.`
- `PARTIAL` nunca é rotulado como completo: a UI mostra `Comparação parcial`.
- O TWR da carteira permanece visível mesmo quando o benchmark está indisponível.
- `null` significa indisponível; `"0"` significa 0% real.

## Consequências

- Segregação por moeda preservada; nenhum valor `BRL` é somado a `USD`.
