# APP-15J — Daily Use Correctness & Market Data Fixes
## Relatório Técnico e Evidências de Correção de Estados

**Data de Execução:** 06/11/2026  
**Ambiente:** Windows Desktop (`DESKTOP_LOCAL_OWNER`)  
**Database:** `atlas_local` (PostgreSQL 18 na porta 5434)  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Initial HEAD:** `de122efbb5da2af1e9f8f9055715a4f2bdb4bede`  
**Status Final:** `APP_15J_DAILY_USE_CORRECTNESS_COMPLETE`

---

## 1. Princípio Fundamental de Integridade Visual
```text
DADO PARCIAL ≠ TOTAL
DADO BLOQUEADO ≠ ZERO
SEM COTAÇÃO ≠ ZERO
CUSTO INCOMPLETO ≠ 100% AUDITADO
```

Nenhum estado técnico em andamento, incompleto, bloqueado ou sem precificação pode ser substituído por zero (`R$ 0,00`), percentuais falsos de 100% ou mensagens de isenção/sucesso total.

---

## 2. Auditoria e Correção por Área Funcional

### PARTE A, B, C, D — Módulo Fiscal (Fail-Closed & Integridade de Custo)

#### Finding & Root Cause
1. **DARF e Ganhos Bloqueados (2026-10):**
   - O backend retornou `status: 'BLOCKED'` e `isBlocked: true` decorrente de `UNKNOWN_COST_BASIS` e `COST_DOCUMENTARY_INCOMPLETE` em ITSA4, JHSF3 e SAPR4.
   - A UI anterior mascarava o estado bloqueado e exibia incorretamente: `100% Auditada`, `Ganhos Líquidos do Mês: R$ 0,00`, `Sem DARF a Recolher`, com mensagem de ausência de lucro tributável.
2. **Discrepância no Resumo de Prejuízos:**
   - O card do topo mostrava `Prejuízos a Compensar: R$ 0,00` enquanto a tabela de classes apresentava `FII: Saldo a Transportar R$ 145,17`.
   - Causa: `FiscalSummaryCards.tsx` consultava apenas o primeiro índice de `closingLosses` (Swing Trade: R$ 0,00) via null-coalescing (`??`), ignorando os índices subsequentes (FII: R$ 145,17).
3. **Card de Integridade de Custo:**
   - Exibia `100% Auditada` mesmo com 3 das 36 posições documentalmente pendentes.

#### Correção Implementada
1. **Fail-Closed no Card de DARF e Ganhos (`FiscalSummaryCards.tsx`, `DarfGuidanceCard.tsx`):**
   - Quando `effectiveBlocked` for verdadeiro:
     - Card de DARF exibe: `value="Bloqueado"`, `subValue="Custo incompleto (Fail-Closed)"`, `changeType="negative"`.
     - Card de Ganhos Líquidos exibe: `value="—"`, `subValue="Cálculo suspenso (Fail-Closed)"`.
     - `DarfGuidanceCard` renderiza alerta vermelho com código 6015:
       - *"🔒 Apuração bloqueada (Princípio Fail-Closed)"*
       - *"Motivo: Custo de aquisição documentalmente incompleto. Custo de aquisição não comprovado."*
       - *"Ativos afetados: ITSA4, JHSF3, SAPR4"*
       - *"Cálculo do mês: Não concluído — DARF não determinado."*
       - *"Ação necessária: Registrar comprovação de custo anterior a 28/11/2019 na aba Base de Custo & Evidências."*
     - Proibido qualquer texto de `Sem DARF a Recolher` ou `DARF = R$ 0,00`.
2. **Soma Consistente de Prejuízos Acumulados (`fiscal-liability.view-model.ts`):**
   - Implementado cálculo exato de centavos inteiros (`sumFiscalMoneyAmounts`) para agregar todos os saldos de encerramento (`totalClosingLossFormatted`).
   - O card do topo agora exibe fielmente `R$ 145,17`, em harmonia perfeita com a linha de Fundos Imobiliários na tabela inferior.
3. **Card de Cobertura Documental Real:**
   - Exibe com honestidade: `91,7% comprovado` e `33 de 36 posições auditadas (3 pendentes)`. Proibido arredondar para 100%.

---

### PARTE E, F, G, H, I, T — Valuation Parcial & Eliminação de Overflow

#### Finding & Root Cause
1. **Overflow Horizontal:**
   - A cobertura de cotações era interpolada diretamente como `${valuationCoveragePercent}%`, gerando strings sem quebra com mais de 25 caracteres como `2.777777777777777777%`.
   - Isso expandia o contêiner flex/grid além da viewport de 1200px no Windows Desktop, gerando barra horizontal.
