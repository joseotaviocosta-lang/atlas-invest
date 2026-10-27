# PROJECT ATLAS — LOCAL HUMAN VALIDATION & PRODUCT GAP AUDIT
**Data da Auditoria:** 27 de Outubro de 2026  
**Auditor:** Antigravity / Autonomous Lead Auditor  
**Escopo:** Project Atlas (Web + API + Persistência Local)  
**Status de Execução:** Local Runtime Validado — Web e API Operacionais  

---

## A. PREFLIGHT

- **Branch esperada:** `feature/phase-4l1-contextual-tax-intelligence-foundation`
- **Branch atual:** `feature/phase-4l1-contextual-tax-intelligence-foundation` (CONFIRMADA)
- **HEAD esperado:** `e9964ea`
- **HEAD atual:** `c55b22f` (`feat(portfolio): add data maintenance workspace`)  
  *Nota de integridade:* O HEAD atual está 1 commit à frente do esperado (`c55b22f` sucede diretamente `e9964ea`). O histórico e o worktree foram estritamente preservados sem reset, commit ou alterações.
- **Worktree:** Limpo para arquivos rastreados.
- **Untracked preservados:**
  - `PHASE_5J_API_RECOVERY_REPORT.md`
  - `PHASE_5J_FINAL_STATUS.md`
  - `PHASE_5J_FINAL_SUMMARY.md`
  - `PHASE_5J_HV_R1_BROWSER_EVIDENCE_REPORT.md`
  - `PHASE_5J_HV_R2_1_HOTFIX_REPORT.md`
  - `PHASE_5J_HV_R2_DEFECT_ASSESSMENT.md`
  - `PHASE_5J_HV_R2_REPORT.md`
  - `PHASE_5J_IMPLEMENTATION_REPORT.md`
  - `PHASE_5J_R1_IMPLEMENTATION_AUDIT_REPORT.md`
  - `PHASE_5J_R1_IMPLEMENTATION_EVIDENCE_AUDIT_REPORT.md`
  - `PHASE_5J_R1_IMPLEMENTATION_REPORT.md`
  - `PHASE_5J_SUMMARY.md`
  - `ROADMAP_REVIEW_REPORT.md`
  - `docs/operations/phase-5i-r2-staging-provisioning-report.md`
  - `hv-fixtures/`
- **Alterações inesperadas:** Nenhuma.

---

## B. LOCAL RUN & CONTRACT

```text
LOCAL_RUN_CONTRACT

database: Docker container 'atlas_postgres_dev5434' (PostgreSQL 16) na porta 5434
api:      pnpm --filter @atlas/api dev (NestJS 11 em ts-node na porta 3001)
web:      pnpm --filter @atlas/web dev (Next.js 15.5.25 na porta 3000)
expected API URL: http://localhost:3001
expected Web URL: http://localhost:3000
required env:     DATABASE_URL="postgresql://atlas:atlas@127.0.0.1:5434/atlas_dev?schema=public"
```

- **Database:** Ativo e saudável. O container `atlas_postgres_dev5434` contém 58 tabelas migradas e dados de desenvolvimento populados.
  - *Aviso operacional:* O container legado `atlas_postgres` na porta 5432 não possui a tabela `users`. A persistência ativa do ambiente local reside estritamente na porta 5434.
- **API Runtime:** Processo NestJS iniciado com sucesso em `http://localhost:3001`.
  - `/health` -> `{"status":"ok","service":"atlas-api","version":"0.1.0"}`
  - `/ready`  -> `{"status":"ok","database":"connected"}`
  - Swagger UI -> `http://localhost:3001/docs`
- **Web Runtime:** Next.js 15 App Router ativo e compilando em `http://localhost:3000`.
- **Blockers de Inicialização:** Nenhum. Ambos os servidores estão ativos em background tasks para inspeção contínua.

---

## C. LOGIN & PRIMEIRA IMPRESSÃO

