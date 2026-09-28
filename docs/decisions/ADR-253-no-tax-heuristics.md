# ADR-253: Sem Heurísticas Tributárias

## Status

Aceito (Fase 4B.2)

## Contexto

Inferir fatos legalmente materiais a partir de dados insuficientes é a fonte mais
perigosa de erro fiscal.

## Decisão

1. Fato legal material só é representado a partir de input canônico explícito.
2. Proibido transformar ausência de dado em valor favorável ou desfavorável.
3. `UNKNOWN` permanece `UNKNOWN`; nunca vira `NORMAL`, `0`, `100`, `elegível` ou `inelegível`.
4. Ausência de input exigido mantém o resultado `PARTIAL`/`BLOCKED` (falha fechada).
5. O Tax Engine permanece a única autoridade de cálculo; a camada de input não calcula.

## Consequências

- Nenhum fato fiscal inventado.
- Comportamento previsível e auditável diante de dados ausentes.
