# Contrato: TaxPaymentAdjustment v1 (Fase 4D.2)

Ajuste derivado de atraso para uma data de pagamento explícita. O principal
original é imutável (ADR-274).

## Estrutura

```
{
  obligationId, obligationFingerprint,
  principalAmount, currency, dueDate, paymentDate,
  lateFeeAmount, interestAmount, updatedAmount,
  lateFeePercentage, interestPercentage, daysLate,
  status: NOT_LATE | READY | BLOCKED,
  reasonCode, ruleId, ruleVersion,
  lateFeeAuthorityId, interestRateSnapshotIds,
  roundingMode, fingerprint, trace
}
```

## Regras

1. `paymentDate <= dueDate` → `NOT_LATE` (sem acréscimos).
2. `updatedAmount = principal + round_half_even(multa) + round_half_even(juros)`
   (component-first, 2 casas).
3. `READY` exige autoridade oficial de multa + taxas SELIC completas.
4. Qualquer ausência → `BLOCKED` (nunca valor estimado).
5. Preview **não mutante**; o principal da obrigação nunca é sobrescrito.
