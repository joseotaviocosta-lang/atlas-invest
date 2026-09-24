# Project Atlas

Plataforma completa de gestão de investimentos para investidores brasileiros.

> **Status Atual: Fase 3P — Portfolio Intelligence Summary (Implementada) | Fase 3O — Scenario Analysis (Validada) | Fase 3N — Downside & Tail Risk (Validada) | Fase 3M — Rolling Analytics (Validada) | Fase 3L — Active Performance (Validada) | Fase 3K — Benchmark-Relative Risk (Validada) | Fase 3J — Risk-Adjusted Performance (Validada) | Fase 3I — Risk Metrics Foundation (Validada) | Fases 2A-2F / 3A-3H (Concluídas)**
> Fases concluídas: 2A-2F (MVP), 3A (Market Data), 3B (Valuation), 3C (Performance), 3D (Historical), 3E (Performance UX), 3F (Benchmark Foundation / IBOV `PRICE_INDEX`), 3G (CDI `RATE_SERIES` via BCB SGS 12, composição decimal exata, `benchmark=CDI` na API, comparativo por TWR em p.p. Web/Mobile com `AVAILABLE`/`PARTIAL`/`UNAVAILABLE`, zero client math), 3H (série cumulativa TWR server-side via `GET /api/v1/portfolios/:id/performance/series` com `performance-engine@0.2.0`, sampling `AUTO/DAILY/WEEKLY/MONTHLY` ≤400 pontos, alinhamento IBOV/CDI preservando semânticas nativas, gráfico histórico acessível Web/Mobile sem biblioteca nova, zero client financial math), 3I (`packages/risk-engine@0.1.0` puro/zero I/O: volatilidade realizada DAILY com variância amostral `n-1` e anualização `×sqrt(252)` decimal via Newton-Raphson, drawdown sobre wealth path TWR com pico/fundo/recuperação e convenção negativa, `GET /api/v1/portfolios/:id/performance/risk` com observações econômicas (Layer B: só datas com preço `EXACT`, sem zeros artificiais de fim de semana/feriado — ADR-132), seção `Risco histórico` Web/Mobile, zero client risk math), 3J (`risk-engine@0.2.0` aditivo: Sharpe `mean(excess)/stddev(excess)` amostral e Sortino `mean/downside` com denominador `n` documentado, ambos `×sqrt(252)`, zero denominador → `null`; `GET /api/v1/portfolios/:id/performance/risk-adjusted` com interseção TWR×CDI real, `RiskFreeProxy='CDI'` BRL-only, ratios serializados sem `%`, subseção `Retorno ajustado ao risco` Web/Mobile), 3K (`risk-engine@0.3.0` aditivo: Beta `cov(Rp,Rb)/var(Rb)`, correlação de Pearson `cov/(stdRp×stdRb)` limitada a `[-1,1]` com clamp de tolerância `1e-18`, tracking error `std(active)×sqrt(252)`, todos sobre intervalos econômicos IDÊNTICOS `(startDate, endDate)` — alinhar só pela data final é proibido; `GET /api/v1/portfolios/:id/performance/relative-risk?benchmark=IBOV` com IBOV `PRICE_INDEX` único benchmark de mercado, CDI rejeitado, USD `UNAVAILABLE`, provider Yahoo reusado em range fetch único, ratios sem `%` e tracking error com `%`, seção `Relação com o mercado` Web/Mobile), 3L (`risk-engine@0.4.0` aditivo: Jensen Alpha `Rp − [Rf + Beta×(Rm−Rf)]` do período (nunca anualizado), Information Ratio `mean(active)/trackingError` reutilizando exatamente o tracking error `n−1` da 3K e `×sqrt(252)`, Treynor `(Rp−Rf)/Beta` em percentage-per-beta; `GET /api/v1/portfolios/:id/performance/active` com inputs estritamente consistentes de período (`effectiveStart`/`effectiveEnd` idênticos para Rp/Rf/Rm/Beta), IBOV benchmark de mercado e CDI proxy de referência BRL, zero denominador → `null`, disponibilidade por métrica preservada (`PARTIAL`), USD `UNAVAILABLE`, seção `Desempenho ativo` Web/Mobile, zero client math), 3M (`risk-engine@0.5.0` aditivo: séries móveis de volatilidade, Beta e Sharpe sobre janelas de 20/60/120 OBSERVAÇÕES ECONÔMICAS — nunca dias civis, sem partial windows, `points=max(0, n−W+1)`; reutiliza exatamente as séries canônicas 3I/3J/3K sem duplicar fórmula nem realinhar; `GET /api/v1/portfolios/:id/performance/rolling?window=20|60|120` com 1 build de contexto + 1 range fetch IBOV + 1 range fetch CDI por request, zero I/O por ponto, BRL com as 3 séries e USD apenas volatilidade, zero denominador → `null`, seção `Evolução do risco` Web/Mobile com seletores de janela e métrica, zero client math), 3N (`risk-engine@0.6.0` aditivo: Downside Deviation alvo `0%` e Semideviação alvo `= média amostral` (ambas `sqrt(Σ·²/n)×sqrt(252)`), VaR/CVaR HISTÓRICOS empíricos com quantil nearest-rank congelado (`rank=ceil((1−c)×n)`, `95→n/20`, `99→n/100`), convenção de magnitude de perda não-negativa, CVaR = média exatamente das primeiras `rank` observações ordenadas (empates não expandem a cauda), mínimo 20 obs (95) / 100 obs (99), horizonte diário sem sqrt-time; `GET /api/v1/portfolios/:id/performance/tail-risk?confidenceLevel=95|99` com 1 build de contexto, sem IBOV/CDI, 1 sort por moeda/confiança, BRL/USD segregados, seção `Risco de cauda` Web/Mobile, zero client math), 3O (`@atlas/scenario-engine@0.1.0` puro/determinístico/zero I/O: stress test what-if sobre o valor de mercado — choque direto de ações elegíveis `STOCK/FII/ETF/BDR` `stressedPrice = basePrice×(1+shock/100)` com bounds `[-100%, +500%]`, choque de Ibovespa via Beta histórico 3K `estimatedReturn% = Beta × shock%` (sem fallback para 1), boundary de juros `RATE_SHOCK` UNSUPPORTED (sem `modifiedDuration` canônico, sem inventar sensibilidade) com aproximação linear por duration apenas se duração explícita, combinação com regra anti-dupla-contagem `equity + benchmark` → `400 SCENARIO.CONFLICTING_SHOCKS`; `POST /api/v1/portfolios/:id/performance/scenarios/run` com snapshot de valuation reutilizado (1 por request), sem mutar ledger/carteira, sem persistência, BRL/USD segregados, posições sem quote → `PARTIAL` + `unvaluedPositionCount`, seção `Simulação de cenários` Web/Mobile com presets/custom, zero client math, sem previsão/probabilidade), 3P (`@atlas/portfolio-intelligence@0.1.0` puro/zero I/O: agregação determinística dos read models de valuation/performance/benchmarks/risco/risco ajustado/risco relativo/active performance/tail risk/cenário em UM `Portfolio Intelligence Summary` multi-moeda sobre UM período efetivo compartilhado (default 1Y + inception clamp), com `dataQuality` estruturada (status + reason codes, sem score) e `observations` factuais determinísticas (ordem canônica, sem duplicatas, sem recomendação/juízo), cenário canônico `EQUITY_DOWN_10` hipotético reusando o snapshot de valuation; `GET /api/v1/portfolios/:id/intelligence/summary` com 1 replay, 1 contexto, ≤1 IBOV, ≤1 CDI, sem AI/LLM/score/ranking/FX; seção `Resumo da carteira` + `Destaques objetivos` Web/Mobile). Todos os gates passam.

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
│   ├── market-data/         # Market Data Provider v1 (Stooq, InMemory, cache, 40/40 tests)
│   ├── valuation-engine/    # Valuation atual (quantity×price, unrealized, multi-moeda, 20/20 tests)
│   ├── benchmark-engine/    # Benchmarks 0.2.0 (IBOV PRICE_INDEX, CDI RATE_SERIES/BCB SGS 12, puro/zero I/O)
│   ├── news-data/           # Ingestão futura de notícias financeiras
│   ├── performance-engine/  # Performance Foundation v1 (TWR/XIRR puros, 20/20 tests, sem histórico ⇒ UNAVAILABLE)
│   ├── portfolio-engine/    # Engine 1.0.0-rc.1 FROZEN (replay determinístico, 243 tests)
│   ├── risk-engine/         # Risk 0.6.0 puro/zero I/O (volatilidade, drawdown, Sharpe, Sortino, Beta, correlação, tracking error, Alpha, IR, Treynor, rolling analytics, downside/semideviação, VaR/CVaR históricos)
│   ├── scenario-engine/     # Scenario 0.1.0 puro/determinístico (stress testing what-if), zero I/O
│   ├── portfolio-intelligence/ # Intelligence 0.1.0 puro/zero I/O (agregação determinística + observations factuais + data quality)
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
- [Especificação da Carteira MVP (Overview Atual)](file:///c:/Projetos/atlas-invest/docs/product/portfolio-mvp.md)
- [Documentação do Design System](file:///c:/Projetos/atlas-invest/docs/design-system/README.md)
- [Diretrizes de Segurança](file:///c:/Projetos/atlas-invest/docs/security/README.md)
- [Registros de Decisões Arquiteturais (ADRs 001-172)](file:///c:/Projetos/atlas-invest/docs/decisions/)
