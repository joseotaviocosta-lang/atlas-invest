# ADR-260: Resolução de Conflitos de Input Tributário

## Status

Aceito (Fase 4B.4)

## Contexto

Inputs divergentes (importado vs manual) não podem ser sobrescritos
silenciosamente nem resolvidos por prioridade implícita.

## Decisão

1. No conflito, o candidato é registrado em `provenance.conflictingCandidate`.
2. Resolução explícita: `KEEP_EXISTING` ou `ACCEPT_NEW`.
3. `ACCEPT_NEW` aplica o candidato e move o valor anterior para `provenance.history`.
4. `resolution` (`action`, `resolutionSource`, `resolvedAt`) é persistida.
5. Registros originais são preservados; sem delete.
6. Cross-user → 404.
7. Resolução é decisão do usuário/aplicação, não lei tributária.

## Consequências

- Auditoria completa; nenhuma perda de proveniência.
- Conflito deixa de rebaixar a prontidão após resolvido.