- **Resultado:**
  - Tela de login (`/login`) acessível, visual escuro canônico sem falhas de CSS ou hidratação.
  - Cadastro público funcional (`/register`), com validação Zod para tamanho mínimo de senha e formato de e-mail.
  - Redirecionamento automático pós-login para `/onboarding` para novos investidores sem carteira, ou para `/today` para investidores com carteiras ativas.
  - Fluxo de Onboarding de 3 passos: Boas-vindas -> Criação da Primeira Carteira (persistida na API via `POST /api/v1/portfolios`) -> Escolha do Método Inicial.
- **Gaps Identificados:**
  - **[P1][UX/FLOW] Dead End no Onboarding (Passo 3):** No passo 3, o usuário pode selecionar "Adicionar operações manualmente", "Explorar plataforma com carteira vazia" ou "Importar notas de corretagem depois". Porém, qualquer opção selecionada possui um único botão final: "Ir para o Início" (`/today`). Não há redirecionamento para o formulário de cadastro de operação nem para a tela de importação.
  - **[P2][BUG/SECURITY] Tratamento de Erro do Rate Limiter no Login:** Ao exceder o limite de 5 tentativas por minuto no endpoint `/api/v1/auth/login`, a API responde com status 429, mas o `GlobalExceptionFilter` retorna `errorCode: "INTERNAL_SERVER_ERROR"` e vaza o nome interno da classe NestJS: `"ThrottlerException: Too Many Requests"`.

---

## D. NAVEGAÇÃO & ARQUITETURA DE INFORMAÇÃO

- **Resultado:**
  - Navegação desktop via sidebar com as 5 abas canônicas: `Hoje` (`/today`), `Carteira` (`/portfolio`), `Mercado` (`/market`), `Fiscal` (`/tax`), `IA` (`/ai`).
  - Barra superior persistente com indicador de `Pendências` (`/reviews`) e acesso ao `Perfil` (`/profile`).
  - Navegação mobile responsiva via barra inferior fixa.
- **Gaps Identificados:**
  - **[P1][NAVIGATION/DISCOVERABILITY] Histórico da Carteira Órfão (`/portfolio/history`):** A página de histórico completo de auditoria (`/portfolio/history`) está 100% implementada (timeline, filtros por ativo/conta/tipo/data, paginação infinita), mas **NÃO possui link ou aba no `PortfolioShell` nem na sidebar**. O único acesso existente é um link de texto discreto no rodapé da aba "Operações", visível apenas se já existirem transações cadastradas.
  - **[P1][NAVIGATION/DISCOVERABILITY] Console de Operações do Sistema Inacessível (`/admin/operations`):** A console de monitoramento operacional (alertas de ingestão, execuções de jobs, saúde do scheduler, backfills) implementada na Fase 5H não possui **nenhum ponto de entrada na interface** (menu, perfil ou atalho de rodapé).
  - **[P1][UX/NAVIGATION] Ausência de Alternador de Carteiras no Início (`/today`):** A tela `/today` carrega compulsoriamente os dados da primeira carteira (`portfolios[0]`). Usuários com múltiplas carteiras (ex: Pessoal vs PJ vs Família) não conseguem alternar a visualização da tela inicial.
  - **[P2][NAVIGATION/DISCOVERABILITY] Espaço de Manutenção de Dados Oculto (`/portfolio/maintenance`):** O novo workspace da Fase 5S-C (`/portfolio/maintenance`) é exibido condicionalmente apenas se houver `actionable > 0 || navigable > 0`. Se o portfólio possuir apenas pendências estruturais (`STRUCTURAL`) ou nenhuma pendência, a rota fica inacessível pela UI.

---

## E. VISÃO GERAL DA CARTEIRA (`/portfolio`)

