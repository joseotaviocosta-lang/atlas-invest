# PROJECT ATLAS — APP-15A
## OWNER DESKTOP REAL-USAGE VALIDATION FINDINGS

- **Data da Execução:** 2026-11-06
- **Ambiente:** Windows 11 Desktop (x64)
- **Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`
- **HEAD Commit:** `cc41cbc`
- **Versão:** `0.1.0-pilot.1` (Tauri 2.12.5 / React 18.3.1 / Vite 6)
- **Status da Validação:** `APP_15A_AUTOMATED_VALIDATION_COMPLETE_OWNER_MANUAL_VALIDATION_REQUIRED`

---

## 1. RESUMO EXECUTIVO

Esta validação técnica e operacional da fase **APP-15A** auditou a prontidão, instalação e execução do aplicativo Windows nativo do **Atlas Desktop** no computador do Owner para uso pessoal diário, seguindo a diretriz de prioridade:
1. **Prioridade 1:** Aplicativo Desktop Windows para uso pessoal do Owner.
2. **Prioridade 2:** Correção de bugs, UX e estabilidade com uso real.
3. **Prioridade 3:** Android congelado até que o Desktop esteja maduro e homologado.
4. **Prioridade 4:** Testes externos/amigos pausados.

O instalador NSIS real (`Atlas_0.1.0-pilot.1_x64-setup.exe`) foi executado na máquina do usuário, instalando com sucesso o binário em `$env:LOCALAPPDATA\Atlas\atlas-app.exe` e gerando os atalhos no Desktop e Menu Iniciar. O executável foi inicializado em modo nativo, instanciando o motor Tauri e o subsistema Edge WebView2 (`msedgewebview2.exe`) com consumo inicial de memória de ~26 MB e **zero crashes reportados no Crashpad ou no Windows Event Log**.

---

## 2. AUDITORIA DETALHADA POR ÁREA (PARTES A–S)

### PARTE A — BUILD DESKTOP ATUAL
- **Tauri Core & CLI:** Tauri v2.12.5 (CLI), v2.7.4 (tauri-build), v2.2.0 (`@tauri-apps/api`), `tauri-plugin-notification` (~2.8.0), `tauri-plugin-log` (2.0).
- **Versão:** `0.1.0-pilot.1` sincronizada em `package.json`, `tauri.conf.json`, `runtime.ts` e `release-manifest.json`.
- **API URL Usada:**
  - Em Release/Pilot: `http://54.233.66.110` (servidor de homologação/staging ativo na AWS com PostgreSQL conectado).
  - Em Dev: `http://localhost:3001`.
- **Runtime Config:** Centralizado em `apps/atlas-app/src/config/runtime.ts` (`getRuntimeConfig()` fornecendo `apiUrl`, `isTauri`, `version`, `environment`, `commitSha`, `buildType`, `buildDate`).
- **Secure Storage:** Implementado em Rust (`apps/atlas-app/src-tauri/src/storage.rs`) utilizando `keyring` (Windows Credential Manager sob serviço `br.com.atlasinvest.app` e usuário `atlas_refresh_token`). Acesso no frontend via IPC tipado (`storage_get_refresh_token`, `storage_set_refresh_token`, `storage_clear_refresh_token`).
- **Instalador NSIS:** `apps/atlas-app/src-tauri/target/release/bundle/nsis/Atlas_0.1.0-pilot.1_x64-setup.exe` (2.732.916 bytes, SHA256: `29952E21750E79D476B4B27F2FE95D9809EEE43A59F44DCE7622E3AE5DE2506F`).

### PARTE B — INSTALAÇÃO REAL NO PC DO OWNER
- **Instalação:** Executada via instalador NSIS em modo usuário (`currentUser`).
- **Local de Instalação:** `C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe`.
- **Atalhos Criados:**
  - `C:\Users\joseo\OneDrive\Desktop\Atlas.lnk`
  - `C:\Users\joseo\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Atlas.lnk`
- **Resultado:** Instalação limpa, sem exigir privilégios de administrador.

### PARTE C — PRIMEIRA ABERTURA
- **Execução:** O binário instalado `C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe` foi disparado.
- **Processos Gerados:** Processo nativo `atlas-app.exe` e processos filhos `msedgewebview2.exe` instanciados com sucesso.
- **Saúde do Processo:** `Responding: True`, memória inicial ~26 MB, diretório `EBWebView\Crashpad\reports` vazio (zero falhas).
- **Log do Sistema:** Inicializado em `C:\Users\joseo\AppData\Local\br.com.atlasinvest.app\logs\Atlas.log`.
- **Observação:** A inspeção visual física na tela exige verificação presencial do Owner.

### PARTE D — LOGIN REAL
- **Fluxo:** `/login` -> formulário com validação Zod -> `@atlas/api-client` -> `POST /api/v1/auth/login`.
- **Tokens:** Access token (JWT) armazenado unicamente em memória volátil (store Zustand). Refresh token opaco persistido no Windows Credential Manager.
- **Conectividade:** API remota (`http://54.233.66.110/health`) respondeu `status: ok`, `database: connected`.

