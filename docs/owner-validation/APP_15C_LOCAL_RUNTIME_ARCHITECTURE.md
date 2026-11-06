# PROJECT ATLAS — APP-15C: LOCAL API & POSTGRESQL DESKTOP RUNTIME ARCHITECTURE

## 1. Visão Geral e Princípio Arquitetural

O objetivo da fase **APP-15C** foi tornar o **Atlas Desktop Windows** operacionalmente autônomo na máquina local do Owner, mantendo a arquitetura em camadas limpas, integridade de dados e as invariantes financeiras do sistema.

```text
┌─────────────────────────────────────────────────────────┐
│               Atlas Desktop (Tauri / Win32)             │
│            Runtime: DESKTOP_LOCAL_OWNER                 │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (Loopback: 127.0.0.1:3001)
                            │ Header: x-atlas-client: desktop-local
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Atlas API Local (NestJS 11)                │
│    - GlobalExceptionFilter, Zod pipes, Use Cases        │
│    - JwtAuthGuard com Loopback Owner Bypass             │
│    - LocalOwnerBootstrapService (idempotente)           │
│    - Engines: Portfolio, Tax, Market Data               │
└───────────────────────────┬─────────────────────────────┘
                            │ Prisma ORM / TCP: 127.0.0.1:5434
                            ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL 18 Local (Porta 5434)           │
│    - Database canônico: atlas_local                     │
│    - 48 Migrations canônicas aplicadas                  │
│    - Ledger Append-Only, Constraints, Types UUID        │
└─────────────────────────────────────────────────────────┘
```

### Invariante Fundamental:
- **PROIBIDO:** Acesso direto do Desktop (Tauri) ao PostgreSQL. O frontend não executa Prisma nem comandos SQL diretos.
- **OBRIGATÓRIO:** Toda operação passa estritamente pela API NestJS local (`http://127.0.0.1:3001`), preservando validações Zod, ledger append-only, UUIDParamPipe e isolamento de recursos.

---

## 2. PostgreSQL Local (Porta 5434)

### 2.1 Auditoria da Instalação
- **Binários:** PostgreSQL 18.6 nativo em `C:\Program Files\PostgreSQL\18\bin`.
- **Porta:** 5434 (em estrita conformidade com a Regra 4.7 do `AGENTS.md` e histórico arquitetural do Atlas, preservando a porta legada 5432).
- **Cluster Dedicado:** `%LOCALAPPDATA%\Atlas\pg_data` (isolado de outros projetos ou clusters globais).
- **Database:** `atlas_local` (com espelho `atlas_dev`).
- **Autenticação:** Usuário `atlas`, escutando exclusivamente na interface loopback `127.0.0.1`.

### 2.2 Migrations Canônicas
- **Migrations Esperadas:** 48
- **Migrations Aplicadas:** 48
- **Novas Migrations Criadas:** 0 (zero)
- **Baseline de Migração:** 48 migrations aplicadas via `prisma migrate deploy` sem desvios de schema.
- **Tabelas Criadas:** 65 tabelas relacionais do sistema.

---

## 3. Identidade Técnica do Local Owner e Mapeamento de UUID

### 3.1 Desafio Arquitetural do UUID
No PostgreSQL, a coluna `users.id` possui o tipo de dados nativo `@db.Uuid`, e no `@atlas/domain` o primitive `UserId` exige validação regex RFC 4122 v4.
A string literal `'local-owner'` não é um UUID e causaria erro `invalid input syntax for type uuid` no banco de dados.

### 3.2 Constantes Canônicas Determinísticas
Para compatibilizar a identidade conceitual do Owner com as FKs relacionais sem violar o schema do banco:
- `LOCAL_OWNER_USER_ID`: `'00000000-0000-4000-8000-000000000001'` (UUID v4 válido)
- `LOCAL_OWNER_PORTFOLIO_ID`: `'00000000-0000-4000-8000-000000000002'` (UUID v4 válido)
- `LOCAL_OWNER_SESSION_ID`: `'00000000-0000-4000-8000-000000000003'`
- `LOCAL_OWNER_INSTITUTION_ID`: `'00000000-0000-4000-8000-000000000004'`
- `LOCAL_OWNER_ACCOUNT_ID`: `'00000000-0000-4000-8000-000000000005'`
- `LOCAL_OWNER_EMAIL`: `'owner@atlas.local'`
- `LOCAL_OWNER_NAME`: `'Owner'`

