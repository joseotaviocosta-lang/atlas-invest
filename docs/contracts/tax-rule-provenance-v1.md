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

O repositório **não** contém regra de produção oficialmente verificada. O
registro de produção é vazio; toda apuração com atividade falha fechada
(`MISSING_RULE_SET`) até que uma regra `VERIFIED` com fonte oficial seja
adicionada. Nenhum valor de lei é inventado.