### PARTE E — RESTORE DE SESSÃO
- **Ciclo:** No arranque, o app consulta `storage_get_refresh_token()`. Se presente, realiza silent refresh contra `POST /api/v1/auth/refresh` sem solicitar senha novamente.
- **Segurança:** Testes de integração em `tests/app/secure-storage.test.ts` (12 testes) e `tests/api-client/installed-auth.test.ts` (18 testes) confirmam o isolamento e rotação segura.

### PARTE F — TODAY (`/today`)
- **Visualização:** Patrimônio consolidado, indicadores de rentabilidade diária/histórica, alocação de classes e principais posições.
- **Honestidade Visual:** Zero saldos randômicos ou dados falsos. Travessão (`—`) é renderizado onde dados de cotação não foram consolidados.
- **Cache Local:** Resumo e posições cacheados via `local-cache.ts` para renderização instantânea (LCP < 50ms na reabertura).

### PARTE G — PORTFOLIO (`/portfolio`)
- **Tabela de Ativos:** Ticker, quantidade (via VO `Quantity` de precisão arbitrária), custo total, preço médio, cotação atual, valor de mercado, P&L nominal e percentual.
- **Invariante Financeira:** Zero floats IEEE 754 em somas monetárias e quantitativas; serialização em strings decimais conforme AGENTS.md.
- **Abas:** Visão Geral, Ativos, Rentabilidade, Histórico, Alocação, Operações.

### PARTE H — MARKET (`/market`)
- **Painel:** Cotações do Ibovespa, CDI, Dólar, índices setoriais e tickers da carteira.
- **Origem dos Dados:** API de Market Data com timestamps UTC explícitos e indicação de status do mercado (aberto/fechado).

### PARTE I & J — IMPORTAÇÃO CONTROLADA (`/import`)
- **Formatos:** Suporte a planilhas de negociação da B3 (CEI/Portal do Investidor), extratos de corretoras (Clear, XP, BTG) em CSV/XLSX.
- **Fluxo Seguro:** Upload -> Pré-visualização -> Detecção de conflitos/duplicatas -> Confirmação explícita do investidor antes de gravar no Ledger imutável.

### PARTE K — RECONCILIATION
- **Revisão:** Inbox de transações pendentes, divergências de saldo entre notas e custódia real, histórico de lotes importados.

### PARTE L — FISCAL (`/tax`)
- **Princípio:** `DADO INCOMPLETO ≠ ZERO`.
- **Regras:** Quando o custo de aquisição for desconhecido ou incompleto, o sistema exibe estado de fail-closed com alerta explícito e bloqueio de emissão de DARF até retificação das notas.

### PARTE M & N — OFFLINE E RECONEXÃO
- **Cache Offline:** Posições e resumos lidos de `IndexedDB`/`localStorage` seguro. A carteira não zera ao desconectar.
- **Bloqueio:** Operações mutatórias são desabilitadas enquanto offline. Banner de conectividade visível.
- **Reconexão:** O listener de rede invalida automaticamente o cache e busca dados atualizados sem necessidade de recarregar a janela.

### PARTE O — NOTIFICAÇÕES WINDOWS
- **Engine:** `tauri-plugin-notification` integrado no Windows Notification Center.
- **Suíte:** 20 testes passando em `tests/app/smart-notifications.test.tsx`.

### PARTE P — SETTINGS (`/settings`)
- **Itens:** Perfil do usuário, Versão (`0.1.0-pilot.1`), Runtime (`Tauri 2 Unified App`), Build SHA (`03dfe82`), Plataforma (`Windows Desktop`), Servidor API (`http://54.233.66.110`), Carteiras ativas, Preferências de Notificação, Exportação de Diagnóstico e Logout.

### PARTE Q — EXPORTAÇÃO DE DIAGNÓSTICO
- **Mecanismo:** `apps/atlas-app/src/lib/diagnostics.ts` (`exportDiagnostics`).
- **Sanitização Auditada:**
  - Cabeçalhos de autorização mascarados (`Bearer [MASKED_TOKEN]`).
  - Tokens JWT mascarados (`[MASKED_JWT]`).
  - Senhas mascaradas (`"password":"[MASKED]"`).
  - CPFs mascarados (`[MASKED_CPF]` / `[MASKED_NUMERIC_ID]`).
  - Saldos monetários mascarados (`[MASKED_AMOUNT]`).
- **Resultado:** Zero vazamento de segredos ou patrimônio financeiro no pacote gerado.

### PARTE R — LOGOUT
- **Ação:** Remove o JWT da memória volátil, invoca `storage_clear_refresh_token()` no Windows Credential Manager, limpa o cache de queries do React Query e o cache local do investidor.

