# ADR-255: Idempotência e Conflitos de Inputs Tributários

## Status

Aceito (Fase 4B.3)

## Contexto

Reimportações e entradas manuais podem repetir ou divergir. Sobrescrever
silenciosamente corromperia a auditoria.

## Decisão

1. Duplicata = mesma identidade + mesmo fingerprint → idempotente (uma linha).
2. Conflito = mesma identidade + fingerprint diferente → `CONFLICT`, sem sobrescrever.
3. A `unique constraint` do banco é a barreira final de concorrência: criações paralelas convergem para uma linha.
4. Conflito torna a prontidão relevante `PARTIAL` (nunca `COMPLETE`).
5. Resolução de conflito é fase futura; permanece bloqueante.

## Consequências

- Nenhuma duplicação e nenhuma sobrescrita silenciosa.
- Conflitos explícitos e auditáveis.
