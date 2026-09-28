# ADR-245: Regras de Produção Verificadas

## Status

Aceito (Fase 4B)

## Contexto

Alíquotas, isenções e limiares são definidos por lei. Hardcodá-los sem fonte
oficial verificada produziria cálculo incorreto e não auditável.

## Decisão

1. Todo comportamento fiscal material deriva de `TaxRuleSet` versionado e
   efetivo por data.
2. Somente regras `VERIFIED` podem produzir `taxDue` de produção.
3. Regras `TEST_ONLY` nunca produzem responsabilidade de produção (bloqueiam com
   `UNVERIFIED_RULE_SET`).
4. Regra `VERIFIED` exige proveniência oficial: `legalSourceId`, `effectiveFrom`,
   `verifiedAt`.
5. Sobreposição de vigência → configuração inválida; lacuna → `MISSING_RULE_SET`.
   Ambos bloqueiam.
6. Nenhum valor de lei é inventado. Se não houver fonte oficial, usa-se fixture
   `TEST_ONLY` apenas em testes.
7. O registro de produção atual é **vazio** (nenhuma regra oficial verificada);
   a apuração com atividade falha fechada.

## Atualização (Fase 4B.5)

O item 7 foi superado: **um bucket de produção foi ativado** após pesquisa oficial
fresca (2026-09-28).

- **Bucket ativado:** `FII_SALE` (alienação/resgate de cotas de FII).
- **Regra:** `BR-FII-SALE-20-2015` (status `VERIFIED`, versão `1.0.0`).
- **Proveniência:** `legalSourceId = IN-RFB-1585-2015-ART-37`; referência
  Lei 8.668/1993 art. 18 (red. Lei 9.779/1999), IN RFB 1.585/2015 art. 37 e § 2º,
  Lei 11.033/2004 art. 2º § 1º; `verifiedAt = 2026-09-28`.
- **Semântica:** 20% sobre o ganho realizado; prejuízo isolado por bucket;
  sem isenção; IRRF 0,005% apenas a partir de input canônico (ausência → PARTIAL).
- **Limitações:** demais buckets permanecem `UNSUPPORTED` (falha fechada);
  carryforward de excesso de retenção não modelado.

Validação: `validateTaxRuleProvenance` rejeita `VERIFIED` sem proveniência
(`legalSourceId`, `legalSourceReference`, `verifiedAt`).

## Consequências

- Nenhum valor legal inventado.
- Produção explicitamente incompleta e honesta até haver fonte oficial.
- Um bucket (`FII_SALE`) agora é apurável com base em fonte oficial vigente.
