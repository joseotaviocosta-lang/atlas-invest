# ADR-291: Installed Application Architecture (Tauri 2) & Multi-Platform Strategy

## Status
ACCEPTED

## Context
O Project Atlas foi inicialmente desenvolvido com uma arquitetura de aplicação web completa (Next.js 15 App Router no frontend, NestJS na API REST e PostgreSQL como banco de dados transacional). 

O Owner do projeto definiu uma mudança de direção estratégica:
1. O Atlas deve ser priorizado como **aplicativo instalado para uso pessoal e testes com amigos**;
2. As plataformas alvo prioritárias são:
   - **Windows Desktop** (análise aprofundada, importação de planilhas/extratos, conciliação e relatórios fiscais);
   - **Android** (monitoramento diário de patrimônio, rentabilidade e obrigações fiscais);
3. O site público e a versão Web/SaaS aberta em navegador não são prioridade neste momento, embora devam permanecer arquiteturalmente viáveis para o futuro;
4. O compartilhamento máximo de código de UI e lógica de apresentação é mandatório para evitar a duplicação dispendiosa entre desktop e mobile;
5. O PostgreSQL hospedado na nuvem (VPS Lightsail) deve permanecer como a **Única Fonte da Verdade (Single Source of Truth)** para o Transaction Ledger imutável e estado de posições.

Após detalhada auditoria do código-fonte (Fases de Discovery), constatou-se que:
- O frontend em `apps/web` é quase integralmente executado no lado do cliente (`'use client'`, `@tanstack/react-query`, `zustand`);
- Não existem Server Actions nem chamadas de dados restritas a Server Components;
- O backend NestJS (`apps/api`) é completamente desacoplado da Web, expondo 45 controllers REST padronizados sob `/api/v1/*`;
- A biblioteca `@atlas/ui` e os motores financeiros em `packages/*-engine` já são puros e agnósticos de plataforma visual.

## Decision

Fica aprovada a arquitetura baseada em **Tauri 2 como aplicação unificada (Unified App)** para Windows Desktop e Android:

1. **Tecnologia do Aplicativo Instalado:**
   - **Tauri 2:** Harness nativo em Rust que utiliza os WebViews nativos do sistema operacional (WebView2 no Windows e Android System WebView no Android).
   - **Camada de Apresentação:** React 18 + Vite + TypeScript + React Router.
   - **Gerenciamento de Estado de Servidor:** TanStack Query (`@tanstack/react-query`) para cache de consultas e revalidação transparente.
   - **Gerenciamento de Estado de Cliente:** Zustand para dados de sessão em memória e preferências de visualização.
   - **Cliente HTTP Compartilhado:** Criação do pacote `@atlas/api-client` desacoplado de navegadores, cookies e runtimes específicos.

2. **Preservação Integral do Backend:**
   - O backend existente em `apps/api` (NestJS) permanece inalterado como serviço central em nuvem;
   - O banco de dados PostgreSQL, os repositórios Prisma e as migrations (baseline 48) permanecem idênticos;
   - A tabela `Transaction` imutável continua operando exclusivamente em regime append-only;
   - Todos os motores (`packages/domain`, `packages/portfolio-engine`, `packages/tax-engine`, `packages/tax-intelligence`, `packages/market-data`, `packages/ai-engine`, etc.) continuam executando no backend;
   - O pipeline de conciliação, importação de arquivos B3 e tarefas agendadas (schedulers) continuam centralizados na VPS.

3. **Arquitetura de Autenticação para Clientes Instalados:**
   - **Comunicação Direta App → API:** Os aplicativos instalados comunicam-se diretamente com `/api/v1/auth/*` via HTTPS, eliminando a dependência do BFF Next.js;
   - **Access Token (JWT):** Mantido estritamente em memória volátil (store Zustand e variável de módulo), com TTL de 15 minutos;
   - **Refresh Token Rotativo:** Armazenado exclusivamente nos cofres seguros nativos do sistema operacional:
     - Windows Desktop: Windows Credential Manager / DPAPI via plugin de cofre seguro do Tauri;
     - Android: Android Keystore / `EncryptedSharedPreferences` via plugin de cofre seguro do Tauri;
   - **Proibição Estrita:** O refresh token **NUNCA** deve ser armazenado em `localStorage`, `sessionStorage` ou arquivos JSON em texto plano;
   - **Web BFF:** Enquanto a aplicação `apps/web` existir, suas rotas BFF de cookies (`/api/auth/*`) continuam ativas para o navegador sem conflito.

4. **Preservação da Aplicação Web Atual:**
   - `apps/web` **NÃO** deve ser deletada nem desativada nesta fase;
   - Permanece funcional, compilável, testável e atuando como baseline de paridade visual e comportamental;
   - Mantém viável o lançamento futuro de uma versão Web/SaaS sem retrabalho arquitetural.

5. **Estrutura Futura de Aplicativo:**
   - A aplicação instalada unificada será configurada em fases posteriores como `apps/atlas-app`, consumindo `@atlas/ui`, `@atlas/domain` e o novo `@atlas/api-client`.
   - **Nenhum código Tauri ou Rust é adicionado na fase atual (APP-0 / APP-1).**

## Invariants & Guardrails

1. **PostgreSQL Single Source of Truth:** Nenhum banco de dados local com replicação bidirecional é permitido. Operações locais em modo offline são estritamente de visualização em cache (read-only).
2. **Zero Floats:** Todos os valores financeiros e quantitativos continuam manipulados exclusivamente via `Money`, `Quantity`, `Percentage` e `LocalDate`.
3. **Pure Presentation:** A interface visual nunca calcula preço médio, rentabilidade ponderada, ganho de capital ou DARFs; toda a lógica reside nos motores do backend.
4. **Single-Flight Refresh Mutex:** Qualquer renovação de sessão por expiração de access token deve ser serializada em uma única chamada de rede pelo cliente HTTP, prevenindo falsos positivos de reuso de token.

## Consequences

### Positive
- Redução drástica de complexidade em relação a manter duas UIs separadas (Web React vs Mobile React Native);
- Binários desktop ultraleves (~35MB RAM) e sem dependência de runtimes pesados como Electron;
- Portabilidade imediata de mais de 35 componentes de portfólio, gráficos analíticos e telas fiscais já desenvolvidos na Web;
- Segurança aprimorada contra furto de credenciais utilizando os cofres nativos do Windows e do Android.

### Negative / Trade-offs
- Exige configuração inicial dos toolchains Rust e Android SDK/NDK nas fases de packaging do Tauri 2;
- Dispositivos Android muito antigos (com WebViews desatualizados anteriores ao Android 10) não são suportados.
