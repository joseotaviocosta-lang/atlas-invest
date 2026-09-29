# Contrato: TaxCarryForwardEntry v1 (Fase 4E)

Fato histórico imutável que representa um valor de tributo federal abaixo do
mínimo de DARF, adiado para o mesmo código de receita em períodos subsequentes
(ADR-281).

## Estrutura

```
{
  id, taxSubjectId, sourceObligationId, sourceCompetence,
  revenueCode, currency, amount,          // amount = decimal exato
  status: "OPEN" | "CONSUMED" | "SUPERSEDED" | "BLOCKED",
  targetCompetence: string | null,
  consumedByAggregationId: string | null,
  consumedAt: string | null,
  ruleId, ruleVersion, fingerprint, createdAt
}
```

## Regras

1. **Imutabilidade**: entradas nunca são reescritas nem apagadas; correções
   geram `SUPERSEDED`.
2. **Identidade idempotente**: `(sourceObligationId, ruleId, ruleVersion)` é
   única — re-materialização não duplica.
3. **Mesmo código de receita**: a entrada só combina com agregações do mesmo
   `revenueCode`.
4. **Consumo explícito e exatamente-uma-vez**: apenas entradas `OPEN`
   participam; o consumo marca `CONSUMED` + `consumedByAggregationId` +
   `consumedAt` de forma atômica (all-or-nothing).
5. **Nunca zero**: um valor abaixo do mínimo nunca é convertido em `0`.
6. Valores como strings decimais exatas; competências civis `YYYY-MM`.
