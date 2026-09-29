# Contrato: TaxPaymentEvidence v1 (Fase 4C.2)

Evidência **manual** de pagamento. Estado operacional que **nunca** altera a
responsabilidade tributária (ADR-266).

## Estrutura

```
{
  id, obligationId, taxSubjectId, paidAt (YYYY-MM-DD),
  amount (string decimal), currency,
  sourceType: MANUAL_CONFIRMED, sourceReference?,
  confirmedAt, status: CONFIRMED, fingerprint
}
```

## Regras

1. Apenas `MANUAL_CONFIRMED` (sem sincronização bancária).
2. Valor decimal exato; moeda explícita; sem float.
3. Pagamento **integral** apenas: `amount` deve ser exatamente igual ao
   `principalAmount` da obrigação (sem parcial/sobrepagamento).
4. Idempotência por `(obligationId, sourceReference)` e por
   `(obligationId, fingerprint)`; mesma origem com valor diferente → `409`.
5. Não há reembolso, crédito ou compensação automática.
6. Cross-user → `404`.
7. Registro bem-sucedido marca a obrigação como `PAID`.