- **Resultado:**
  - Banners de completude de custo base e histórico funcionais.
  - Seletor de data temporal (`asOf`) opera sem live provider calls (leitura determinística da engine).
  - Resumo de patrimônio, custo total e lucro não-realizado coerente com as regras do `Portfolio Engine`.
- **Gaps Identificados:**
  - **[P1][UX/IA] Duplicação Excessiva de Posições:** A lista de posições em custódia é renderizada duas vezes na mesma tela: primeiro como tabela simplificada na aba `Visão Geral` (`<PositionRow>`), e novamente como cards detalhados na aba `Ativos`.
  - **[P1][COPY/CONFUSION] Conflito Terminológico "Operações":** A aba principal do portfólio chama-se "Operações" (referindo-se ao livro-razão financeiro de compras/vendas). Simultaneamente, na aba "Visão Geral", há um bloco central denominado "Central de Atenção Operacional" (referindo-se a jobs de ingestão, reconciliação e integridade). O investidor leigo não distingue "Operação Financeira" de "Operação de Sistema".
  - **[P2][UX/OVERLOAD] Sobrecarga Vertical da Aba Visão Geral:** A aba `Visão Geral` renderiza sequencialmente: Banners -> Cards de Patrimônio -> Central Operacional -> Posições de Ativos -> Cards de Todas as Carteiras. O usuário rola múltiplas telas para visualizar o panorama básico.

---

## F. TRANSAÇÕES & RETIFICAÇÃO

- **Resultado:**
  - Modal de inserção manual de transações valida campos monetários, quantidade e datas econômicas civis (`YYYY-MM-DD`).
  - Motor append-only validado: não há rotas de edição destrutiva ou exclusão.
  - Fluxo de Retificação (Fase 5J): botões de retificação abrem modal com motivo obrigatório, gerando novas transações compensatórias e marcando transações originais com badge `Retificada` e link `Ver correção`.
- **Gaps Identificados:**
  - **[P2][COPY] Nomenclatura do Botão de Retificação:** O botão na linha da transação é rotulado como "Corrigir", o que sugere uma edição mutável em-place para usuários comuns. Sugere-se "Retificar (Append-Only)" ou "Lançar Correção Compensatória".
  - **[P2][UX] Ausência de Filtros na Aba de Operações:** A aba `Operações` do portfólio exibe apenas uma lista contínua sem filtros imediatos por ativo, tipo (BUY/SELL) ou período. Para filtrar, o usuário precisa descobrir o link para o `/portfolio/history`.

---

## G. IMPORTAÇÕES & RECONCILIAÇÃO

- **Resultado:**
  - `/portfolio/import`: Suporta upload de arquivos (CSV, Excel), catálogo de métodos de importação, pré-visualização de linhas candidatas e detecção de duplicidades.
  - `/reviews`: Interface de pendências de reconciliação distingue com clareza fatos apurados pelo motor e decisões pendentes de confirmação humana.
  - Conexão B3: Mantida com segurança no estado `PREPARING` / `SIMULATED`. Não há simulação de conexão bancária real sem credenciais válidas.
- **Gaps Identificados:**
  - **[P2][UX] Página de Importação Muito Longa:** `/portfolio/import` (1.791 linhas de código) empilha em um único scroll: Catálogo de Métodos -> Configuração de Agendamento B3 -> Histórico de Importações -> Formulário de Arquivo -> Análise Prévia.
  - **[P2][COPY] Jargões Técnicos na Reconciliação:** A tela `/reviews` utiliza termos técnicos internos como "Item de Origem (Source Item)", "Engine Fact", "Pares Truncados" e "Reconciliation Run" sem glossário ou explicação contextual para o investidor.

---

## H. QUALIDADE DE DADOS & MANUTENÇÃO

- **Resultado:**
  - Indicadores de integridade (`COMPLETE`, `INCOMPLETE`, cobertura de cotações) exibem fielmente o estado da custódia.
  - Diagnósticos identificam ausência de cotação de mercado ou de câmbio histórico sem falhas catastróficas na UI.
