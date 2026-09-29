# Contrato: LatePaymentRuleSet v1 (Fase 4D.2)

Regra versionada de acréscimos legais por atraso (multa + juros) para tributos
federais (Lei nº 9.430/1996, art. 61).

## Estrutura

```
{
  ruleId, version, effectiveFrom, effectiveTo,
  dailyPenaltyRate: "0.33", penaltyCapRate: "20",
  penaltyStartAuthority: "OFFICIAL_SNAPSHOT",
  interestMethod: "SELIC_MONTHLY_SIMPLE_SUM_PLUS_PAYMENT_MONTH_1_PERCENT",
  paymentMonthRate: "1",
  roundingMode: "ROUND_HALF_EVEN", moneyScale: 2,
  legalSourceIds, verifiedAt
}
```

## Regras

1. Multa: 0,33% por dia, limitada a 20%.
2. Início da multa: primeiro dia útil após o vencimento — resolvido por
   **snapshot oficial** (sem calendário genérico de feriados) (ADR-275).
3. Juros: soma simples mensal da SELIC entre o mês seguinte ao vencimento e o
   mês anterior ao pagamento, + 1% no mês do pagamento (ADR-270).
4. Arredondamento: `ROUND_HALF_EVEN` a 2 casas, por componente (ADR-273).
