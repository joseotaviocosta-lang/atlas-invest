# ADR-267: Supersessão de Obrigações

## Status

Aceito (Fase 4C.2)

## Contexto

Transações/inputs podem mudar após a materialização de uma obrigação, e a
Receita pode corrigir um vencimento. Obrigações antigas não podem ser
sobrescritas silenciosamente.

## Decisão

1. Mudança de responsabilidade → novo `liabilityFingerprint` → nova revisão;
   a anterior vira `SUPERSEDED`.
2. Obrigação **paga** cuja responsabilidade mudou → `RECONCILIATION_REQUIRED`
   (evidência de pagamento preservada; sem transferência/crédito automático).
3. Correção de vencimento → nova versão do registro; obrigação re-vinculada em
   nova revisão; a anterior explicitamente substituída.
4. `supersededById` registra a cadeia de substituição.
5. Histórico nunca é apagado.

## Consequências

- Reconciliação explícita e auditável.
- Nenhum crédito/estorno automático.
