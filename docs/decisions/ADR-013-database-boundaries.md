# ADR-013: Fronteiras Arquiteturais Estritas entre Persistência e Domínio

## Status

Aprovado

## Contexto

Em arquiteturas limpas (Clean Architecture / Hexagonal / Modular Monolith), a camada de domínio deve conter a lógica de negócio pura, isolada de frameworks, bancos de dados e ferramentas de terceiros.

## Decisão

1. A relação de dependência é estritamente unidirecional:
   - `@atlas/database` depende de `@atlas/domain`.
   - `@atlas/domain` **NUNCA** depende de `@atlas/database`, `@prisma/client`, `prisma` ou SQL.
2. O pacote `@atlas/database` expõe:
   - Interfaces de Repositório (`IAssetRepository`, `ITransactionRepository`, etc.).
   - Implementações de Repositório que aceitam e retornam exclusivamente tipos de domínio (`Asset`, `Transaction`, `Portfolio`, `Account`, `Institution`).
   - Mapeadores bidirecionais internos.
   - Erros tipados de persistência (`PersistenceError`, `DuplicateExternalTransactionError`, `CrossPortfolioIntegrityError`).
3. O pacote `@atlas/database` **NUNCA** exporta:
   - Instâncias ou tipos de `@prisma/client`.
   - Classes `Prisma.Decimal`.
   - Modelos de dados anêmicos gerados pelo ORM.
4. Qualquer aplicação ou engine que utilize `@atlas/database` interage exclusivamente através de contratos de repositório e tipos do domínio.

## Consequências

- **Positivas:**
  - O banco de dados pode ser migrado, substituído ou otimizado sem impactar o domínio.
  - Testes de regras de negócio permanecem unitários e ultrarrápidos, sem necessidade de banco de dados.
- **Negativas / Mitigações:**
  - Disciplina contínua verificada automaticamente por testes de fronteira em `tests/foundation/domain-rules.test.ts`.
