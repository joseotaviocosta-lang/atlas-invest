# ADR-281 (4J1-D): Honest-Null ruleVersions for Versionless 4H Modules

## Status

Aceito (Fase 4J.1)

## Contexto

Apenas o relatório de posições anuais (`version`) e a avaliação de alta renda
(`ruleVersion`) expõem uma versão de regra. Os módulos de mercado de capitais
(4H.3), rendimentos (4H.4) e prontidão/evidências (4H.5) não têm campo de versão.

## Decisão

1. `UnifiedRuleVersions` carrega `annualPositions` e `highIncome` quando
   disponíveis e `null` honesto para `capitalMarkets`, `investmentIncome` e
   `readinessEvidence` — nunca um marcador fabricado.
2. O marcador de origem estável desses módulos é o próprio `fingerprint` por
   módulo, que já captura mudanças de revisão.
3. A canonicalização de fingerprint serializa esses `null` de forma
   determinística (`stableStringify`), fixada por teste unitário.

## Consequências

- O fingerprint anual é reprodutível e não depende de versões inexistentes.
- `ruleVersions` alimenta apenas o fingerprint/estado interno; não é exposto no
  corpo HTTP em 4J.1.
