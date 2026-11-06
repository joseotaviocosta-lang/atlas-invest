# PROJECT ATLAS — APP-15C-R1
# NATIVE LOCAL RUNTIME ORCHESTRATION REPORT

**Data:** 06 de Novembro de 2026  
**Ambiente:** Windows 11 x64 (PC Pessoal do Owner)  
**Executável:** `C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe`  
**Instalador NSIS:** `apps/atlas-app/src-tauri/target/release/bundle/nsis/Atlas_0.1.0-pilot.1_x64-setup.exe` (40.13 MiB)  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Status:** `APP_15C_R1_NATIVE_LOCAL_RUNTIME_COMPLETE`

---

## 1. Visão Geral e Objetivo

O objetivo da fase **APP-15C-R1** foi eliminar toda e qualquer dependência de terminal (`pnpm`, `PowerShell`, `VS Code`) para a inicialização e uso diário do **Atlas Desktop** no computador do Owner.

A meta inegociável foi atingida:
```text
Duplo clique em Atlas.exe (ou atalho Atlas.lnk na Área de Trabalho)
        ↓
Native LocalRuntimeManager no Tauri (Rust) assume o controle
        ↓
SingleInstanceGuard adquire Mutex Win32 (impede concorrência com o mesmo webview/banco)
        ↓
PostgreSQL 18 local (porta 5434, cluster %LOCALAPPDATA%\Atlas\pg_data) iniciado silenciosamente
        ↓
Atlas API local (porta 3001) iniciada silenciosamente via Node.js privado empacotado
        ↓
Endpoint GET /ready retorna 200 { status: "ok", database: "connected" }
        ↓
UI liberada instantaneamente em /today com a carteira do Owner carregada
```

---

## 2. Invariantes Arquiteturais Rígidos

| Invariante | Status | Detalhes |
|---|:---:|---|
| **Zero Acesso Direto Desktop -> DB** | **CUMPRIDO** | O frontend Desktop (React/Tauri) comunica-se **exclusivamente via HTTP** com `http://127.0.0.1:3001`. Nenhum ORM, Prisma Client ou driver de banco existe no cliente visual. |
| **Fail-Closed em Modo Local** | **CUMPRIDO** | Em `DESKTOP_LOCAL_OWNER`, **nunca** há fallback silencioso para a AWS (`54.233.66.110`). Se a API local ou banco falharem, a tela de diagnóstico `DiagnosticScreen` bloqueia com diagnóstico completo e opções seguras de retentativa/relatório. |
| **Zero TypeScript em Produção** | **CUMPRIDO** | O executável instalado não invoca `tsx` nem `ts-node`. O backend NestJS é compilado antecipadamente via `esbuild` para `bundle.cjs` (1.6 MB) e executado por um binário privado `node.exe` embutido. |
| **Zero Requisito de Node/pnpm Global** | **CUMPRIDO** | O runtime Node.js é distribuído nos resources do Tauri (`_up_\runtime\node.exe`), permitindo que a aplicação funcione em computadores que não possuem Node ou pnpm instalados globalmente. |
| **Imutabilidade do Schema de Banco** | **CUMPRIDO** | Nenhuma migration existente foi alterada. O baseline de 48 migrations aplicadas no database `atlas_local` permanece íntegro. |
| **Sem Janelas Pretas (Silent Exec)** | **CUMPRIDO** | Todos os processos filhos (`postgres.exe` e `node.exe`) são criados nativamente pelo Rust usando `CREATE_NO_WINDOW (0x08000000)` do Win32 API. |

---

## 3. Componentes Implementados