2. **Valuation Parcial Vendido como Total:**
   - Com apenas PETR4 precificado (1 de 36 ativos), a interface apresentava `Patrimônio Total: R$ 9.080,00` e rentabilidade `+106,36%`, como se a carteira inteira valesse esse montante.
   - O gráfico de alocação indicava `Ações = 100%`, gerando falsa percepção de concentração.

#### Correção Implementada
1. **Formatação Centralizada de Cobertura:**
   - Coberturas decimais são formatadas via `formatPercentage(coverage, { decimalPlaces: 2 })`, exibindo rigorosamente `2,78%`.
2. **Semântica Explícita de Precificação Parcial (`PortfolioSummaryCards.tsx`):**
   - Quando `valuedPositions < totalPositions`:
     - Card 1: `label="Patrimônio Precificado"`, `subValue="1 de 36 posições precificadas"`.
     - Card 2: `label="Custo das Posições Precificadas"`.
     - Card 3: `label="Resultado das Posições Precificadas"`, `subValue="Rentabilidade parcial: +106,36%"`.
     - Card 4: `label="Cobertura de Cotações"`, `value="2,78%"`, `subValue="1 de 36 posições precificadas"`, badge `warning`.
3. **Alocação Parcial Honesta (`AllocationSection.tsx`):**
   - Título ajustado para `Distribuição das Posições Precificadas`, acompanhado de badge amarelo `<Badge variant="warning">Parcial</Badge>`.
   - Banner de advertência contextual:
     *"⚠️ Alocação Parcial: Este gráfico reflete exclusivamente o subconjunto de ativos com cotação de mercado disponível (2,78%). Ele não representa a totalidade da carteira enquanto houver ativos sem cotação."*

---

### PARTE K, L, M, N, O, P, Q, R, S, Z, AA — Market Data, Macro & Botões de Ação

#### Diagnóstico Técnico das 36 Posições (BRAPI Free vs Token)
Foi executada sondagem direta contra a API pública da BRAPI (`https://brapi.dev/api/quote/:ticker`) para todos os ativos em custódia na carteira:

| Ativo | Tipo | HTTP Status | Provedor | Cotação Retornada | Motivo / Causa |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **PETR4** | Ação | `200 OK` | BRAPI | R$ 45,26 | Ticker de demonstração gratuito público na BRAPI sem autenticação |
| **ALZR11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **BBDC4** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **BBPO11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **BBSE3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **CPLE6** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **CXSE3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **EGIE3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **ENBR3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **EQTL3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **FLRY3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **HGLG11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **HGRE11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **IRFM11** | ETF | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **ISUS11** | ETF | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **ITSA4** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **IVVB11** | ETF | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **JHSF3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **KNCR11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **KNIP11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **KNRI11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **KROT3** | Ação (Histórica) | `401 Unauthorized` | BRAPI | — | Ticker extinto / migrado para COGN3 |
| **MALL11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **MXRF11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **NTCO3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **ODPV3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **PSSA3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **RBRR11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **SANB11** | Unit | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **SAPR4** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **TAEE11** | Unit | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **TRPL4** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **VILG11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **VISC11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **VULC3** | Ação | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |
| **XPLG11** | FII | `401 Unauthorized` | BRAPI | — | Requer token BRAPI (`MISSING_TOKEN`) |

*Conclusão:* Não há bug no loop de iteração (PARTE L). O motor itera todos os 36 ativos e classifica os 35 que retornaram 401 em `authRequiredAssets: []`. O endpoint gratuito sem token da BRAPI deliberadamente restringe o catálogo público a pouquíssimos papéis (ex: PETR4, VALE3).

#### Correções Visuais e Funcionais de Mercado
1. **QuotesTable (`QuotesTable.tsx`):**
   - Ativos sem cotação exibem `Fonte: —` (nunca alegar falsamente "BRAPI EOD" para ativos sem dados).
   - Badge atualizado: `<Badge variant="neutral">SEM COTAÇÃO (Requer Token)</Badge>`.
2. **Macro Indicadores (`MacroIndicatorsGrid.tsx`):**
   - IBOVESPA subValue corrigido de *"Integração oficial B3"* para *"Integração ainda não disponível"*.
   - SELIC e IPCA exibem *"Ainda não atualizado"* com subValue *"Aguardando sincronização do Bacen/IBGE"*.
3. **Desduplicação de Botão de Atualização (PARTE S):**
   - O botão `Atualizar Cotações` reside de forma canônica no topo global do desktop (`AppLayout.tsx`) e na página especializada de Mercado (`MarketRoute.tsx`).
   - As ocorrências redundantes que apareciam simultaneamente no corpo de `TodayRoute.tsx` e `PortfolioRoute.tsx` foram condicionadas a dispositivos móveis (`className="mobile-only"`), eliminando a duplicação na mesma janela desktop.
