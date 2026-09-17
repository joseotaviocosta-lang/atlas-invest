# Project Atlas

Plataforma completa de gestão de investimentos para investidores brasileiros.

> **Status Atual: Fase 1F — Transfers, Historical Consolidation & Replay Hardening (Concluída)**  
> Esta fase implementa transferências explícitas de custódia entre contas via `transferGroupId` (zero heurística, ADR-057), preservação integral de base de custo e invariantes patrimoniais em pares casados (ADR-058), política de pernas desemparelhadas com degradação controlada para `costBasisStatus: 'INCOMPLETE'` (ADR-059), contrato de replay histórico com prefix consistency, append consistency e invariância de permutação (ADR-060), e hardening de desempenho com benchmarks sintéticos de 1k, 10k e 50k transações em sub-segundo (~480ms) sem deriva numérica (ADR-061) no núcleo determinístico do Project Atlas (`@atlas/portfolio-engine` v1.0.0-alpha.6).

---

## 1. Estrutura do Monorepo

O repositório é gerenciado com **pnpm** e **Turborepo** sob a arquitetura **Modular Monolith**:

```text
atlas-invest/
├── apps/
│   ├── api/                 # API backend (NestJS)
│   ├── mobile/              # Aplicativo mobile (Expo + React Native)
│   └── web/                 # Aplicação web (Next.js App Router)
├── packages/
│   ├── ai-engine/           # Contratos futuros de IA contextual
│   ├── config/              # tsconfigs e configurações compartilhadas
│   ├── database/            # Camada de persistência (PostgreSQL 16 / Prisma ORM)
│   ├── domain/              # Modelos, primitivas e transações do domínio financeiro
│   ├── logger/              # Logger estruturado com proteção contra vazamento de dados sensíveis
│   ├── market-data/         # Adaptadores futuros de cotações e mercado (B3)
│   ├── news-data/           # Ingestão futura de notícias financeiras
│   ├── performance-engine/  # Cálculos futuros de rentabilidade ponderada (TWR/MWR)
│   ├── portfolio-engine/    # Consolidação futura de carteira e posições
│   ├── tax-engine/          # Regras fiscais e tributárias futuras (DARF, IRPF)
│   ├── testing/             # Utilitários e asserções compartilhadas de teste
│   ├── ui/                  # Design tokens e contratos de interface
│   └── validation/          # Schemas e validação compartilhada
├── docs/
│   ├── architecture/        # Visão arquitetural, modelos de domínio e banco
│   ├── decisions/           # Arquitetura Decision Records (ADRs 001-035)
│   ├── development/         # Guias de teste e desenvolvimento local
│   ├── foundation/          # Relatórios de status e prontidão da fundação
│   ├── product/             # Escopo e roadmap de produto
│   └── security/            # Políticas e diretrizes de segurança
├── tests/
│   ├── architecture/        # Testes de fronteiras arquiteturais (test:architecture)
│   ├── auth/                # Testes de segurança e autenticação (test:auth)
│   ├── database/            # Testes de integração de banco de dados (test:database)
│   ├── domain/              # Testes unitários do modelo de domínio (test:domain)
│   ├── foundation/          # Testes de integridade da fundação (test:foundation)
│   ├── mobile/              # Testes da aplicação mobile (test:mobile)
│   ├── ui/                  # Testes de tokens e formatadores (test:ui)
│   └── web/                 # Testes unitários e E2E web (test:web, test:web:e2e)
└── .github/
    └── workflows/           # Pipeline de CI (GitHub Actions)
```

---

## 2. Pré-requisitos

- **Node.js**: `v20` ou `v22+` (recomendado LTS)
- **pnpm**: `v10+` ou `v12+` instalado globalmente (`npm install -g pnpm`)
- **Docker** e **Docker Compose** (ou PostgreSQL 16+ instalado localmente)
- **Git**

---

## 3. Instalação e Configuração do Banco de Dados

1. Clone o repositório e instale as dependências:

```bash
pnpm install
```

2. Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

3. Suba o serviço PostgreSQL via Docker Compose:

```bash
docker compose up -d postgres
```

4. Execute as migrações do banco de dados:

```bash
pnpm db:migrate
```

5. Opcional: Popule o banco com o seed de desenvolvimento inicial:

