# ADR-015: Arquitetura da Camada HTTP em NestJS

## Status

Aprovado

## Contexto

A API backend do Project Atlas (`apps/api`) necessita expor os serviços financeiros fundamentais através de endpoints RESTful estruturados, previsíveis e com rigorosa separação de responsabilidades. Decisões arquiteturais anteriores estabeleceram que o domínio (`@atlas/domain`) e a camada de persistência (`@atlas/database`) devem permanecer desacoplados do protocolo HTTP.

## Decisão

1. **Separação em Camadas Limpas:**
   - **HTTP Controller:** Responsável exclusivamente pela terminação de rota, autorização de entrada, extração de cabeçalhos e delegação para o caso de uso. Não executa lógica de negócio nem queries de banco de dados.
   - **Application Service (Use Case):** Orquestra a execução da regra de aplicação, recuperando agregados dos repositórios, acionando métodos de domínio e persistindo alterações.
   - **Repository Contracts:** Injetados via Dependency Injection do NestJS utilizando tokens desacoplados (`Symbol('..._REPOSITORY')`), implementados por `@atlas/database`.
   - **Domain:** Modelos e invariantes imutáveis (`@atlas/domain`).
2. **Versionamento Estrito de Rotas:**
   - Todos os endpoints de negócio são expostos sob `/api/v1/*` (ex: `/api/v1/portfolios`, `/api/v1/institutions`, `/api/v1/transactions`).
   - Endpoints operacionais permanecem na raiz (`/health`, `/ready`, `/docs`, `/docs-json`).
3. **Imutabilidade do Ledger na Camada HTTP:**
   - Apenas `POST` e `GET` são disponibilizados para transações. Métodos `PUT`, `PATCH` e `DELETE` não são implementados, respondendo com `404 Not Found` para proteger o ledger imutável.
4. **Envelope de Resposta:**
   - Recursos individuais retornam `{ data: T }`.
   - Coleções com paginação por cursor retornam `{ data: T[], meta: { limit, cursor, nextCursor, hasMore } }`.

## Consequências

- **Positivas:**
  - Desacoplamento total: os use cases e repositórios podem ser executados via CLI, mensageria ou RPC sem alteração.
  - Testabilidade trivial: use cases e controllers podem ser testados de forma unitária ou integrada com substituição limpa de dependências.
- **Negativas / Mitigações:**
  - Maior quantidade de arquivos (`.controller.ts`, `.module.ts`, `.use-case.ts`, `.dto.ts`). Organização modular por funcionalidade mitiga qualquer dispersão.
