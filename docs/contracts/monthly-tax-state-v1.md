# Contrato: MonthlyTaxState v1 (Fase 4A)

Projeção fiscal determinística e normalizada para uma competência civil (`YYYY-MM`).
**Não é responsabilidade tributária** (isso pertence à Fase 4B). Não expõe `taxDue`.

## Identidade e status

- `competence`: `YYYY-MM` (validado estritamente; rejeita `2026-13`, `2026-00`, `2026`, `09/2026`).
- `status`: `EMPTY | COMPLETE | PARTIAL | BLOCKED`.
  - `EMPTY`: sem eventos (zero válido).
  - `BLOCKED`: sem conjunto de regras vigente (falha fechada).
  - `PARTIAL`: issues de completude presentes.
  - `COMPLETE`: sem issues.

## Estrutura

```
{
  competence,
  status,
  eventCount,
  currencies: string[],
  categories: TaxCategoryMonthlyState[],
  events: FiscalEvent[],
  dataQuality: { status, issues, issueCount },
  ruleSetVersion: string | null,
  ruleSetStatus: 'TEST_ONLY' | 'VERIFIED' | 'RETIRED' | null,
  capabilities: {
    foundationOnly: true,
    productionRuleVerified: boolean,
    withholdingSupported: false,
    taxLiabilitySupported: false
  },
  projectionVersion,
  engineVersion
}
```

### TaxCategoryMonthlyState

```
{
  category: TaxAssetCategory,
  currency: string,
  capability: 'CALCULABLE' | 'PARTIAL' | 'UNSUPPORTED' | 'BLOCKED',
  eventCount: number,
  salesProceeds?: Money,
  realizedGain?: Money,
  realizedLoss?: Money,
  income?: Money,
  withholding?: Money,   // ausente na 4A (sem fonte canônica)
  qualityIssues: string[]
}
```

## Invariantes

1. **Competência Civil:** derivada exclusivamente da data econômica; sem fuso horário.
2. **Sem Vazamento Futuro:** o estado de setembro nunca inclui eventos de outubro.
3. **Limites do Mês:** primeiro e último dia incluídos; mês seguinte excluído.
4. **Moedas Segregadas:** sem FX implícito; `BRL` e `USD` nunca somados.
5. **Desconhecido ≠ Zero:** base/custo/ganho desconhecidos não viram zero; totais parciais
   são omitidos.
6. **Sem Responsabilidade:** a Fase 4A nunca calcula imposto a pagar.
7. **Serialização:** valores monetários como strings decimais exatas.
