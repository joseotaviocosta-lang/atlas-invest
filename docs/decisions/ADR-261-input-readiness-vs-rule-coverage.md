# ADR-261: Prontidão de Inputs vs Cobertura de Regras

## Status

Aceito (Fase 4B.4)

## Contexto

Confundir "dados completos" com "imposto apurado" é enganoso enquanto não há
regra de produção verificada.

## Decisão

1. Três estados independentes e exibidos separadamente:
   - Dados disponíveis (input readiness);
   - Regras tributárias disponíveis (`ruleCoverage`);
   - Apuração disponível (`liabilityStatus`).
2. Inputs completos **não** implicam regras disponíveis nem apuração disponível.
3. `productionTaxLiabilityEnabled` permanece `false` com zero regras verificadas.
4. `liabilityStatus = BLOCKED` enquanto `productionVerifiedRuleCount = 0`.
5. Copy factual; proibido "Imposto pronto".

## Consequências

- Honestidade visual e ausência de falsa completude.
- Separação preservada até a verificação oficial de regras.
