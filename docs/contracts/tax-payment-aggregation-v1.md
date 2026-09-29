# Contrato: TaxPaymentAggregation v1 (Fase 4E)

Unidade de pagamento derivada que combina o valor da competência corrente com os
valores acumulados (carry-forward) do **mesmo código de receita** (ADR-279).

## Estrutura

```
{
  id, taxSubjectId, revenueCode, targetCompetence, currency,
  currentAmount, carryForwardAmount, totalPayable, minimumThreshold,
  sourceEntryIds: string[],
  currentObligationId: string | null,
  dueDate: string | null,
  status: "PAYABLE" | "CARRIED_FORWARD",
  ruleId, ruleVersion, fingerprint, createdAt
}
```

## Regras

1. **Determinístico / idempotente**: identidade
   `(taxSubjectId, revenueCode, targetCompetence, fingerprint)`.
2. `fingerprint` cobre código de receita, competência-alvo, obrigação corrente,
   entradas acumuladas, versão da regra e autoridade de vencimento.
3. **Nunca recalcula tributo**: deriva exclusivamente da elegibilidade.
4. Só existe para `PAYABLE`/`CARRIED_FORWARD`; `BLOCKED`/`NOT_REQUIRED`/
   `BELOW_MINIMUM` não produzem agregação.
5. **Sem agregação cruzada de códigos** e sem conversão cambial.
6. Valores como strings decimais exatas; o pagamento do montante agregado consome
   as entradas de origem exatamente uma vez (ADR-279/281).
7. Não gera DARF oficial.