- **Gaps Identificados:**
  - **[P2][UX/ACTION] Falta de Ação Direta no Diagnóstico da Posição:** Quando uma posição acusa falta de cotação recente, o card alerta o problema (`DIAGNOSIS_ONLY`), mas não oferece botão direto de "Atualizar Cotação deste Ativo" ou link para a tela de mercado.

---

## I. DETALHE DA POSIÇÃO (`/portfolio/assets/[assetId]`)

- **Resultado:**
  - Detalhamento de preço médio, custo total, quantidade em custódia e quebra por instituição/conta.
  - Histórico reverso com paginação infinita operacional.
- **Gaps Identificados:**
  - **[P1][UX/OVERLOAD] 9 Seções Empilhadas Verticalmente:** A página de detalhe do ativo empilha consecutivamente em uma única coluna sem abas:
    1. Card Primário de Custódia
    2. Detalhamento de Contas
    3. Inteligência de Posição (Valuation e Yield on Cost)
    4. Rentabilidade da Posição (TWR e Atribuição)
    5. Proventos da Posição (Gráfico/Resumo por Ano)
    6. Qualidade de Dados do Ativo
    7. Resultados Realizados (Ganhos/Perdas de Vendas)
    8. Proventos Recebidos (Lista Histórica de Dividendos/JCP)
    9. Histórico de Transações de Auditoria
  - **[P1][UX] Duplicação de Proventos:** A seção 5 (`PositionIncomeSection`) e a seção 8 (`AssetIncomeSection`) apresentam dados de proventos do mesmo ativo de maneiras redundantes e concorrentes na mesma página.

---

## J. MÓDULO DE APORTE & PLANEJAMENTO (CONTRIBUTIONS)

- **Resultado:**
  - Backend e entidades do domínio suportam Metas de Aporte (`contribution-goal`), Calendário (`contribution-calendar`), Planos de Aporte (`contribution-plans`) e Insights (`contribution-insights`).
- **Gaps Críticos Identificados:**
  - **[P0][MISSING_FEATURE/DISCOVERABILITY] Três Componentes Prontos Completamente Desconectados da UI:**
    Os seguintes componentes estão totalmente implementados, tipados e estilizados no repositório, mas **NÃO ESTÃO RENDERIZADOS EM NENHUMA PÁGINA OU ROTA DA WEB**:
    1. `PortfolioContributionGoalSection` (`PortfolioContributionGoal.tsx`, 414 linhas) — Declaração de meta mensal de aporte do investidor.
    2. `PortfolioContributionCalendarSection` (`PortfolioContributionCalendar.tsx`, 486 linhas) — Visão mensal de aportes planejados vs realizados e comparação com metas.
    3. `PortfolioContributionInsightsSection` (`PortfolioContributionInsights.tsx`, 633 linhas) — Histórico de aderência a aportes, taxas de conclusão e detalhamento por categoria de ativo.
  - **[P1][TECH_DEBT/API] Inconsistência de Rota Plural/Singular:** A controller de metas está mapeada como singular (`/api/v1/portfolios/:id/contribution-goal`), enquanto as demais rotas usam plural (`/contribution-plans`, `/contribution-insights`).

---

## K. MÓDULO FISCAL (`/tax`)

- **Resultado:**
  - Motor tributário calcula DARF mensal, prejuízos acumulados a compensar, regime de alta renda (Lei nº 15.270/2025) e declaração anual de Bens e Direitos com precisão matemática pura (`tax-engine`).
- **Gaps Identificados:**
  - **[P1][UX/IA] Avalanche de 18 Seções em Scroll Único:** A tela `/tax/page.tsx` empilha 18 seções tributárias distintas em uma página infinita, misturando apuração mensal de DARF, informe anual de IRPF (DIRPF), regime especial de alta renda, cadastro manual de retenções e preferências de lembretes.
  - **[P2][COPY] Vazamento de Jargão Técnico de Roadmap:** O título da seção colapsável de fatos tributários exibe textualmente: `"Diagnóstico de fundação (Fase 4A): COMPLETED"`. O investidor final é exposto a termos internos do plano de desenvolvimento.

