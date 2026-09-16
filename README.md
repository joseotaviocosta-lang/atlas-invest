# Project Atlas

Plataforma completa de gestão de investimentos para investidores brasileiros.

> **Status Atual: Fase 0G — Web Foundation**  
> Esta fase transforma o `apps/web` em uma aplicação web moderna e funcional sobre Next.js 15 (App Router) e React 19, com segurança de nível financeiro via padrão Backend-for-Frontend (BFF) com cookies `HttpOnly` seguros para o refresh token rotativo, `accessToken` em memória volátil, zero armazenamento de tokens no JavaScript do navegador (`localStorage`, `sessionStorage`, `IndexedDB`), sentinela de rotas no Edge Middleware, casca visual responsiva (Desktop Sidebar e Mobile Bottom Nav), gerenciamento de dados estruturais de carteiras com TanStack Query v5 e purga compulsória de cache cross-user.

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
│   ├── decisions/           # Arquitetura Decision Records (ADRs 001-014)
│   ├── product/             # Escopo e roadmap de produto
│   └── security/            # Políticas e diretrizes de segurança
├── tests/
│   ├── database/            # Testes de integração de banco de dados (test:database)
│   ├── domain/              # Testes unitários do modelo de domínio (test:domain)
│   └── foundation/          # Testes de integridade da fundação (test:foundation)
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

### 4.4. Executar Todos os Serviços Simultaneamente

```bash
pnpm dev:all
```

---

## 5. Qualidade, Testes e Build

### Linting

```bash
pnpm lint
```

### Typecheck (TypeScript Strict)

```bash
pnpm typecheck
```

### Formatação de Código (Prettier)

```bash
# Verificar formatação
pnpm format:check

# Corrigir formatação
pnpm format
```

### Testes Automatizados

```bash
# Executar todos os testes do monorepo (engines, domain, database, api e fundação)
pnpm test

# Executar a suite de testes de domínio (primitivas, entidades e invariantes)
pnpm test:domain

# Executar a suite de integração de banco de dados (PostgreSQL/Prisma)
pnpm test:database

# Executar a suite de autenticação e segurança (Argon2id, JWT, rotação, sessões e ownership)
pnpm test:auth

# Executar a suite de integração da API HTTP (NestJS/Supertest)
pnpm test:api

# Executar a suite de testes móveis (armazenamento seguro, auth store, single-flight refresh e carteiras)
pnpm test:mobile

# Executar a suite de testes web (cookies seguros, auth store, single-flight refresh, CSRF e carteiras)
pnpm test:web

# Executar a suite de validação da fundação arquitetural
pnpm test:foundation
```

### Compilação / Build de Produção

```bash
pnpm build
```

### Limpeza de Artefatos

```bash
pnpm clean
```

---

## 6. Documentação Adicional

- [Regras de Desenvolvimento para Agentes de IA](file:///c:/Projetos/atlas-invest/AGENTS.md)
- [Visão Arquitetural](file:///c:/Projetos/atlas-invest/docs/architecture/overview.md)
- [Modelo de Domínio Financeiro](file:///c:/Projetos/atlas-invest/docs/architecture/domain-model.md)
- [Arquitetura do Banco de Dados](file:///c:/Projetos/atlas-invest/docs/architecture/database.md)
- [Arquitetura da API HTTP](file:///c:/Projetos/atlas-invest/docs/architecture/api.md)
- [Arquitetura de Autenticação & Segurança](file:///c:/Projetos/atlas-invest/docs/architecture/authentication.md)
- [Arquitetura Mobile](file:///c:/Projetos/atlas-invest/docs/architecture/mobile.md)
- [Diretrizes de Segurança](file:///c:/Projetos/atlas-invest/docs/security/README.md)
- [Registros de Decisões Arquiteturais (ADRs 001-027)](file:///c:/Projetos/atlas-invest/docs/decisions/)