```bash
pnpm db:seed
```

---

## 4. Como Executar os Aplicativos

### 4.1. Executar a API (NestJS)

Porta padrão: `3001`

```bash
pnpm dev:api
```

Endpoint de verificação de saúde (liveness): `http://localhost:3001/health`  
Endpoint de verificação de prontidão do banco (readiness): `http://localhost:3001/ready`  
Documentação interativa da API (Swagger): `http://localhost:3001/docs`  
Especificação OpenAPI 3.0: `http://localhost:3001/docs-json`

### 4.2. Executar a Aplicação Web (Next.js)

Porta padrão: `3000`

```bash
pnpm dev:web
```

Acesse no navegador: `http://localhost:3000`

### 4.3. Executar o Aplicativo Mobile (Expo)

```bash
pnpm dev:mobile
```

Abra o leitor QR code no Expo Go (Android/iOS) ou pressione `a` para emulador Android ou `i` para simulador iOS.

---

## 5. Qualidade, Testes e Build

### Linting e Tipagem Estrita

```bash
pnpm lint
pnpm typecheck
```

### Formatação de Código (Prettier)

```bash
pnpm format:check
pnpm format
```

### Testes Automatizados

```bash
# Executar todos os testes unitários e de integração
pnpm test

# Domínio puro (regras financeiras, invariantes e Value Objects)
pnpm test:domain

# Banco de dados e persistência (PostgreSQL + Prisma)
pnpm test:database

# API REST NestJS (controllers, handlers, DTOs)
pnpm test:api

# Autenticação e Segurança (sessões, CAS lock, tokens, reuso, rate limit)
pnpm test:auth

# Aplicação Mobile (stores, navegação, secure storage)
pnpm test:mobile

# Aplicação Web (stores, cookies, CSRF, client API)
pnpm test:web

# Design System e Contratos Visuais (formatters BigInt, tokens)
pnpm test:ui

# Portfolio Engine Core (replay determinístico, ordenação, precisão, long-only)
pnpm test:portfolio-engine

# Suite Consolidada de Segurança
pnpm test:security

# Suite de Fronteiras Arquiteturais e Isolamento de Camadas
pnpm test:architecture

# Suite de Testes End-to-End (Playwright em navegador real: Desktop, Tablet, Mobile)
pnpm test:web:e2e

# Gate Completo de Validação da Fundação (Release Readiness)
pnpm validate:foundation
```

### Compilação / Build de Produção

```bash
pnpm build
```

---

## 6. Documentação Adicional

- [Regras de Desenvolvimento para Agentes de IA](file:///c:/Projetos/atlas-invest/AGENTS.md)
- [Status da Fundação e Escopo Diferido](file:///c:/Projetos/atlas-invest/docs/foundation/status.md)
- [Especificação Técnica do Portfolio Replay Engine](file:///c:/Projetos/atlas-invest/docs/engines/portfolio-engine.md)
- [Guia de Testes e Qualidade](file:///c:/Projetos/atlas-invest/docs/development/testing.md)
- [Visão Arquitetural](file:///c:/Projetos/atlas-invest/docs/architecture/overview.md)
- [Modelo de Domínio Financeiro](file:///c:/Projetos/atlas-invest/docs/architecture/domain-model.md)
- [Arquitetura do Banco de Dados](file:///c:/Projetos/atlas-invest/docs/architecture/database.md)
- [Arquitetura da API HTTP](file:///c:/Projetos/atlas-invest/docs/architecture/api.md)
- [Arquitetura de Autenticação & Segurança](file:///c:/Projetos/atlas-invest/docs/architecture/authentication.md)
- [Arquitetura Mobile](file:///c:/Projetos/atlas-invest/docs/architecture/mobile.md)
- [Especificação Técnica do Product Shell](file:///c:/Projetos/atlas-invest/docs/product/product-shell.md)
- [Documentação do Design System](file:///c:/Projetos/atlas-invest/docs/design-system/README.md)
- [Diretrizes de Segurança](file:///c:/Projetos/atlas-invest/docs/security/README.md)
- [Registros de Decisões Arquiteturais (ADRs 001-066)](file:///c:/Projetos/atlas-invest/docs/decisions/)
