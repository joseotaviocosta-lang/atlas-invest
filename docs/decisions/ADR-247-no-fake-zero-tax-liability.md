# ADR-247: Sem Zero Fabricado em Imposto Bloqueado/Parcial

## Status

Aceito (Fase 4B)

## Contexto

Exibir `R$ 0,00` quando o cálculo está bloqueado ou incompleto é enganoso: o
investidor pode interpretar como "nada a pagar".

## Decisão

1. `BLOCKED` → `taxDue = null` (nunca `"0"`).
2. `PARTIAL` → `taxDue = null` (nunca mascara um total final).
3. `NO_ACTIVITY` → `taxDue = "0"` apenas quando o histórico é conhecido e
   completo.
4. `taxDue` numérico somente em `COMPLETE` sob regra `VERIFIED`.
5. Imposto nunca é negativo (`taxDue >= 0`).
6. `totalTaxBeforeCredits`/`creditsApplied` só existem em `COMPLETE`.

## Consequências

- Nenhum zero enganoso.
- A UI mostra `—` e a razão exata do bloqueio/parcialidade.