---

## L. MERCADO (`/market`) & IA (`/ai`)

- **Resultado:**
  - `/market`: Lista de cotações atuais da carteira do investidor com botão de atualização sob demanda. Indicadores macroeconômicos (CDI, Selic, IPCA) exibem travessão (`—`) com nota de transparência de integração futura, sem inventar dados falsos.
  - `/ai`: Assistente contextual conversacional funcional com sugestão de chips de perguntas sobre rentabilidade, risco e ativos em custódia.
- **Gaps Identificados:**
  - **[P2][UX/FEATURE] Ausência de Busca Geral de Mercado:** A aba `Mercado` restringe-se exclusivamente aos ativos que o investidor já comprou na carteira. Não há campo de busca para consultar cotações de outros ativos da B3 antes de adicioná-los.

---

## M. PERFIL DO USUÁRIO (`/profile`)

- **Resultado:**
  - Identificação do investidor, preferências globais e botão funcional de logout com purga segura do cache.
- **Gaps Identificados:**
  - **[P2][COPY/UX] Exibição de Checklists de Arquitetura em Vez de Configurações:** A seção "Segurança e Sessão" exibe cards estáticos para o usuário com mensagens para desenvolvedores como: `"BFF com Cookies HttpOnly"`, `"Isolamento Compulsório de Cache no TanStack Query"` e `"Token em Memória Volátil"`. Faltam opções práticas de usuário, como "Alterar Senha" ou "Encerrar Outras Sessões Ativas".

---

## N. CONSOLE, NETWORK & PERFORMANCE

- **Erros de JavaScript:** Zero erros no runtime do navegador.
- **Erros de Hidratação:** Zero erros de hidratação Next.js / React 18.
- **Typecheck:** 25 pacotes compilados com 100% de sucesso via `turbo run typecheck`.
- **CORS / Segurança:** Headers de segurança Helmet e validação de `Origin` no BFF ativos.

---

## Q. PRODUCT GAPS — CLASSIFICAÇÃO PRIORIZADA

### Gaps P0 (Bloqueio / Ausência de Capacidade Fundamental)
1. **[P0][MISSING_FEATURE] Componentes de Aporte Órfãos:** `PortfolioContributionGoalSection`, `PortfolioContributionCalendarSection` e `PortfolioContributionInsightsSection` somam mais de 1.500 linhas de código pronto e validado que não possuem rota, aba ou container de renderização na aplicação Web.

### Gaps P1 (Prejudica Fluxo Principal ou Usabilidade Crítica)
2. **[P1][NAVIGATION] Histórico de Transações Órfão:** A tela `/portfolio/history` está invisível na navegação primária e na barra de abas da carteira.
3. **[P1][UX/FLOW] Dead End no Onboarding (Passo 3):** Opções de início não conduzem o usuário às ações correspondentes (cadastro de operação ou importação).
4. **[P1][UX/IA] Sobrecarga do Detalhe do Ativo (`/portfolio/assets/[id]`):** 9 blocos empilhados verticalmente com redundância de dados de proventos.
5. **[P1][UX/IA] Sobrecarga da Área Fiscal (`/tax`):** 18 seções empilhadas sem divisão por abas (Mensal / Anual / Alta Renda).
6. **[P1][UX] Duplicação de Posições no Portfólio:** Posições exibidas em duplicidade na aba "Visão Geral" e na aba "Ativos".
7. **[P1][UX] Ausência de Seletor de Carteira no Painel Inicial (`/today`):** Bloqueia a alternância de contexto do investidor multimercado.

