# ADR-248: Estabilidade Histórica de Regras Tributárias

## Status

Aceito (Fase 4B)

## Contexto

A legislação muda. Recalcular um mês passado com a regra "de hoje" produziria
resultado divergente e não reproduzível.

## Decisão

1. O tratamento fiscal é determinado pela regra **efetiva na data** do fato
   gerador/competência.
2. Um mês calculado sob a regra V1 permanece reproduzível sob V1 mesmo após a
   introdução de V2.
3. Nenhuma regra futura altera resultado histórico.
4. Uma regra `VERIFIED` usada historicamente é imutável; nova lei → nova versão.
5. Não há fallback para a "regra mais recente" em cálculo histórico.
6. Sem vazamento de regra futura (testado explicitamente).

## Consequências

- Resultados históricos estáveis e auditáveis.
- Introdução de novas versões sem reescrever o passado.
