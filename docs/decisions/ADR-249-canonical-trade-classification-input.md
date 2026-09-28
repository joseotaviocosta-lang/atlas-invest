# ADR-249: Input Canônico de Classificação de Operação

## Status

Aceito (Fase 4B.2)

## Contexto

A tributação de equity distingue operação normal e day trade. Classificar sem
fonte canônica adequada produziria resultado legalmente incorreto.

## Decisão

1. A classificação (`NORMAL`/`DAY_TRADE`/`UNKNOWN`) é um input canônico, derivado
   ou auxiliar, com proveniência (`source`, `sourceReference`).
2. **Proibido** inferir `DAY_TRADE` por heurística (mesmo ativo + mesmo dia +
   BUY/SELL) sem semântica de casamento explicitamente suportada pelo modelo.
3. `UNKNOWN` é cidadão de primeira classe e nunca se converte em `NORMAL`.
4. Não reescreve o livro-razão imutável.
5. Enquanto o modelo canônico não contiver os campos necessários, a classificação
   permanece `UNKNOWN` e o bucket de equity dependente fica bloqueado.

## Consequências

- Nenhuma classificação legal inventada.
- O bucket de equity permanece honestamente não suportado até haver fonte canônica.