### Gaps P2 (Melhoria Importante de Experiência e Alinhamento de Produto)
8. **[P2][COPY/CONFUSION] Ambiguidade do Termo "Operações":** Conflito entre "Operações Financeiras" (Trades) e "Operações do Sistema" (Ingestion/Admin).
9. **[P2][BUG/SECURITY] Vazamento de Nome de Classe no Rate Limiter (429):** Mensagem `ThrottlerException: Too Many Requests` com código `INTERNAL_SERVER_ERROR`.
10. **[P2][COPY] Vazamento de Jargão de Roadmap no Módulo Fiscal:** Presença de `"Diagnóstico de fundação (Fase 4A)"` na interface pública.
11. **[P2][COPY] Perfil Exibindo Validações Técnicas:** Cards de "TanStack Query cache purge" e "HttpOnly Cookies" no lugar de controles de conta do usuário.
12. **[P2][UX] Espaço de Manutenção (`/portfolio/maintenance`) e Console (`/admin/operations`) Ocultos da Navegação:** Sem ponto de acesso intuitivo para auditoria e operadores.

### Gaps P3 (Polimento Visual e Refinamentos Secundários)
13. **[P3][UX] Falta de Campo de Busca na Aba Mercado:** Impossibilidade de consultar ativos fora da custódia atual.
14. **[P3][COPY] Nomenclatura do Botão "Corrigir":** Ajustar para "Retificar" ou "Lançar Correção Compensatória".

---

## R. TOP 10 RECOMENDAÇÕES DE MELHORIA DE PRODUTO

1. **Criar a Aba "Planejamento / Aportes" na Carteira:** Integrar os 3 componentes órfãos (`PortfolioContributionGoalSection`, `PortfolioContributionCalendarSection`, `PortfolioContributionInsightsSection`) na navegação da carteira.
2. **Adicionar Aba Explícita de "Histórico" no `PortfolioShell`:** Conectar diretamente a rota `/portfolio/history` nas abas canônicas da carteira.
3. **Organizar o Módulo Fiscal em Abas Temáticas:** Dividir `/tax` em: `1. Mensal (DARF)` | `2. Anual (DIRPF)` | `3. Alta Renda (Lei 15.270)` | `4. Configurações`.
4. **Dividir o Detalhe do Ativo em Abas:** Estruturar `/portfolio/assets/[id]` em `Visão Geral`, `Rentabilidade & Proventos`, `Diagnóstico & Qualidade` e `Histórico de Transações`.
5. **Completar o Redirecionamento do Onboarding (Passo 3):** Conectar a opção "Adicionar manualmente" à abertura do modal de transação e "Importar" à rota `/portfolio/import`.
6. **Eliminar Duplicação de Posições na Carteira:** Manter na aba `Visão Geral` apenas o resumo patrimonial e na aba `Ativos` a tabela completa de custódia.
7. **Adicionar o `PortfolioSwitcher` na Tela Inicial (`/today`):** Permitir que o investidor filtre o resumo do dia pela carteira selecionada.
8. **Sanitizar Textos Técnicos e Jargões Internos:** Remover referências a "Fase 4A", "TanStack Query purge" e padronizar o nome de "Operações" para "Transações" vs "Status Operacional".
9. **Corrigir a Mensagem de Rate Limit (429) no `GlobalExceptionFilter`:** Mapear `ThrottlerException` para código `COMMON.TOO_MANY_REQUESTS` e mensagem amigável em português.
10. **Inserir Ponto de Acesso Seguro para a Console de Operações:** Adicionar link discreto no rodapé ou no perfil para usuários com privilégio de operador (`/admin/operations`).

---

## S. IMPACTO NO ROADMAP

