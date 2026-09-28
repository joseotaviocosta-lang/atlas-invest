# ADR-243: Compensação de Prejuízo Isolada por Categoria

## Status

Aceito (Fase 4B)

## Contexto

Prejuízos fiscais podem ter tratamento legal distinto por categoria. Compensar
indiscriminadamente entre categorias produziria resultado incorreto.

## Decisão

1. O saldo de prejuízo tem identidade `TaxSubjectId + TaxCategory + currency`.
2. Prejuízo de uma categoria **não** compensa outra, salvo regra `VERIFIED` que
   explicitamente permita (`lossCompensation.crossCategoryAllowed`). Isso não é
   implementado na 4B.
3. A progressão mensal é determinística: abertura(N+1) = fechamento(N),
   reconstruída por replay desde o início do histórico.
4. `closing = opening − lossApplied + lossGenerated`, exato.
5. Prejuízo nunca gera base ou tributo negativo.
6. Desconhecido ≠ zero: sem histórico conhecido, ganho positivo torna o
   resultado `PARTIAL` (`UNKNOWN_OPENING_LOSS_BALANCE`).

## Consequências

- Compensação correta e auditável por categoria.
- Sem contaminação cruzada silenciosa.