### 3.1. Orquestrador Nativo em Rust (`apps/atlas-app/src-tauri/src/runtime.rs`)
- **`SingleInstanceGuard`:** Utiliza `CreateMutexW` da Win32 API com nome `Global\Atlas_Desktop_SingleInstance_Mutex` para garantir que apenas uma instância orquestre o cluster de dados.
- **`LocalRuntimeManager::ensure_postgres`:** Localiza o executável em `C:\Program Files\PostgreSQL\18\bin\postgres.exe` e o diretório de dados `%LOCALAPPDATA%\Atlas\pg_data`. Caso a porta 5434 não esteja escutando, inicia o processo com `CREATE_NO_WINDOW`. O PostgreSQL fica pronto para aceitar conexões em < 600ms.
- **`LocalRuntimeManager::ensure_api`:** Localiza o `node.exe` e `bundle.cjs` empacotados nos resources do Tauri (`_up_\runtime`), normaliza caminhos Windows (removendo prefixos estendidos `\\?\` problemáticos para o Node.js CJS), injeta as variáveis de ambiente obrigatórias de produção/local owner (`DATABASE_URL`, `ATLAS_LOCAL_OWNER_MODE=true`, `EMAIL_PROVIDER=CONSOLE`, secrets de 32+ caracteres) e executa o processo com `CREATE_NO_WINDOW`.
- **Polling Ativo de `/ready`:** Sondagem HTTP em loopback a cada 600ms (timeout de 30s) aguardando o payload `{ status: "ok", database: "connected" }`.
- **`LocalRuntimeManager::shutdown`:** Ao fechar a janela do Desktop (`WindowEvent::CloseRequested`), o processo filho da API é encerrado de forma limpa. O PostgreSQL permanece ativo para reaberturas instantâneas (< 1s).

### 3.2. Empacotamento Autônomo (`scripts/build-api-bundle.ts` e `scripts/package-desktop-runtime.ts`)
- **`build-api-bundle.ts`:** Executa `esbuild` empacotando `apps/api/src/main.ts` e todos os pacotes do monorepo (`@atlas/domain`, `@atlas/database`, `@atlas/portfolio-engine`, `@atlas/tax-engine`, etc.) em um único arquivo `dist/bundle.cjs`.
- **`package-desktop-runtime.ts`:** Copia o binário oficial `node.exe` do Node 22 e as dependências nativas obrigatórias (`@prisma/client`, `.prisma` com `query_engine-windows.dll.node`, `argon2`, `@phc`, `node-gyp-build`) para a pasta de runtime do instalador (`apps/atlas-app/runtime/`).
- **`tauri.conf.json`:** Configurado com `"resources": ["../runtime/**/*"]` para inclusão automática no NSIS setup.

### 3.3. Telas Nativas e Gate de Inicialização (`apps/atlas-app/src/features/runtime/`)
- **`StartupScreen.tsx`:** Tela de inicialização com design token escuro do Atlas, spinner estilizado, indicador em tempo real das etapas (`Banco de dados local`, `Serviço de dados local`, `Integridade da carteira`) e barra de progresso animada.
- **`DiagnosticScreen.tsx`:** Tela à prova de falhas exibida caso o banco ou a API não fiquem prontos. Apresenta botões para "Tentar Novamente", "Copiar Diagnóstico", "Salvar Relatório de Diagnóstico" (download de JSON) e gaveta colapsável de logs técnicos de inicialização.
- **`useNativeRuntime.ts`:** Hook React com fallback seguro (em modo dev de navegador sonda diretamente `127.0.0.1:3001/ready`; em release invoca o comando nativo `runtime_start` do Tauri).
- **`ProtectedRoute.tsx`:** Modificado para interceptar requisições em modo `DESKTOP_LOCAL_OWNER`, garantindo que nenhuma tela do sistema seja renderizada antes do backend local estar 100% pronto.

---

## 4. Evidência de Execução em Produção

Ao iniciar o aplicativo instalado (`atlas-app.exe`), a orquestração realizou com sucesso o fluxo completo:

```text
[INFO] === Iniciando Local Runtime Orchestration ===
[INFO] SingleInstanceGuard adquirido com sucesso.
[INFO] Verificando status do PostgreSQL na porta 5434...
[INFO] Status update: pg=starting, api=idle, overall='starting', msg='Preparando banco de dados local...'
[INFO] Iniciando PostgreSQL: bin="C:\Program Files\PostgreSQL\18\bin\postgres.exe", data="C:\Users\joseo\AppData\Local\Atlas\pg_data"
[INFO] PostgreSQL pronto na porta 5434 em 500.6378ms
[INFO] Verificando status da API local em http://127.0.0.1:3001/ready...
[INFO] Status update: pg=running, api=starting, overall='starting', msg='Iniciando serviço de dados local do Atlas...'
[INFO] Iniciando API local: node="C:\Users\joseo\AppData\Local\Atlas\_up_\runtime\node.exe", bundle="C:\Users\joseo\AppData\Local\Atlas\_up_\runtime\api\bundle.cjs"
[INFO] Status update: pg=running, api=starting, overall='starting', msg='Verificando estrutura e conectividade do banco...'
[Nest] 32320 - LOG [NestApplication] Nest application successfully started +2045ms
[INFO] [Atlas API] Server bootstrap complete {"environment":"production","port":3001,"databaseTarget":"postgresql://127.0.0.1:5434/atlas_local","migrationBaseline":48}
[INFO] API local pronta e conectada ao banco em 2.45s
[INFO] Status update: pg=running, api=ready, overall='ready', msg='Atlas pronto para uso local'
```

Requisições atendidas imediatamente após a liberação da UI:
```text
GET /api/v1/portfolios/00000000-0000-4000-8000-000000000002/valuation 200 - 15ms
GET /api/v1/integration-reviews/count 200 - 60ms
GET /api/v1/macro/context 200 - 58ms
```

---

## 5. Resultados da Suíte de Testes

- **`vitest.app.config.ts` (`pnpm test:app`):** 14 arquivos de teste, **222 testes aprovados (100% PASS)**
- **Testes Específicos do Runtime Nativo (`tests/app/native-local-runtime.test.tsx`):**
  - `renders startup screen with all 3 stage indicators in idle state`: **PASS**
  - `renders fail-closed diagnostic screen on postgres error with retry button`: **PASS**
  - `renders fail-closed diagnostic screen with copy diagnostic report button`: **PASS**
  - `enforces local owner API URL invariant and does not fall back to remote AWS`: **PASS**
  - `formats diagnostic report with system, ports, and log entries`: **PASS**
- **Testes de Autenticação e Cliente API (`pnpm test:api-client`):** 2 arquivos de teste, **35 testes aprovados (100% PASS)**
- **Compilação Rust do Tauri (`cargo check`):** 0 erros, 0 warnings.

---

## 6. Conclusão

A fase **APP-15C-R1** concluiu a autonomia operacional do Atlas Desktop. O Owner pode reiniciar o Windows, dar duplo clique no atalho do Atlas e utilizar todas as funcionalidades analíticas, de portfólio e mercado sem tocar em nenhum terminal.