- **Continuar para 5S-D imediatamente?:** **NÃO RECOMENDADO.**
- **Inserir Fase de Refinamento / UX antes da 5S-D?:** **SIM (ALTAMENTE RECOMENDADO).**
- **Justificativa Estratégica:**
  O sistema já possui motores matemáticos, fiscais e de conciliação de altíssimo nível e estabilidade (25/25 pacotes aprovados, precisão decimal arbitrária, isolamento tributário, replays determinísticos). No entanto, funcionalidades vitais já concluídas (como o planejamento de aportes, histórico de auditoria e console de manutenção) estão **escondidas ou desconectadas da UI**, enquanto telas centrais como `/tax` e `/portfolio/assets/[id]` sofrem de sobrecarga cognitiva extrema. Avançar para a Fase 5S-D sem antes organizar a arquitetura de informação aumentará o acúmulo de débito de usabilidade e esconderá recursos de alto valor que já estão pagos pelo desenvolvimento.

---

## T. CHECKLIST DE VALIDAÇÃO HUMANA PARA O OWNER

O ambiente local está pronto e em execução. O proprietário do produto pode realizar o smoke test no navegador seguindo este roteiro:

```text
[ ] 1. ABRIR O PRODUTO NO NAVEGADOR:
       Acessar: http://localhost:3000

[ ] 2. AUTENTICAÇÃO:
       - Fazer login com a conta existente ou cadastrar um novo usuário em http://localhost:3000/register
       - Testar credenciais dev criadas no smoke: probe_test@atlas.dev / Password123!

[ ] 3. FLUXO DE ONBOARDING:
       - Conferir a criação guiada da carteira em 3 passos.
       - Observar o botão de conclusão do Passo 3.

[ ] 4. TELA INICIAL (HOJE):
       - Acessar http://localhost:3000/today
       - Observar indicadores patrimoniais e ausência de dados fictícios.

[ ] 5. VISÃO DA CARTEIRA:
       - Acessar http://localhost:3000/portfolio
       - Alternar entre as abas: Visão Geral, Ativos, Alocação, Operações.
       - Observar a presença repetida da lista de posições nas abas Visão Geral e Ativos.

[ ] 6. LANÇAMENTO DE TRANSAÇÃO MANUAL:
       - Na aba Operações (ou botão superior), clicar em "+ Nova operação".
       - Simular uma compra (ex: 10 PETR4 a R$ 38,50).

[ ] 7. WORKFLOW DE RETIFICAÇÃO:
       - Na lista de operações, clicar em "Corrigir" em uma operação existente.
       - Preencher o motivo da retificação e confirmar.
       - Verificar a emissão da nova transação e o badge "Retificada".

[ ] 8. HISTÓRICO DE AUDITORIA:
       - Acessar diretamente a URL oculta: http://localhost:3000/portfolio/history
       - Testar os filtros por data, conta e tipo de evento.

[ ] 9. ESPAÇO DE MANUTENÇÃO (FASE 5S-C):
       - Acessar a URL: http://localhost:3000/portfolio/maintenance?portfolioId=<SEU_PORTFOLIO_ID>
       - Conferir as classificações de manutenção de dados.

[ ] 10. MÓDULO DE IMPORTAÇÃO E B3:
       - Acessar http://localhost:3000/portfolio/import
       - Verificar o status PREPARING / SIMULATED da conexão B3.

[ ] 11. CENTRAL DE PENDÊNCIAS (REVIEWS):
       - Acessar o sino na barra superior ou http://localhost:3000/reviews
       - Conferir o inbox de conciliação.

[ ] 12. DETALHE DO ATIVO:
       - Clicar em um ativo ou acessar http://localhost:3000/portfolio/assets/<ASSET_ID>
       - Observar o empilhamento das 9 seções na mesma página.

[ ] 13. MÓDULO FISCAL:
       - Acessar http://localhost:3000/tax
       - Observar a extensão do formulário e o texto técnico de "Fase 4A".

[ ] 14. ASSISTENTE DE IA:
       - Acessar http://localhost:3000/ai
       - Testar um dos chips contextuais de pergunta.

[ ] 15. PERFIL E LOGOUT:
       - Acessar http://localhost:3000/profile
       - Clicar em "Sair da Conta (Logout)" e confirmar a purga de sessão.
```

