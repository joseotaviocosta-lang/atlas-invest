# Visão Geral da Arquitetura — Project Atlas

## 1. Visão Geral

O **Project Atlas** é estruturado sob o paradigma de **Modular Monolith em Monorepo** (pnpm workspaces + Turborepo), garantindo máxima coesão de domínio, isolamento estrito de responsabilidades e barreira intransponível entre cálculo financeiro e interface gráfica.

```text
+---------------------------------------------------------------------------------------------------+
|                                       CLIENTES & APRESENTAÇÃO                                     |
|   +---------------------------------------+       +-------------------------------------------+   |
|   |          apps/mobile (Expo)           |       |            apps/web (Next.js 15)          |   |
|   |   - React Native + Expo Router        |       |   - App Router (React Server/Client)      |   |
|   |   - Bearer Auth via SecureStore       |       |   - BFF Handlers (/api/auth/*)            |   |
|   |   - In-memory Access Token            |       |   - HttpOnly Lax Secure Cookies           |   |
|   +---------------------------------------+       +-------------------------------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v (HTTP / REST + JSON / OpenAPI)
+---------------------------------------------------------------------------------------------------+
|                                      CAMADA DE API / APLICAÇÃO                                    |
|                                         apps/api (NestJS)                                         |
|   - Controllers REST (/api/v1/auth, /portfolios, /accounts, /transactions)                        |
|   - Throttler Guard (Rate Limiting por IP e Endpoint)                                             |
|   - JwtAuthGuard & User Context Extraction (Principal Autenticado)                                |
|   - Global Exception Filter & RFC 7807 Problem Details                                            |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                   SERVIÇOS DE APLICAÇÃO & REPOSITÓRIOS                            |
|   - Application Services: AuthService, PortfolioService, AccountService, TransactionService       |
|   - Repositories: UserRepository, SessionRepository (CAS Lock FOR UPDATE), PortfolioRepository... |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                       CORE DOMAIN & MOTORES                                       |
|   +-------------------------------------------------------------------------------------------+   |
|   |                                  packages/domain (Core)                                   |   |
|   |   - Value Objects: Money (Decimal string), Quantity, Asset, LocalDate, Currency           |   |
|   |   - Entidades: User, Portfolio, Account, Transaction, Session                             |   |
|   |   - Zero dependências de UI, ORM ou frameworks externos                                   |   |
|   +-------------------------------------------------------------------------------------------+   |
|   +--------------------------+   +--------------------------+   +-----------------------------+   |
|   | packages/portfolio-engine|   |  packages/tax-engine     |   | packages/performance-engine |   |
|   +--------------------------+   +--------------------------+   +-----------------------------+   |
|   +--------------------------+   +--------------------------+   +-----------------------------+   |
|   |   packages/market-data   |   |    packages/news-data    |   |     packages/ai-engine      |   |
|   +--------------------------+   +--------------------------+   +-----------------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                     INFRAESTRUTURA DE DADOS                                       |
|                                  packages/database (PostgreSQL)                                   |
|   - Prisma ORM 6 & PostgreSQL Ledger Imutável (NUMERIC(28,18) e NUMERIC(38,18))                  |
|   - Row-level Lock Authority (SELECT ... FOR UPDATE) para CAS de Sessões Multi-Instância         |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                                      CROSS-CUTTING CONCERNS                                       |
|   - @atlas/validation: Schemas Zod universais e DTOs tipados.                                     |
|   - @atlas/logger: Logging estruturado Pino com sanitização estrita de credenciais e tokens.      |
|   - @atlas/ui: Design tokens semânticos, contratos visuais e formatters BigInt de alta precisão.  |
|   - @atlas/config: Gestão determinística de variáveis de ambiente.                               |
+---------------------------------------------------------------------------------------------------+
```

## 2. Regras Rígidas de Dependência e Isolamento

1. **Agnosticismo Total do Domínio:** `packages/domain` não conhece banco de dados, ORM, React, Expo, NestJS ou HTTP. Contém exclusivamente regras de negócio puras, entidades ricas e Value Objects invariantes.
2. **Isolamento de Banco de Dados:** `apps/mobile` e `apps/web` **NUNCA** acessam o banco de dados diretamente; toda comunicação é mediada pela API ou BFF.
3. **Desacoplamento entre Cálculo e Formatação:** Motores financeiros (`portfolio-engine`, `tax-engine`, `performance-engine`) **NUNCA** importam `@atlas/ui` ou formatadores visuais. Formatação é uma responsabilidade exclusiva da camada de apresentação (`formatting ≠ calculation`).
4. **Precisão Numérica Arbitrária:** Cálculos e persistência utilizam strings numéricas exatas com escala de até 18 casas decimais (`NUMERIC(28,18)` para valores monetários e `NUMERIC(38,18)` para quantidades). Ponto flutuante binário IEEE 754 é expressamente proibido para cálculos financeiros.

## 3. Transaction Ledger como Fonte da Verdade

O Project Atlas adota o **Transaction Ledger (Livro de Transações Imutável)** como a fonte única da verdade:

```text
Transactions / Events
        ↓
Portfolio Engine
        ↓
Derived State (Position, average cost, realized gain, snapshots)
```

Toda posição patrimonial, preço médio ou métrica de rentabilidade é derivada determinística a partir do histórico de eventos, garantindo auditabilidade contábil e fiscal completa.

Para maiores detalhes sobre entidades, primitivas financeiras e eventos, consulte o documento [Modelo de Domínio](file:///c:/Projetos/atlas-invest/docs/architecture/domain-model.md).
