# ADR-293: API da Eleição de Compensação e Escopo pelo Principal Autenticado

## Status

Aceito (Fase 4G.2A.1b)

## Contexto

A eleição de compensação tributária (Fase 4G.2A.1a, ADR-292) precisa ser exposta
à aplicação. Um `taxSubjectId` aceito do cliente permitiria enumerar ou manipular
o escopo de outro investidor.

## Decisão

1. **Escopo derivado do principal**: `GET`/`PUT` de eleição resolvem o
   `taxSubjectId` exclusivamente a partir do usuário autenticado; o corpo aceita
   apenas `value`.
2. **Anti-enumeração por construção**: como não há endereçamento de sujeito de
   terceiros, tentativas de acesso a escopo alheio equivalem a `404` (nunca
   `403`, que revelaria existência).
3. **Competence canônica**: `YYYY-MM` validada por `parseFiscalCompetence`;
   inválida → `400 FISCAL.INVALID_COMPETENCE`.
4. **Valores explícitos**: `DECLARE_FOR_CARRYFORWARD` | `DO_NOT_DECLARE`; sem
   coerção → `400 FISCAL.INVALID_ELECTION_VALUE`.
5. **Idempotência e revisão**: mesmo valor → `created: false`; valor diferente →
   nova revisão imutável com `created: true`.
6. **Sem cálculo fiscal na API**: a camada HTTP apenas lê/persiste a eleição; o
   controller não acessa Prisma.

## Consequências

- Isolamento multi-tenant garantido sem confiar no cliente.
- Revisões auditáveis e idempotentes pela API.
- IRRF, 6015, mínimo DARF e DARF permanecem fora desta fase.
