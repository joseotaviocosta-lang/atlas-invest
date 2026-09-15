# ADR-010: PostgreSQL e Prisma ORM como Fundação de Persistência

## Status

Aprovado

## Contexto

O Project Atlas exige uma infraestrutura de banco de dados robusta, transacional (ACID), com integridade referencial rigorosa e suporte a alta precisão numérica para ativos e transações financeiras. Avaliamos bancos relacionais (PostgreSQL, MySQL) e abordagens de acesso a dados em TypeScript (Prisma ORM, Drizzle, Kysely, TypeORM).

## Decisão

1. Adotamos o **PostgreSQL 16** (com compatibilidade testada no PostgreSQL 18) como mecanismo de banco de dados relacional oficial.
   - Amplo suporte em provedores gerenciados de nuvem (AWS RDS, Supabase, Neon, Cloud SQL).
   - Tipagem nativa de alta precisão (`NUMERIC(38,18)`), suporte a `DATE` civil e `TIMESTAMPTZ` com microssegundos.
   - Restrições de integridade referencial com chaves compostas e índices parciais.
2. Adotamos o **Prisma ORM** como ferramenta de modelagem de schema, geração de migrations tipadas e engine de consulta.
3. Adotamos uma arquitetura de **Repositórios Puros desacoplados**:
   - As entidades e Value Objects de `@atlas/domain` nunca herdam de classes do Prisma (nada de Active Record).
   - Mapeadores explícitos (`AssetMapper`, `TransactionMapper`, etc.) isolam a representação do banco do modelo de negócio.
   - O Prisma Client nunca é exposto fora de `@atlas/database`.

## Consequências

- **Positivas:**
  - Migrations declarativas com rastreabilidade completa no Git (`prisma/migrations`).
  - Schema centralizado e legível em `schema.prisma`.
  - Type-safety ponta a ponta na camada de infraestrutura.
- **Negativas / Mitigações:**
  - Necessidade de mapeadores bidirecionais entre os modelos do Prisma e as classes do Domínio. Isso é intencional e protege o Domínio de vazamento de ORM.
