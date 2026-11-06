# PROJECT ATLAS — APP-15B
## LOCAL DESKTOP DEPENDENCY MAP & TARGET ARCHITECTURE

- **Data da Auditoria:** 2026-11-06
- **Ambiente:** Windows 11 Desktop (x64)
- **Modo de Operação:** `DESKTOP_LOCAL_OWNER`
- **Objetivo Estratégico:** Mapear todas as dependências funcionais do Atlas Desktop para viabilizar execução 100% autônoma no computador do Owner (sem dependência de VPS/nuvem para dados pessoais), restringindo a necessidade de internet unicamente a provedores de dados de mercado e cotações.

---

## 1. MATRIZ DE DEPENDÊNCIAS DO ATLAS DESKTOP

| Feature | Current Dependency | Can Become Local? | External Internet Required? | Classificação | Observações Arquiteturais |
|---|---|---|---|---|---|
| **Autenticação (Auth)** | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, JWT, Argon2id, Sessions table | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | No modo `DESKTOP_LOCAL_OWNER`, a identidade é determinística (`local-owner`). O app desktop não exige senha, token ou backend remoto para autenticação. |
| **Carteiras (Portfolios)** | `GET /api/v1/portfolios`, `GET /api/v1/portfolios/:id/valuation`, `GET /api/v1/portfolios/:id/allocation` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Leitura e consolidação das posições derivam diretamente do Ledger local via `PortfolioReplayEngine` (`@atlas/portfolio-engine`) acoplado ao PostgreSQL local. |
| **Transações & Ledger** | `POST /api/v1/portfolios/:id/transactions`, `GET /api/v1/portfolios/:id/history` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Ledger append-only imutável. Persistência em tabela `transactions` no PostgreSQL local com replay determinístico puro. |
| **Importações (Imports)** | `POST /api/v1/imports/preview`, `POST /api/v1/imports/confirm` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Parsers de planilhas B3 / CEI e extratos bancários em `@atlas/data-ingestion`. Execução de parse e validação em memória sem necessidade de rede. |
| **Conciliação (Reconciliation)** | `GET /api/v1/reconciliation/inbox`, `POST /api/v1/reconciliation/resolve` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Motor de conciliação compara transações locais e custódia informada. Pode operar inteiramente contra banco local. |
| **Fiscal & Tributário (Tax)** | `GET /api/v1/tax/monthly`, `GET /api/v1/tax/timeline`, `GET /api/v1/tax/cost-evidence` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Motor puro em `@atlas/tax-engine`. Apuração de DARF, prejuízos acumulados e conformidade IRPF executam em TypeScript puro sobre o ledger local. |
| **Notificações Inteligentes** | `NotificationProvider`, `tauri-plugin-notification`, `LocalCache` | **SIM (100%)** | **NÃO** | `LOCALIZABLE_NOW` | Motor `rule-engine.ts` roda no processo local do Tauri, avaliando prazos tributários e lembretes com identidade `local-owner`. |
| **Cotações de Mercado (Market Data)** | `GET /api/v1/market/quotes`, `GET /api/v1/market/macro`, Yahoo Finance / Brapi | **NÃO (Depende de Provedores)** | **SIM** | `EXTERNAL_DATA_PROVIDER` | Atualização de cotações em tempo real do Ibovespa, índices e ações exige conexão externa com APIs de dados de mercado. Em modo offline, opera com *last known good* via `LocalCache`. |
| **Integração B3 (Direta/Futura)** | Futuras APIs de Open Finance B3 / Pluggy / B3 Investidor | **NÃO (Serviço Externo)** | **SIM** | `EXTERNAL_DATA_PROVIDER` | No futuro, sincronização direta com a B3 exigirá tráfego de rede para consulta aos servidores das instituições financeiras. |

---

## 2. CLASSIFICAÇÃO DOS SERVIÇOS

### A. `LOCALIZABLE_NOW` (Prontos para Execução Local)
Estes serviços não possuem qualquer dependência essencial com computação em nuvem ou servidores centralizados. Podem ser hospedados integralmente no PC do Owner:
1. **Ledger & Estado Patrimonial:** Tabelas `portfolios`, `accounts`, `transactions`, `assets`.
2. **Portfolio Replay Engine:** Pure deterministic replay engine (`@atlas/portfolio-engine`) sem I/O.
3. **Tax Engine:** Regras fiscais e cálculo de DARF (`@atlas/tax-engine`).
4. **Ingestion & Reconciliation:** Importação de notas e extratos CSV/XLSX.
5. **Local Cache & Storage:** IndexedDB, SQLite ou arquivos locais para LCP rápido e visualização offline.
6. **Smart Notifications:** Centro de notificações integrado ao Windows 11.

### B. `EXTERNAL_DATA_PROVIDER` (Exigem Acesso à Internet)
Estes serviços requerem acesso externo à internet unicamente para obtenção de informações públicas do mercado financeiro:
1. **Cotações de Ativos:** Preço de fechamento e cotações intraday (ações B3, FIIs, BDRs, ETFs).
2. **Índices Macroeconômicos:** Selic, CDI, IPCA, Dólar PTAX.
3. **Eventos Corporativos Públicos:** Proventos anunciados, grupamentos, desdobramentos.

---

## 3. ARQUITETURA ALVO RECOMENDADA (DESKTOP PESSOAL)

```text
┌────────────────────────────────────────────────────────┐
│                   WINDOWS DESKTOP PC                   │
│                                                        │
│  ┌────────────────────┐         ┌───────────────────┐  │
│  │     Atlas.exe      │ ──IPC── │  Atlas API Local  │  │
│  │ (Tauri UI Desktop) │  HTTP   │  (Node / NestJS)  │  │
│  └────────────────────┘         └───────────────────┘  │
│            │                              │            │
│       LocalCache                    Prisma ORM         │
│            │                              │            │
│            ▼                              ▼            │
│    [IndexedDB Cache]             [PostgreSQL Local]    │
│                               (atlas_dev / port 5434)  │
└───────────────────────────────────────────┬────────────┘
                                            │
                                  Conexão Externa (HTTPS)
                                            │
                                            ▼
                             ┌───────────────────────────┐
                             │    PROVEDORES EXTERNOS    │
                             │ (Cotações, CDI, Yahoo/B3) │
                             └───────────────────────────┘
```

### Vantagens da Arquitetura Alvo:
1. **Privacidade Absoluta:** O patrimônio, transações e dados fiscais do Owner residem exclusivamente no disco rígido do seu computador local.
2. **Independência Operacional:** A aplicação abre instantaneamente e continua funcional mesmo sem internet ou caso o VPS remoto da AWS esteja desligado.
3. **Sem Custo de Servidor para Uso Pessoal:** O Owner não precisa manter instâncias pagas em nuvem apenas para gerenciar suas próprias finanças.

---

## 4. RECOMENDAÇÃO PARA A PRÓXIMA FASE

A auditoria confirma que **100% do core financeiro, fiscal e de carteira é perfeitamente localizável**.

Recomendação técnica:

```text
APP-15C — LOCAL API & POSTGRESQL DESKTOP RUNTIME
```

**Escopo sugerido para APP-15C:**
1. Configuração do launcher do Atlas Desktop para orquestrar ou conectar diretamente ao PostgreSQL local (porta 5434 `atlas_dev`).
2. Sincronização automática entre `Atlas.exe` e a API local em `http://localhost:3001`.
3. Validação dos fluxos completos de Ingestão de Notas e Cálculo Fiscal rodando de ponta a ponta na máquina do Owner.