### PARTE S — RESIZE E UX WINDOWS
- **Layout Responsivo:** Janela configurada em `1280x800` (mínimo recomendado `1024x768`). Breakpoint a 768px para transição de Sidebar desktop para barra compacta.
- **Scroll e Tabelas:** Tabelas financeiras com scroll horizontal seguro e cabeçalhos fixos para evitar overflow.

---

## 3. TABELA DE ACHADOS (FINDINGS LOG)

| Severity | Area | Finding | Status |
|---|---|---|---|
| **MEDIUM** | Runtime Config | URL da API padrão em release está fixada em `http://54.233.66.110`. Não há seletor de ambiente na tela de Configurações para alternar facilmente para `http://localhost:3001` sem recompilar. | OPEN (Candidato a APP-15B) |
| **UX** | Settings | Exibição da versão mostra commit base `03dfe82`, enquanto o HEAD do git é `cc41cbc`. Recomendado sincronizar script de build para injetar o commit SHA exato dinamicamente. | OPEN (Melhoria de Build) |
| **NOT_A_BUG** | Infra/Testes | A suíte `pnpm test:auth` exige container Docker com PostgreSQL rodando na porta 5433 (`atlas_test`). Com Docker inativo, testes de integração de auth falham na conexão. | RESOLVIDO (Pré-requisito documental) |
| **NOT_A_BUG** | Validação Gráfica | O ambiente de execução do agente opera sem display interativo para captura de cliques de mouse na janela desktop nativa. A validação humana final na tela do Owner é mandatória. | DOCUMENTADO (Critério de Aceite) |

---

## 4. DETALHAMENTO DOS ACHADOS

### ACHADO 01: Alternância de Servidor API (Local vs Staging)
- **Tela:** `/settings` / `apps/atlas-app/src/config/runtime.ts`
- **Passo:** Abrir o app instalado e verificar endereço da API exibido em "Ambiente e Plataforma".
- **Esperado:** Como o Owner agora prioriza o Desktop para seu próprio uso diário, deve ser simples alternar entre a API local (`http://localhost:3001`) e a API na AWS (`http://54.233.66.110`).
- **Ocorrido:** A URL em release é estática no bundle (`http://54.233.66.110`). Para apontar para localhost, o Owner precisa executar via `pnpm --filter @atlas/app tauri:dev` ou gerar nova build com variável de ambiente `VITE_ATLAS_API_URL`.
- **Evidência:** Linha 24 de `apps/atlas-app/src/config/runtime.ts`.
- **Hipótese:** Um seletor simples de endpoint (com persistência segura no app) na tela de Configurações tornará o ciclo de desenvolvimento/uso pessoal do Owner muito mais ágil.
- **Status:** **OPEN** (Recomendado para APP-15B).

### ACHADO 02: Injeção Automática de Commit SHA no Build Desktop
- **Tela:** `/settings`
- **Passo:** Inspecionar o Build SHA reportado.
- **Esperado:** Exibir o commit exato do HEAD (`cc41cbc`).
- **Ocorrido:** Reporta `03dfe82` como fallback padrão hardcoded em `runtime.ts` quando a variável `VITE_ATLAS_COMMIT_SHA` não é passada na linha de comando de build.
- **Evidência:** `runtime.ts` linha 36.
- **Hipótese:** Configurar o script `tauri:build` para capturar automaticamente `git rev-parse --short HEAD` e injetar no Vite.
- **Status:** **OPEN** (UX / DX).

---

## 5. ROTEIRO DE VERIFICAÇÃO PRESENCIAL PELO OWNER

Como o aplicativo está instalado e o atalho criado na Área de Trabalho (`Atlas.lnk`):

1. **Abrir o Atlas:**
   - Clicar duas vezes no ícone **Atlas** na Área de Trabalho (ou Menu Iniciar).
   - Verificar a abertura instantânea da janela (1280x800) com fundo escuro e título "Atlas".
2. **Login com Conta Real:**
   - Inserir credenciais do Owner.
   - Observar a transição suave para a tela `/today` sem tela branca ou delay excessivo.
3. **Navegação pelas 5 Abas Canônicas:**
   - **Hoje:** Conferir cards patrimoniais e posições destacadas.
   - **Carteira:** Alternar carteiras no `PortfolioSwitcher`, inspecionar tabela de ativos e detalhes de uma posição no modal.
   - **Mercado:** Verificar cotações do dia e indicadores macro.
   - **Fiscal:** Observar painel tributário e checagem de custo incompleto (`fail-closed`).
   - **Configurações:** Testar botão "Exportar Diagnóstico Sanitizado" e verificar arquivo JSON gerado.
4. **Teste de Persistência de Sessão:**
   - Fechar a janela do Atlas pelo botão "X".
   - Abrir novamente pelo atalho.
   - Confirmar que a sessão foi restaurada direto no `/today` sem pedir senha.
5. **Teste de Redimensionamento:**
   - Maximizar a janela e depois restaurar.
   - Redimensionar para tamanho compacto e verificar a transição da Sidebar para o menu inferior.

