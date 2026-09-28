# Contrato: TaxRuleSet v1 (Fase 4A)

Conjunto de regras fiscais versionado e efetivo por data (ADR-237). Nenhum percentual,
limite de isenção ou condição legal é espalhado pelo código de aplicação.

## Estrutura

```
{
  id: string,
  jurisdiction: string,        // 'BR' na fundação
  version: string,
  effectiveFrom: LocalDate,    // YYYY-MM-DD
  effectiveTo?: LocalDate,     // ausente = vigência aberta
  status: 'TEST_ONLY' | 'VERIFIED' | 'RETIRED',
  source?: {
    legalSourceId: string,
    legalSourceReference?: string,
    verifiedAt?: string
  }
}
```

## Status

- `TEST_ONLY`: fixtures de teste; **nunca** produzem responsabilidade de produção.
- `VERIFIED`: única categoria apta a produzir responsabilidade de produção (Fase 4B).
- `RETIRED`: versão histórica, fora de vigência futura.

## Resolução

`resolveTaxRuleSet(ruleSets, jurisdiction, date)`:

1. Filtra por jurisdição e vigência na data (`effectiveFrom <= date <= effectiveTo?`).
2. Zero candidatos → `{ ok: false, code: 'MISSING_RULE_SET' }` (falha fechada).
3. Mais de um candidato → `{ ok: false, code: 'AMBIGUOUS_RULE_SET' }` (config inválida).
4. Exatamente um → `{ ok: true, ruleSet }`.

## Validação de registro

`validateTaxRuleSetRegistry(ruleSets)`:

- Ids duplicados → erro.
- `effectiveFrom > effectiveTo` → erro.
- Sobreposição de vigência na mesma jurisdição → erro.

## Invariantes

1. Nunca selecionar regra "mais próxima" heurísticamente.
2. Regra `VERIFIED` usada historicamente é imutável.
3. Regra ausente → `BLOCKED`; regra sobreposta → config inválida.
4. Fase 4A usa somente fixtures `TEST_ONLY`; não há cobertura legal de produção.
