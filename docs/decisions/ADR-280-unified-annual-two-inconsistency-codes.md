# ADR-280 (4J1-C): Two Distinct Inconsistency Codes (inner 4I 400 vs outer unified 422)

## Status

Aceito (Fase 4J.1)

## Contexto

Tanto 4I quanto a camada anual unificada possuem cercas de reconstrução (fences)
contra TOCTOU. Confundir seus códigos de erro quebraria o contrato de leitura.

## Decisão

1. A cerca interna de 4I lança `BadRequestException` com código
   `FISCAL.SNAPSHOT_INCONSISTENT` (HTTP 400). O serviço unificado **captura
   especificamente esse erro** no carregamento de 4I e mapeia o módulo
   HIGH_INCOME para `BLOCKED` com `blockingReasons: ['UPSTREAM_SNAPSHOT_INCONSISTENT']`,
   preservando um estado coerente para os outros quatro módulos.
2. A cerca externa própria da camada unificada (reconstrução única sobre os
   fingerprints compostos) falha fechada com `UnprocessableEntityException`
   código `FISCAL.UNIFIED_ANNUAL_INCONSISTENT` (HTTP 422).
3. Os dois códigos são distintos e **nunca** devem ser confundidos.

## Consequências

- Um snapshot inconsistente em 4I bloqueia apenas o módulo de alta renda; o
  pacote ainda retorna um todo coerente.
- Uma mudança persistente das fontes sob a cerca unificada nunca emite um
  `READY` de estado misto; falha fechada com 422.
