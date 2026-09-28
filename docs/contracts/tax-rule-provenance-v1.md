# Contrato: TaxRuleProvenance v1 (Fase 4B)

Toda regra de produção carrega proveniência de fonte oficial (ADR-245).

## Estrutura

```
{
  id, jurisdiction, version, status,
  effectiveFrom, effectiveTo?,
  taxCategory?,
  source: { legalSourceId, legalSourceReference?, verifiedAt? },
  components: { ratePercentage?, exemptionGrossSalesThreshold?,
                lossCompensation?, withholding?, rounding? }
}
```

## Status

- `TEST_ONLY`: fixtures; **nunca** produzem responsabilidade de produção.
- `VERIFIED`: única categoria que pode produzir `taxDue` de produção.
- `RETIRED`: versão histórica fora de vigência.

## Regras

1. **Fonte oficial obrigatória** para `VERIFIED`: `legalSourceId`,
   `effectiveFrom` e `verifiedAt`.
2. **Imutabilidade:** uma versão `VERIFIED` usada historicamente não é mutada;
   nova lei → nova versão.
3. **Resolução efetiva:** por jurisdição + categoria + data; sem "regra mais
   recente" para cálculo histórico.
4. **Sobreposição** de vigência → configuração inválida (falha fechada).
5. **Lacuna** de regra → `MISSING_RULE_SET`; regra não verificada →
   `UNVERIFIED_RULE_SET`; ambos bloqueiam `taxDue`.

## Estado atual

Um bucket de produção foi ativado (Fase 4B.5): `FII_SALE`, regra
`BR-FII-SALE-20-2015` (`VERIFIED`, versão `1.0.0`), com proveniência oficial
(`legalSourceId = IN-RFB-1585-2015-ART-37`). Os demais buckets permanecem sem
regra `VERIFIED` e falham fechados (`MISSING_RULE_SET`). Regra `VERIFIED` sem
proveniência é rejeitada por `validateTaxRuleProvenance`.