4. **Feedback de Atualização Parcial (PARTE AA):**
   - Ao executar a ingestão via `ManualRefreshButton`, se houver ativos não precificados, a mensagem de feedback exibe em cor de alerta (âmbar):
     `"1/36 atualizadas (35 sem cotação)"` (em vez de um falso sucesso total).

---

### PARTE U, V, W, X, Y — Review Inbox, Ciclo de Vida de Runs e Notificações

#### Finding & Root Cause
1. **Origem do Badge `40`:**
   - Havia 46 execuções na tabela `integration_runs`, todas com `status: 'AWAITING_REVIEW'`.
   - 19 execuções decorriam de uploads iterativos do mesmo arquivo `negociacao-2026-10-29-18-20-59.xlsx` realizados durante a reconstrução anual da carteira (APP-15D–15G), onde cada ano importado deixava a execução prévia órfã.
   - 3 execuções duplicadas foram registradas em intervalo de segundos para `movimentacao...xlsx`.
   - A derivação de itens em `packages/import-engine/src/review-inbox.ts` não possuía regras para que runs em `AWAITING_REVIEW` fossem distinguidos visualmente ou enriquecidos com metadados.
2. **Cards Idênticos na UI:**
   - Todos os cards mostravam a string repetida `Sincronização B3 · Carteira Principal`, sem exibir contagem de novas operações, registros não suportados ou duplicatas.

#### Correção Implementada (`ReviewInboxSection.tsx`)
1. **Identificação e Rastreabilidade do Run:**
   - Cada card passa a exibir o identificador curto da execução: `(Execução abc12345) • DD/MM/YYYY HH:mm`.
2. **Pills Quantitativos Explícitos:**
   - `✨ X novas operações` (verde positivo).
   - `ℹ️ Y registros não suportados` (cinza neutro).
   - `⚠️ Z duplicatas prováveis` (amarelo aviso).
   - `🚨 W conflitos` (vermelho erro).
3. **Contexto e Ação Clara:**
   - Texto descritivo diferenciando execuções com operações acionáveis daquelas meramente informacionais (ex.: eventos de custódia não suportados ou duplicidades).
   - Ação diferenciada: `Revisar & Conciliar` para pendências acionáveis e `Ver Detalhes` para eventos informacionais.

---

## 3. Verificação Automatizada e Regressões

### Suíte Geral de Testes Unitários e de Integração
Executado `pnpm test:app`:
- **Total de Suítes:** 16 passadas (100%)
- **Total de Testes:** 236 passados (100%)
- **Duração:** 8.95s

### Nova Suíte Canônica APP-15J (`tests/app/app-15j-daily-use-correctness.test.tsx`)
9 testes dedicados validando:
1. `DarfGuidanceCard`: renderização do alerta bloqueado fail-closed, impedindo qualquer menção a "Sem DARF a Recolher" ou R$ 0,00.
2. `FiscalSummaryCards`: valores "Bloqueado" e "—" em conformidade com o princípio Fail-Closed.
3. Cobertura de custo em 91,7% (33/36) e prejuízos acumulados totalizando R$ 145,17.
4. `MonthlyAssessmentSection`: linhas de categorias bloqueadas apresentando travessões e badge de Fail-Closed.
5. Formatação do percentual de cobertura para 2,78% sem overflow horizontal.
6. Semântica de valuation parcial ("Patrimônio Precificado", "1 de 36").
7. Aviso de alocação parcial não-representativa da totalidade da carteira.
8. Fallbacks honestos dos indicadores macroeconômicos oficiais ("Integração ainda não disponível", "Ainda não atualizado").
9. `QuotesTable`: fonte "—" e badge "SEM COTAÇÃO (Requer Token)" para ativos sem dados.

---

## 4. Backups de Banco de Dados (`atlas_local`)

Em conformidade rigorosa com a PARTE AJ:
- **Backup Pré-15J:**  
  `C:\Users\joseo\AppData\Local\Atlas\backups\atlas_local_pre_15j_20261106-180321.sql` (241.628 bytes)
- **Backup Pós-15J:**  
  `C:\Users\joseo\AppData\Local\Atlas\backups\atlas_local_post_15j_20261106221935.sql` (241.628 bytes)

Zero alteração estrutural no schema e zero mutação do ledger contábil. A integridade matemática de todas as 48 migrations aplicadas permanece 100% preservada.

---

## 5. Build do Windows Desktop

- Executado: `pnpm --filter @atlas/atlas-app build`
- Resultado: **Sucesso** (código de saída 0).
- Bundle de frontend pronto para consumo do runtime nativo Tauri.
