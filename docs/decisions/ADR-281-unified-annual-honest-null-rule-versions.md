# ADR-281 (4J1-D): Honest-Null ruleVersions for Versionless 4H Modules

## Status

Aceito (Fase 4J.1)

## Contexto

Apenas o relatório de posições anuais (`version`) e a avaliação de alta renda
(`ruleVersion`) expõem uma versão de regra. Os módulos de mercado de capitais
(4H.3), rendimentos (4H.4) e prontidão/evidências (4H.5) não têm campo de versão.

## Decisão

1. `UnifiedRuleVersions.annualPositions` carrega o `version` do relatório de
   posições (dobrado deterministicamente — conjunto distinto de versões por
   portfólio, ordenado e unido) e `highIncome` carrega o `ruleVersion` da
   avaliação; ambos alimentam o fingerprint. Os três módulos versionless
   (`capitalMarkets`, `investmentIncome`, `readinessEvidence`) carregam `null`
   honesto — nunca um marcador fabricado.
2. O marcador de origem estável dos módulos versionless é o próprio
   `fingerprint` por módulo, que já captura mudanças de revisão.
3. A canonicalização de fingerprint serializa esses `null` de forma
   determinística (`stableStringify`), fixada por teste unitário.
4. Além do `ruleVersion`, o marcador de origem de `ANNUAL_POSITIONS` dobra um
   digest canônico do CONTEÚDO derivado das posições (quantidade, custo total e
   médio, identidade do ativo, status de completude/custo, aplicação e id da
   posição de abertura — nunca `generatedAt` nem o ledger bruto), de modo que uma
   mudança de conteúdo que preserve as contagens de resumo ainda altera o
   fingerprint e é detectada pela cerca externa.

## Consequências

- O fingerprint anual é reprodutível e não depende de versões inexistentes.
- `ruleVersions` alimenta apenas o fingerprint/estado interno; não é exposto no
  corpo HTTP em 4J.1.