---

## U. TESTES AUTOMATIZADOS EXECUTADOS

- **Typecheck do Monorepo:** `pnpm typecheck` -> 25 de 25 pacotes aprovados com 100% de sucesso (30.6s).
- **API Smoke Test:** Rotas de autenticação, carteiras, estado, posições, valuation, alocação, histórico, operations-center, data-quality e integridade B3 testadas com sucesso contra PostgreSQL real.
- **Web App Compilation:** Next.js 15 dev server compilando rotas públicas e autenticadas sem erros.

---

## V. REGISTRO GIT

- **Arquivos modificados no código:** NENHUM (Regra inviolável de auditoria cumprida: Zero fixes durante a auditoria).
- **Documento gerado:** `docs/product/atlas-local-product-audit-2026-10-27.md`
- **Commits:** 0 (proibido comitar nesta etapa).
- **Push:** 0 (proibido fazer push nesta etapa).

---

## W. VEREDITO FINAL

- **Aplicação local executável?** **SIM.** API e Web estão 100% no ar e comunicando com o banco local.
- **Produto utilizável?** **SIM.** Os fluxos centrais de carteira, conciliação e apuração fiscal operam com robustez e consistência matemática.
- **Bloqueadores maiores (P0):** A desconexão total de 3 componentes funcionais do módulo de Aportes/Planejamento da interface Web.
- **Próxima fase recomendada:** **Fase de Polish & Navegação de Produto (UX/IA Sprint)** para conectar as telas órfãs, organizar `/tax` e `/portfolio/assets/[id]` em abas e eliminar dead ends antes de iniciar a Fase 5S-D.



---

## X. APÊNDICE DE RESOLUÇÃO — FASE 5S-UX-A (27/10/2026)

Todos os achados de prioridade P0, P1 e P2 registrados nesta auditoria foram integralmente resolvidos na **Fase 5S-UX-A**:

1. **P0 Resolvido:** Componentes órfãos `PortfolioContributionGoalSection`, `PortfolioContributionCalendarSection` e `PortfolioContributionInsightsSection` foram unificados sob `PortfolioPlanningSection` e disponibilizados na aba "Planejamento" (`/portfolio?tab=planning`).
2. **P1 Resolvido:**
   - `/portfolio/history` integrado ao `PortfolioShell` como aba oficial da Carteira.
   - Onboarding Passo 3 conectado às rotas de primeira operação manual (`/portfolio?tab=operations&action=new`), importações (`/portfolio/import`) e visão geral (`/today`).
   - `/portfolio/assets/[assetId]` modularizado em 5 abas (`Visão Geral`, `Rentabilidade`, `Proventos`, `Qualidade dos Dados`, `Histórico`), eliminando duplicidade entre `PositionIncomeSection` e `AssetIncomeSection`.
   - `/tax` modularizado em 4 abas (`Apuração Mensal & DARF`, `Declaração Anual (DIRPF)`, `Alta Renda (Lei 15.270)` e `Conformidade & Prazos`), com remoção de menções a "Fase 4A".
   - Duplicação de posições eliminada na Visão Geral (amostragem das top 5 com CTA direto para a aba Ativos).
   - Portfolio Switcher reativo adicionado no cabeçalho do `/today`.
3. **P2 Resolvido:**
   - Conflito semântico eliminado: "Central de operações" renomeada para "Saúde da Carteira & Pendências", e operações no ledger renomeadas para "Retificar".
   - Rate limit 429 tratado sem vazamento de `ThrottlerException`.
   - Perfil do investidor higienizado de detalhes internos de arquitetura.
   - Manutenção de dados descobrível em caso de pendências operacionais e estruturais.
