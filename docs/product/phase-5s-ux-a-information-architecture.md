# Phase 5S-UX-A: Product Navigation & Information Architecture Refinement

## Contexto & Visão Geral

A Fase 5S-UX-A consolidou a arquitetura de informação, navegabilidade e clareza conceitual do Project Atlas com base nos achados da auditoria de validação humana e técnica realizada em 27/10/2026. 

Todas as alterações preservaram rigorosamente a pureza do domínio:
- **0 novas migrações** e nenhuma alteração em schema de banco de dados.
- **0 alterações** nos cálculos financeiros, motores de valuation, performance, tributário ou contabilidade do livro-razão.
- Preservação da imutabilidade do livro-razão append-only e isolamento de usuários.

---

## Mapeamento de Rotas Web Atualizado

| Rota | Ponto de Entrada | Barra de Navegação | Descobrível? | Finalidade Principal |
|---|---|---|---|---|
| `/today` | AppLayout (Menu principal) | Aba Canônica "Hoje" | Sim | Panorama patrimonial consolidado, atalhos contextuais e switcher de carteiras |
| `/portfolio` | AppLayout (Menu principal) | Aba Canônica "Carteira" | Sim | Centro patrimonial com abas: Visão Geral, Ativos, Rentabilidade, Proventos, Alocação, Planejamento, Operações, Histórico |
| `/portfolio/history` | PortfolioShell & Links contextuais | Aba "Histórico" na Carteira | Sim | Linha do tempo contínua e extrato auditável de eventos e transações |
| `/portfolio/import` | Central de Saúde & Onboarding | Acesso por links na Carteira e Onboarding | Sim | Importação de extratos, notas de corretagem e status de integrações |
| `/portfolio/maintenance` | Central de Saúde & Qualidade de Dados | Links na Central de Saúde e Qualidade | Sim | Resolução guiada de pendências cadastrais, cotações e inconsistências estruturais |
| `/portfolio/assets/[assetId]` | Linhas de Posições (Visão Geral / Ativos) | Deep-link tabular modularizado | Sim | Análise profunda do ativo em 5 abas: Visão Geral, Rentabilidade, Proventos, Qualidade e Histórico |
| `/reviews` | Indicadores de pendências e Central de Saúde | Banner Hoje e Central de Saúde | Sim | Caixa de entrada de revisões e confirmação manual de conciliações |
| `/market` | AppLayout (Menu principal) | Aba Canônica "Mercado" | Sim | Radar de oportunidades, watchlist, eventos econômicos e notícias |
| `/tax` | AppLayout (Menu principal) | Aba Canônica "Fiscal" | Sim | Gestão fiscal modularizada em 4 abas: Apuração Mensal (DARF), Declaração Anual (DIRPF), Alta Renda e Conformidade |
| `/ai` | AppLayout & Banners contextuais | Aba Canônica "IA" | Sim | Assistente contextual integrado para análise patrimonial e fiscal |
| `/profile` | AppLayout (Ícone no rodapé/sidebar) | Perfil do Usuário | Sim | Preferências globais, auditoria de segurança da sessão e logout |
| `/admin/operations` | Rota restrita por operador | Acesso restrito a operadores | Seguro | Operações de ingestão administrativa (sem exposição a investidores) |

---

## Resolução dos Problemas de Auditoria (P0, P1 e P2)

### P0 — Componentes Órfãos de Planejamento de Aportes
- **Problema:** `PortfolioContributionGoalSection`, `PortfolioContributionCalendarSection` e `PortfolioContributionInsightsSection` (mais de 1.500 linhas de código pronto) estavam inacessíveis.
- **Resolução:** Criado o componente modular `PortfolioPlanningSection` e adicionada a aba "Planejamento" no `PortfolioShell` (`/portfolio?tab=planning`). O módulo organiza o planejamento em 5 sub-abas:
  1. *Meta Mensal*: Definição e acompanhamento de meta financeira.
  2. *Planos de Aporte*: Criação e auditoria de planos categorizados.
  3. *Calendário de Aportes*: Visão cronológica com status factuais.
  4. *Aderência & Insights*: Histórico de cumprimento sem tom prescritivo.
  5. *Simulação de Cenários*: Projeções de alocação futura.

### P1 — Navegabilidade e Densidade de Páginas
1. **Histórico Integrado (`/portfolio/history`):**
   - Anteriormente uma página isolada com breadcrumbs soltos.
   - Envelopado no `PortfolioShell` com aba ativa `"Histórico"`, permitindo alternar instantaneamente entre Visão Geral, Rentabilidade, Proventos, Planejamento e Histórico.
2. **Onboarding Conectado:**
   - No Passo 3, as opções "Adicionar operações manualmente", "Importar notas de corretagem depois" e "Explorar carteira vazia" agora direcionam diretamente para as telas correspondentes (`/portfolio?portfolioId=...&tab=operations&action=new`, `/portfolio/import`, e `/today`), com rótulo dinâmico no botão de ação.
3. **Página de Ativos Modularizada (`/portfolio/assets/[assetId]`):**
   - 9 seções verticais empilhadas reorganizadas em 5 abas (`Visão Geral`, `Rentabilidade`, `Proventos`, `Qualidade dos Dados`, `Histórico`).
   - `PositionIncomeSection` e `AssetIncomeSection` agrupados harmoniosamente na aba "Proventos", eliminando duplicidades visuais.
