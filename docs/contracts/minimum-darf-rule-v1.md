# Contrato: MinimumDarfRuleSet v1 (Fase 4E)

Regra versionada do valor mínimo de recolhimento por DARF (Lei nº 9.430/1996,
art. 68, caput e § 1º; IN SRF nº 82/1996, arts. 1º-2º; Decreto nº 9.580/2018
(RIR/2018), art. 757, §§ 4º-5º) (ADR-278).

## Estrutura

```
{
  ruleId: "BR-FEDERAL-MINIMUM-DARF-10",
  version: "1.0.0",
  minimumAmount: "10",           // decimal exato, nunca float
  currency: "BRL",
  effectiveFrom: "1997-01-01", effectiveTo: null,
  comparison: "STRICTLY_LESS_THAN_IS_BELOW",
  sameRevenueCodeRequired: true,
  carryForwardAllowed: true,
  deferredDueDatePolicy: "TARGET_COMPETENCE_DEADLINE",
  revenueCodes: ["6015"],        // allow-list por código de receita
  sourceIds, sourceDocument, sourceReference, verifiedAt,
  status: "VERIFIED"
}
```

## Regras

1. **Comparação**: `valor < mínimo` ⇒ abaixo do mínimo; `valor >= mínimo` ⇒
   pagável. Igualdade é pagável ("igual ou superior").
2. **Mesmo código de receita**: obrigatório ("de mesmo código"); agregação
   cruzada entre códigos é proibida.
3. **Carência de competência**: valores abaixo do mínimo são adicionados ao
   mesmo código nos períodos subsequentes.
4. **Vencimento**: o valor acumulado vence no prazo do **último** período de
   apuração (o período em que o total atinge o mínimo).
5. **Resolução determinística**: regra resolvida por código de receita + data
   (efetiva, `VERIFIED`). Zero regras ⇒ `MISSING_MINIMUM_RULE`; mais de uma ⇒
   `AMBIGUOUS_MINIMUM_RULE` (falha fechada).
6. Nenhuma alíquota/limite legal fora da regra versionada; sem float.
