# ADR-014: Estratégia de Testes de Integração de Banco de Dados

## Status

Aprovado

## Contexto

Testes de persistência necessitam validar queries reais, restrições de chave estrangeira, unicidade de índices e fidelidade numérica contra uma instância real do PostgreSQL. Mocks em memória não reproduzem comportamentos de locking, conversão de timezone de `@db.Date` ou restrições compostas.

## Decisão

1. **Banco Real em Todos os Ambientes:**
   - No CI (GitHub Actions), utilizamos um container de serviço `postgres:16-alpine`.
   - Localmente no Docker, utilizamos o serviço `postgres_test` ou `postgres` via `compose.yml`.
   - Localmente em desenvolvimento bare-metal Windows (quando o Docker não está ativo), fornecemos suporte transparente para inicializar uma instância isolada via `initdb`/`postgres.exe` na porta 5433.
2. **Isolamento entre Testes por Truncate Cascata:**
   - Antes de cada teste (`beforeEach`), executamos `TRUNCATE TABLE "transactions", "accounts", "portfolios", "assets", "institutions", "users" CASCADE;`.
   - Isso garante estado limpo sem custo de re-executar migrations a cada arquivo de teste.
3. **Execução Serial dos Arquivos de Banco:**
   - Configurado `fileParallelism: false` no `vitest.database.config.ts` para evitar condições de corrida no truncate compartilhado.
4. **Meta de Velocidade:**
   - Toda a suite de banco deve rodar em menos de 15 segundos (atualmente rodando em ~11.6s).

## Consequências

- **Positivas:**
  - Zero falsos positivos ou falsos negativos comuns de mocks.
  - Testes determinísticos, confiáveis e rápidos.
- **Negativas / Mitigações:**
  - Necessidade de PostgreSQL disponível para executar `pnpm test:database`. O fallback bare-metal documentado elimina atritos para desenvolvimento local.