4. **Página Fiscal Modularizada (`/tax`):**
   - 18 seções verticais reorganizadas em 4 abas (`Apuração Mensal & DARF`, `Declaração Anual (DIRPF)`, `Alta Renda (Lei 15.270)` e `Conformidade & Prazos`).
   - Remoção de jargões técnicos de roadmap expostos ao usuário (ex.: "Diagnóstico de fundação (Fase 4A)").
5. **Fim da Duplicação de Posições (Overview vs Assets):**
   - Na aba "Visão Geral", a lista de custódia exibe até 5 posições principais com botão/link claro `"Ver todos os N ativos em custódia →"`, que alterna suavemente para a aba "Ativos" sem duplicação do grid completo.
6. **Portfolio Switcher no `/today`:**
   - Adicionado seletor de carteiras no cabeçalho quando o investidor possui múltiplas carteiras. Todas as consultas e cartões do `/today` são reativos à carteira selecionada.

### P2 — Terminologia, Erros e Apresentação
- **Conflito Semântico de "Operações":**
  - Na aba "Visão Geral", a antiga "Central de operações" foi renomeada para **"Saúde da Carteira & Pendências"** (mantendo `data-testid="portfolio-operations"` para testes).
  - No livro-razão de transações (`/portfolio?tab=operations`), a ação de retificação foi explicitada como **"Retificar"** e "Retificar Operação no Livro-Razão" em conformidade com o princípio de imutabilidade append-only.
- **Tratamento de Rate Limit HTTP 429:**
  - `GlobalExceptionFilter` na API agora mapeia status 429 / `ThrottlerException` com o código padronizado `COMMON.TOO_MANY_REQUESTS` e mensagem amigável: `"Muitas tentativas. Aguarde um momento e tente novamente."`, sem vazar nomes internos de classes.
- **Perfil do Investidor sem Jargão Técnico (`/profile`):**
  - Termos de arquitetura interna ("BFF com Cookies HttpOnly", "TanStack Query cache purge") foram substituídos por cards informativos com foco no investidor: "Sessão e Conexão Segura", "Privacidade de Dados Financeiros" e "Proteção de Navegação e Dispositivo".
- **Discoverability de Manutenção de Dados:**
  - Exibição de link para `/portfolio/maintenance` na seção de saúde da carteira e qualidade de dados sempre que houver itens acionáveis, pendências estruturais ou de navegação.

---

## Verificação e Qualidade Técnica

- **Typecheck Workspace:** 25/25 pacotes TypeScript aprovados com 0 erros (`pnpm typecheck`).
- **Suíte Web Vitest:** 72/72 arquivos de teste aprovados, 507/507 testes passando (`pnpm test:web`).
- **Suíte API Rate Limit:** 4/4 testes aprovados (`pnpm vitest run --config vitest.api.config.ts tests/api/complete-rate-limit.test.ts`).
- **Build de Produção Web:** Next.js 15 compilou 33 rotas estáticas e dinâmicas com sucesso (`pnpm --filter @atlas/web build`).
- **Lint:** ESLint aprovado sem violações (`pnpm lint`).
- **Migrações:** 0 novas migrações geradas ou pendentes.

---

## Apêndice R1: Encerramento de Regressões & Verificação Completa do Produto

A rodada R1 comprovou exaustivamente que a reorganização de UX e Arquitetura de Informação **não alterou a semântica de domínio** e manteve 100% de estabilidade regressiva nos subsistemas:

1. **Portfolio Strategy & Contributions:**
   - 14 arquivos, 157/157 testes unitários aprovados (`vitest.portfolio-strategy.config.ts`).
   - 8 arquivos, 92/92 testes de integração de API aprovados (`tests/api/contribution-*.test.ts`, `tests/api/allocation-*.test.ts`).
   - 6 arquivos, 60/60 testes de componentes Web aprovados (`tests/web/allocation-*.test.ts`, `tests/web/contribution-*.test.ts`).
2. **Operações de Portfólio, Conciliação e Retificação (Fases 5S-A a 5S-D):**
   - 7 arquivos, 65/65 testes Web de operações aprovados (`tests/web/portfolio-operations*.test.ts`, `tests/web/review-inbox.test.ts`, `tests/web/portfolio-data-maintenance.test.ts`, etc.).
   - 7 arquivos, 36/36 testes de API de operações e retificação aprovados (`tests/api/portfolio-operations.test.ts`, `tests/api/transaction-rectification.test.ts`, `tests/api/portfolio-maintenance.test.ts`, etc.).
3. **Tax Engine & Interface Fiscal:**
   - 78 arquivos, 813/813 testes unitários e fuzz matemáticos aprovados (`vitest.tax-engine.config.ts`).
   - 14 arquivos, 84/84 testes de interface Web fiscal aprovados (`tests/web/*tax*.test.ts`, `tests/web/*fiscal*.test.ts`, `tests/web/*annual*.test.ts`).
4. **Console de Operações de Ingestão (`/admin/operations`):**
   - Rota restrita a operadores (`IngestionOperatorGuard` via `INGESTION_OPERATOR_USER_IDS` retornando 403 / `INGESTION.OPERATOR_FORBIDDEN`).
   - Investidores comuns não visualizam atalhos ou links de navegação para a área operacional (`ADMIN_NAVIGATION_DEFERRED`).
5. **Auditoria de Terminologia e Segurança:**
   - 0 ocorrências de jargão de roadmap ("Fase 4A", etc.) ou vazamento de classes de exceção ("ThrottlerException") no front-end.
   - Status de integração B3 preservado em `PREPARING` / `ENGINEERING_READY_FOR_CERT` sem chamadas de rede ou credenciais reais.