### 3.3 Bootstrap Idempotente (`LocalOwnerBootstrapService`)
Ao iniciar a API com `ATLAS_LOCAL_OWNER_MODE=true` (ou ambiente local):
1. Verifica se `LOCAL_OWNER_USER_ID` existe na tabela `users`; se ausente, cria o usuário técnico com senha desativada.
2. Verifica se a carteira padrão `LOCAL_OWNER_PORTFOLIO_ID` ("Carteira Principal") existe; se ausente, cria via `PortfolioRepository`.
3. Verifica se a instituição e conta de custódia padrão ("Custódia Principal") existem; se ausentes, provisiona de forma idempotente.
4. Reinicializações sucessivas não duplicam registros e executam em milissegundos sem efeitos colaterais.

---

## 4. Segurança e Proteção de Loopback (API Guard)

### 4.1 Cabeçalho e Validação Loopback
No modo `DESKTOP_LOCAL_OWNER`, o cliente Desktop injeta o cabeçalho:
```http
x-atlas-client: desktop-local
```
O guard global `JwtAuthGuard` intercepta a requisição:
1. **Inspeção de IP de Origem:** Valida se `req.ip` ou `socket.remoteAddress` pertence estritamente ao loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `localhost`).
2. **Rejeição Externa (Anti-Spoofing):** Se qualquer requisição vinda de IP externo enviar `x-atlas-client: desktop-local`, a API rejeita imediatamente com `401 Unauthorized` (`AUTH.LOOPBACK_ONLY`).
3. **Injeção do Principal:** Para requisições legítimas de loopback, o guard anexa o principal `{ userId: LOCAL_OWNER_USER_ID, sessionId: LOCAL_OWNER_SESSION_ID }`, sem emitir ou exigir falsos tokens JWT.
4. **Preservação de Rotas Remotas:** Qualquer requisição sem o cabeçalho loopback continua exigindo tokens `Bearer <JWT>` assinados via HMAC-SHA256 e validados contra a tabela de sessões.

---

## 5. Endpoints Validados na API Local (127.0.0.1:3001)

| Endpoint | Método | Autenticação Local | Resposta | Status |
| :--- | :---: | :---: | :---: | :---: |
| `/health` | GET | Pública | `{ status: "ok", service: "atlas-api" }` | **200 OK** |
| `/ready` | GET | Pública | `{ status: "ok", database: "connected" }` | **200 OK** |
| `/api/v1/portfolios` | GET | `x-atlas-client: desktop-local` | Lista contendo `Carteira Principal` do Owner | **200 OK** |
| `/api/v1/portfolios` | GET | *Sem cabeçalho* | Erro 401 `Missing authorization token` | **401 Unauthorized** |
| `/api/v1/portfolios/:id/state` | GET | `x-atlas-client: desktop-local` | Estado derivado do portfolio (`engineVersion: 1.0.0-rc.1`) | **200 OK** |
| `/api/v1/portfolios/:id/accounts` | GET | `x-atlas-client: desktop-local` | Lista contendo `Custódia Principal` | **200 OK** |
| `/api/v1/macro/context` | GET | `x-atlas-client: desktop-local` | Contexto macroeconômico Bacen/IBGE | **200 OK** |

---

## 6. Scripts de Orquestração do Runtime

Foram criados dois utilitários para inicialização descomplicada do ambiente pelo Owner:

1. **Script PowerShell (`scripts/start-desktop-local.ps1`):**
   - Testa se o PostgreSQL local na porta 5434 está respondendo; se não, inicia o processo de forma silenciosa.
   - Testa se a API local na porta 3001 está respondendo; se não, inicia com variáveis locais.
   - Parâmetro `-LaunchApp`: abre automaticamente o executável do Atlas Desktop instalado.
   - Comando NPM: `pnpm desktop:local`

2. **Launcher Node/TS (`scripts/desktop-local-runtime.ts`):**
   - Monitora conexões de socket TCP nas portas 5434 e 3001.
   - Inicia serviços sob demanda.
   - Comando NPM: `pnpm desktop:api`

---

## 7. Status e Homologação

- **Build Tauri Release:** Gerado com sucesso (`Atlas_0.1.0-pilot.1_x64-setup.exe`).
- **Instalação Local:** Atualizada no computador do Owner (`%LOCALAPPDATA%\Atlas\atlas-app.exe`).
- **Testes Unitários e de Integração:**
  - `tests/api/desktop-local-runtime.test.ts`: 10/10 testes aprovados.
  - `tests/app/*`: 217/217 testes aprovados em 13 suítes.
  - `tests/api-client/*`: 35/35 testes aprovados.
  - `@atlas/app typecheck`: 0 erros.
  - `@atlas/api typecheck`: 0 erros.
  - `cargo check`: Aprovado (1.93s).

**Status Final:** `APP_15C_LOCAL_DESKTOP_RUNTIME_COMPLETE`.
