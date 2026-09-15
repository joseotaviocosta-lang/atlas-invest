# Project Atlas

Plataforma completa de gestão de investimentos para investidores brasileiros.

> **Status Atual: Fase 0A — Repository Foundation**  
> Esta fase implementa a base técnica, arquitetura de monorepo, tooling compartilhado e shells dos aplicativos sem lógica financeira ativa.

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
│   ├── database/            # Camada de banco de dados (PostgreSQL/Prisma - Fase 0C)
│   ├── domain/              # Modelos e regras de domínio agnósticas de framework
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
│   ├── architecture/        # Visão arquitetural e diagramas
│   ├── decisions/           # Arquitetura Decision Records (ADRs)
│   ├── product/             # Escopo e roadmap de produto
│   └── security/            # Políticas e diretrizes de segurança
├── tests/
│   └── foundation/          # Testes de integridade da fundação (test:foundation)
└── .github/
    └── workflows/           # Pipeline de CI (GitHub Actions)
```

---

## 2. Pré-requisitos

- **Node.js**: `v20` ou `v22+` (recomendado LTS)
- **pnpm**: `v10+` ou `v12+` instalado globalmente (`npm install -g pnpm`)
- **Git**

---

## 3. Instalação

Clone o repositório e instale todas as dependências na raiz do projeto:

```bash
pnpm install
```

Configure o arquivo de variáveis de ambiente:

```bash
cp .env.example .env
```

---

## 4. Como Executar os Aplicativos

### 4.1. Executar a API (NestJS)

Porta padrão: `3001`

```bash
pnpm dev:api
```

Endpoint de verificação de saúde: `http://localhost:3001/health`

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
pnpm dev
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

### Testes Unitários

```bash
# Executar todos os testes do monorepo
pnpm test

# Executar especificamente a suite de validação da fundação
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
- [Diretrizes de Segurança](file:///c:/Projetos/atlas-invest/docs/security/README.md)
- [Registros de Decisões Arquiteturais (ADRs)](file:///c:/Projetos/atlas-invest/docs/decisions/)
