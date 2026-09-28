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

## Consequências

- Nenhum valor legal inventado.
- Produção explicitamente incompleta e honesta até haver fonte oficial.
