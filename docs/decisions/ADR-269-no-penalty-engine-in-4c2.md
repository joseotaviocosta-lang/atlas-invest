# ADR-269: Sem Motor de Multa/Juros na Fase 4C.2

## Status

Aceito (Fase 4C.2)

## Contexto

`OVERDUE` é um estado operacional. Multa, juros e atualização (Selic) são
matéria tributária que exige regra verificada e não pertence a esta fase.

## Decisão

1. `OVERDUE` é **apenas status**, derivado de vencimento oficial + relógio
   injetado + estado de pagamento.
2. Nenhum cálculo de multa, juros, Selic ou valor atualizado.
3. O relógio é date-only (`YYYY-MM-DD`), determinístico e injetado (testável).
4. O cliente nunca deriva `OVERDUE`.

## Consequências

- Nenhum valor atualizado fabricado.
- Cálculo de acréscimos legais permanece para fase futura verificada.
