# Contrato: MonthlyTaxLiability v1 (Fase 4B)

Projeção determinística de responsabilidade tributária mensal para um sujeito
passivo, a partir de eventos fiscais 4A, regras vigentes verificadas, saldos de
prejuízo anteriores e retenções canônicas. **Não** gera DARF, pagamento ou IRPF.

## Estrutura

```
{
  competence, taxSubjectId?, status, ruleVersions,
  categories: TaxCategoryMonthlyResult[],
  totalTaxBeforeCredits: Money | null,
  creditsApplied: Money | null,
  taxDue: Money | null,
  openingLossBalances, closingLossBalances,
  dataQuality, calculationTrace, capabilities,
  calculationVersion, engineVersion, limitations
}
```

## Status

`COMPLETE | PARTIAL | BLOCKED | NO_ACTIVITY`

- `NO_ACTIVITY`: sem eventos tributáveis; `taxDue = "0"` apenas quando o
  histórico é conhecido.
- `BLOCKED`: `taxDue = null` (nunca `"0"`).
- `PARTIAL`: `taxDue = null` (nunca mascara um total final).
- `COMPLETE`: `taxDue` numérico, apenas sob regra `VERIFIED`.

## Invariantes

1. Só `@atlas/tax-engine` calcula imposto (ADR-242).
2. `taxDue` nunca é negativo (ADR-247).
3. BLOCKED/PARTIAL nunca expõem zero fabricado (ADR-247).
4. Sem float IEEE-754; strings decimais exatas.
5. Sem FX implícito; moeda não suportada → BLOCKED.
6. Sem vazamento de eventos ou regras futuras.
