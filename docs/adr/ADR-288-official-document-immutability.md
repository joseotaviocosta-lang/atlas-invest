# ADR-288: Imutabilidade do Registro Oficial

## Status

Aceito (Fase 4F)

## Contexto

Registros de geração/handoff são fatos de auditoria; sobrescrevê-los apagaria a
trilha e poderia mascarar mudanças de preparação.

## Decisão

1. **Append-only**: registros nunca são sobrescritos nem apagados.
2. **Idempotência** por `(taxSubjectId, taxObligationId, fingerprint)`.
3. **Supersessão explícita**: nova preparação marca o anterior `SUPERSEDED` +
   `supersededById`.
4. **Documento oficial**: quando existir, é imutável; nova emissão cria novo
   registro (não nesta fase).
5. **Sem PDF local**: nenhum byte de documento oficial é gerado/armazenado nesta
   fase.

## Consequências

- Auditoria completa de cada preparação.
- Reprocessamento seguro e determinístico.
