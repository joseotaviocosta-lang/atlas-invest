# ADR-198: Multi-Currency Isolation in Grounded Claims

## Status

Approved (Fase 3T)

## Contexto

O Project Atlas opera com isolamento cambial estrito (Zero Implicit FX). Cada carteira ou visão possui uma moeda base explícita (`BRL`, `USD`), e métricas monetárias de moedas distintas nunca devem ser somadas, comparadas ou misturadas sem taxa de câmbio explícita e auditada. No nível das afirmações geradas pela IA, esse princípio deve ser mantido com o mesmo rigor.

## Decisão

1. Cada afirmação (`GroundedClaimV1`) possui isolamento cambial validado em tempo de execução:
   - Se uma afirmação referencia múltiplos fatos monetários (`MONEY`), todos devem pertencer à mesma moeda canônica (`currency`).
   - É proibido criar uma afirmação com fatos em BRL e USD misturados sem especificação ou contexto multi-moeda aprovado.
2. Formatação explícita de moeda:
   - Toda renderização de valor monetário (`formatFactValueForDisplay`) inclui o prefixo da moeda de forma inequívoca (`R$` para BRL, `US$` para USD).
   - O validador rejeita qualquer tentativa de atribuir ou comparar grandezas monetárias heterogêneas dentro da mesma afirmação factual.

## Consequências

- Preservação da integridade cambial através de toda a pilha analítica até a camada de conversação de IA.
- Prevenção de ambiguidades e erros conceituais de conversão cambial na resposta ao usuário.
