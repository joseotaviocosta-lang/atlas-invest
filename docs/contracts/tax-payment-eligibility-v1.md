# Contrato: DarfPaymentEligibility v1 (Fase 4E)

Resultado puro e determinístico da elegibilidade de recolhimento pelo mínimo de
DARF. Nunca altera a responsabilidade tributária (ADR-278).

## Estrutura

```
{
  status: "PAYABLE" | "BELOW_MINIMUM" | "CARRIED_FORWARD" | "BLOCKED" | "NOT_REQUIRED",
  reasonCode: string | null,
  revenueCode, targetCompetence, currency,
  currentAmount: string | null,
  carryForwardAmount: string | null,
  totalPayable: string | null,
  minimumThreshold: string | null,
  dueDate: string | null,
  currentObligationId: string | null,
  carryForwardEntryIds: string[],
  sourceBreakdown: [{ kind: "CURRENT" | "CARRY_FORWARD",
                      sourceObligationId, sourceCompetence, amount, entryId }],
  ruleId, ruleVersion, fingerprint
}
```

## Status

| Status            | Significado                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `PAYABLE`         | Total `>=` mínimo; pagável no vencimento do último período.                                   |
| `CARRIED_FORWARD` | Total `<` mínimo e carry-forward permitido ⇒ adiado (nunca descartado).                       |
| `BELOW_MINIMUM`   | Total `<` mínimo e carry-forward **não** permitido pela regra.                                |
| `BLOCKED`         | Não é possível determinar (sem regra, obrigação bloqueada, código cruzado, moeda divergente). |
| `NOT_REQUIRED`    | Nada a recolher e nada acumulado.                                                             |

## Regras

1. Valores monetários como strings decimais exatas; `null` = indisponível
   (nunca `"0"`).
2. **Invariante**: a lógica não altera `MonthlyTaxLiability`,
   `principalAmount` nem `updatedAmount`.
3. Código de receita cruzado ⇒ `BLOCKED` (`CROSS_REVENUE_CODE_NOT_ALLOWED`).
4. Moeda divergente entre parcelas ⇒ `BLOCKED` (`CURRENCY_MISMATCH`).
5. O `sourceBreakdown` preserva a decomposição por competência de origem.
6. O vencimento do montante acumulado é o do **último** período.
7. Fingerprint canônico determinístico (sem crypto no domínio puro).
