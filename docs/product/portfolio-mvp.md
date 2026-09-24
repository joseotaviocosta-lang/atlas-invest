# Especificação de Produto: Carteira MVP (Current Portfolio Overview)

**Versão do Documento:** 1.0.0  
**Fase:** Fase 2A — Carteira MVP  
**Status:** Implementado & Aprovado

---

## 1. Visão Geral e Objetivo

A experiência de **Carteira MVP** transforma a aba "Carteira" do Project Atlas (Web e Mobile) em uma ferramenta de visualização patrimonial autêntica, consumindo diretamente e com exclusividade os contratos congelados da **Portfolio Read API v1** (`GET /api/v1/portfolios/:portfolioId/state`).

Seu objetivo é responder com precisão e clareza analítica às dez perguntas essenciais do investidor:

1. **Qual carteira estou vendo?** (Nome, tipo e moeda base em destaque no cabeçalho).
2. **Quais ativos estão abertos?** (Lista de ativos em custódia com `quantity > 0`).
3. **Quanto possuo de cada ativo?** (Quantidade exata formatada no padrão brasileiro).
4. **Qual meu custo carregado?** (Custo total conhecido de aquisição).
5. **Qual meu preço médio?** (Preço médio ponderado por lote).
6. **Em quais contas os ativos estão?** (Detalhamento expansível por conta de custódia).
7. **Tenho posições com custo incompleto?** (Banner informativo e badges semânticos de incompletude).
8. **Quanto já recebi em rendimentos?** (Total acumulado de dividendos, JCP e rendimentos FII por moeda).
9. **Quanto já realizei em vendas?** (Resultado financeiro e percentual realizado por moeda).
10. **Há dados ainda incompletos?** (Indicador global de completude).

---

## 2. Dados Exibidos vs. Dados Deliberadamente Ausentes (Anti-Scope)

### Dados Exibidos (Baseados no Ledger Replay Real)

- Identificador canônico do ativo (`displayIdentifier`).
- Quantidade exata de cotas/ações em custódia.
- Preço médio ponderado de aquisição (`averageCost`).
- Custo total investido/carregado (`totalCost`).
- Distribuição quantitativa e de custo por conta de custódia.
- Somatório de proventos recebidos segregado por moeda (`BRL`, `USD`).
- Resultado financeiro realizado em vendas encerradas (`realizedGainLoss` e `%` de retorno realizado).

### Dados Deliberadamente Ausentes (Proibições Estritas)

Como o módulo de **Market Data** ainda não foi implementado, a interface **jamais** exibe, infere ou calcula:

- Cotação atual ou preço de mercado.
- Valor de mercado da posição ou patrimônio a mercado.
- Lucro/prejuízo não realizado (unrealized P&L).
- Variação diária ou oscilação percentual do dia.
- Rentabilidade total da carteira (TWR, MWR, XIRR).
- Benchmarks comparativos (CDI, Ibovespa, IPCA, S&P 500).
- Conversão cambial implícita entre moedas distintas.

---

## 3. Terminologia Oficial e Diretrizes de UX

Para garantir honestidade intelectual e precisão regulatória:

- **"Custo total investido"** ou **"Custo total conhecido"**: Utilizado para a soma do custo de aquisição das posições. Jamais chamado de "Patrimônio Atual".
- **"Resultado realizado"**: Lucro ou prejuízo derivado exclusivamente de alienações (`SELL`). Jamais chamado de "Rentabilidade Total".
- **"Rendimentos recebidos"**: Total de proventos líquidos creditados.
- **"Posições abertas"**: Quantitativo de ativos atualmente em carteira (`quantity > 0`).

---

## 4. Tratamento de Custo Incompleto (Incomplete Cost Basis)

Quando um ativo possui histórico anterior à primeira transação registrada ou transferência sem custo de aquisição identificado (`costBasisStatus === 'INCOMPLETE'`):

- O preço médio e o custo total daquela posição são renderizados estritamente como travessão (`—`), **nunca** como `0` ou `R$ 0,00`.
- Um badge discreto `Dados incompletos` é apresentado ao lado do ticker.
- O card de custo passa a exibir o rótulo **"Custo total conhecido"**.
- Um banner informativo de aviso (não-alarmista) é apresentado no topo da página:
  > _Algumas posições possuem custo de aquisição incompleto. Os valores de custo e preço médio dessas posições não podem ser exibidos com precisão._

---

## 5. Segregação Multimoeda

Se a carteira possuir ativos ou operações em múltiplas moedas (ex: `BRL` e `USD`):

- Os cards de Custo Total, Resultado Realizado e Rendimentos apresentam linhas separadas por moeda.
- Não ocorre conversão cambial nem consolidação cruzada arbitrária (soma de Real com Dólar é proibida).

---

## 6. Layout Responsivo (Web & Mobile)

- **Web:**
  - Integrado à barra lateral (sidebar) existente e seletor de carteiras (`PortfolioSwitcher`).
  - Grid responsivo de cards analíticos (`repeat(auto-fit, minmax(240px, 1fr))`).
  - Linhas de posições estruturadas com acordeão expansível para visualização de contas.
- **Mobile:**
  - Integrado ao tab navigator inferior padrão.
  - Carrossel / chips horizontais de seleção de carteira ativa.
  - Cards touch-friendly com área mínima de toque $\ge 44\text{px}$.
  - Suporte completo a pull-to-refresh e awareness de conexão offline.

---

## 7. Detalhamento da Posição do Ativo (Fase 2B)

A Fase 2B expande a Carteira MVP oferecendo a tela de **Asset Position Details**, acessada ao clicar em qualquer ativo na listagem geral:

- **Rotas:**
  - **Web:** `/portfolio/assets/[assetId]?portfolioId=:portfolioId`
  - **Mobile:** `/(app)/portfolio/[assetId]?portfolioId=:portfolioId`
- **Seções Principais:**
  1. **Cabeçalho:** Ticker do ativo, nome da empresa/fundo, tag de classe de ativo (`Ações`, `Fundo Imobiliário`, `BDR`, etc.), carteira de contexto e badge de status da posição (`ABERTA` ou `ENCERRADA`).
  2. **Card Primário Consolidado:** Quantidade total de cotas/ações sob custódia, Preço médio ponderado e Custo total de aquisição conhecido. Se o custo for incompleto, exibe `—` e aviso contextual explicativo.
  3. **Custódia por Conta:** Quadro discriminando em quais instituições (corretoras/bancos) as cotas estão custodiadas, seus respectivos custos médios e totais.
  4. **Resultado Realizado:** Lista de operações de venda encerradas deste ativo, detalhando data, corretora, quantidade, preço bruto, custos de corretagem/emolumentos, valor líquido e ganho/perda obtido com percentual apurado.
  5. **Rendimentos Recebidos:** Histórico dos proventos recebidos pelo ativo (dividendos, JCP e rendimentos), com valor líquido e bruto.
  6. **Histórico do Ativo:** Extrato auditável cronológico reverso paginado via keyset cursor (`GET /api/v1/portfolios/:portfolioId/history?assetId=:assetId&limit=20&cursor=...`), com botão sob demanda com alvo de toque $\ge 44\text{px}$.
- **Invariantes e Zero Client Math:**
  - O cliente nunca calcula multiplicações de quantidade por preço médio nem realiza somas financeiras.
  - Posições encerradas (`quantity === '0'`) continuam acessíveis no detalhamento histórico com badge `POSIÇÃO ENCERRADA`.

---

## 8. Histórico e Atividade Consolidada da Carteira (Fase 2C)

A Fase 2C entrega a visão cronológica unificada de **Portfolio History & Activity**, acessada via botão secundário "Histórico" na tela principal da Carteira:

---

## 9. Visualização de Rendimentos e Fluxos de Caixa (Fase 2D)

A Fase 2D introduz duas novas visualizações na Carteira: **Rendimentos** e **Fluxos de Caixa**. Ambas consomem exclusivamente os endpoints congelados da Portfolio Read API v1 e não realizam nenhum cálculo financeiro do lado do cliente.

### 9.1 Rendimentos (Income)

Os rendimentos exibem eventos do tipo `DIVIDEND`, `JCP` e `FII_INCOME`, com server-side summaries por moeda.

- **Tipos suportados:** `DIVIDEND` (Dividendo), `JCP` (Juros sobre Capital Próprio), `FII_INCOME` (Rendimento de FII)
- **Terminologia:** Todos os tipos são rotulados segundo seus nomes nativos (Dividendo, JCP, Rendimento de FII)
- **Server-side summaries:** Totais agregados por moeda (`Map<Currency, IncomeSummary>`), nunca calculados no cliente
- **Multi-moeda:** Valores em moedas distintas permanecem segregados por moeda em blocos/linhas distintas, sem conversão cambial implícita
- **Custo incompleto:** Posições com `costBasisStatus === 'INCOMPLETE'` renderizam preço médio e custo total como `—` (travessão), acompanhadas de badge informativo ("Dados de custo incompletos")
- **Zero client math:** O cliente nunca multiplica quantidade por preço, nunca soma valores monetários, nunca calcula percentual de retorno a partir de fluxos de renda
- **Terminologia canonical:** Os tipos de evento são estritamente `DIVIDEND`, `JCP`, `FII_INCOME` — o cliente nunca inventa kinds ad-hoc

### 9.2 Fluxos de Caixa (Cash Flow)

Os fluxos de caixa exibem eventos dos tipos `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX` e `AMORTIZATION`, com server-side summaries por moeda e terminologia rigorosa.

- **Tipos suportados:** `DEPOSIT` (Depósito), `WITHDRAWAL` (Retirada), `FEE` (Taxa), `TAX` (Tributo pago), `AMORTIZATION` (Amortização)
- **Terminologia rigorosa:**
  - `TAX` é sempre exibido como **"Tributo pago"** (nunca "Imposto devido" ou "Imposto a pagar")
  - `AMORTIZATION` exibe o subtítulo contextual **"Devolução de capital"** ao lado do valor
  - `DEPOSIT` direction é sempre "Entrada" (INFLOW)
  - `WITHDRAWAL` direction é sempre "Saída" (OUTFLOW)
- **Sem cash balance:** A interface **nunca** exibe "Saldo de caixa", "Total de fluxos" agregado ou "Fluxo líquido". Cada fluxo é exibido individualmente com seu respectivo valor e direção.
- **Server-side summaries:** Totais agregados por moeda (`Map<Currency, CashFlowSummary>`), nunca calculados no cliente
- **Zero client math:** O cliente nunca soma, subtrai ou agrega valores financeiros. Cada evento é renderizado individualmente com dados provenientes da API.
- **Cash flow types never emit realized disposals:** `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX` e `AMORTIZATION` nunca configuram alienação e não emitem `RealizedDisposal`

### 9.3 Invariantes Compartilhados (Fase 2D)

- **Server summaries = source of financial truth:** Os resumos fornecidos pela API são a única fonte de informações financeiras; o view model apenas os formata para apresentação
- **Zero float math:** Todos os montantes são serializados como strings decimais exatas; nunca tipos numéricos IEEE-754 no cliente
- **Semântica null vs zero:** Posições com custo `INCOMPLETE` serializam `totalCost` e `averageCost` como `null` (nunca `0` ou `"0"`)
- **Semântica TAX = "Tributo pago":** O tipo `TAX` é rigorosamente rotulado como "Tributo pago", nunca como "Imposto devido" ou "Imposto a pagar"
- **Semântica AMORTIZATION = "Devolução de capital":** O tipo `AMORTIZATION` exibe o subtítulo "Devolução de capital", nunca como mera "Amortização" sem contexto
- **Não há cálculo client-side de percentual por conta:** ViewModels no cliente não calculam percentuais de alocação ou participação por conta a partir de quantidades
- **Integração com Engine 1.0 RC:** As visualizações são compatíveis com a versão congelada do Portfolio Engine 1.0 Release Candidate (1.0.0-rc.1)

- **Rotas:**
  - **Web:** `/portfolio/history?portfolioId=:portfolioId`
  - **Mobile:** `/(app)/portfolio/history?portfolioId=:portfolioId`
- **Contrato Oficial Consumido:**
  - `GET /api/v1/portfolios/:portfolioId/history?type=&from=&to=&accountId=&assetId=&cursor=&limit=25`
- **Filtros Oficiais Suportados:**
  - **Período:** Presets rápidos (30 dias, 90 dias, ano atual, todo período) ou intervalo civil personalizado (`from`/`to` no formato `YYYY-MM-DD`).
  - **Tipo de Evento:** Vendas (`realized`), Rendimentos (`income`), Movimentações de Caixa (`cash-flow`), Eventos Corporativos (`corporate-action`) e Transferências (`transfer`).
  - **Conta de Custódia:** Filtro por instituição/corretora cadastrada na carteira (`accountId`).
  - **Ativo:** Filtro por ativo custodiado na carteira (`assetId`).
- **Paginação por Keyset Cursor:**
  - Consome o cursor opaco `meta.nextCursor` fornecido pela API sem qualquer decodificação no cliente.
  - Qualquer alteração nos filtros invalida o cursor e reseta a listagem para a primeira página.
  - Em caso de falha de conexão no carregamento de páginas adicionais, os eventos previamente carregados permanecem preservados e visíveis.
- **Taxonomia Canônica de Eventos (ADR-080):**
  - Vendas (`REALIZED_DISPOSAL`): "Venda".
  - Rendimentos (`INCOME`): "Dividendo", "JCP", "Rendimento de FII".
  - Caixa (`CASH_FLOW`): "Depósito", "Retirada", "Taxa", "Tributo pago" (nunca "Imposto devido"), "Amortização" ("Devolução de capital").
  - Eventos Corporativos (`CORPORATE_ACTION`): "Desdobramento", "Grupamento", "Bonificação", "Subscrição", "Amortização".
  - Transferências (`TRANSFER`): "Transferência de entrada", "Transferência de saída" (badge "Transferência incompleta" se despareada).
- **Segurança de Navegação para Posições Encerradas:**
  - O link para detalhes da posição (`/portfolio/assets/[assetId]`) é oferecido exclusivamente se o ativo possui posição em aberto no momento atual (`quantity > 0`). Posições encerradas exibem o identificador estático sem conduzir a telas enganosas.
- **Anti-Escopo Mantido:**
  - Proibidos cabeçalhos arbitrários de "Total movimentado" ou "Fluxo líquido consolidado".
  - Proibida qualquer inferência tributária, apuração de DARF ou cálculo de rentabilidade/performance.

## 10. Carteira Histórica — Time Travel por asOf (Fase 2F)

A Fase 2F expõe a reconstrução histórica do servidor (`GET /state?asOf=YYYY-MM-DD`, `GET /positions?asOf=`) como modo "Carteira em DD/MM/YYYY", distinto do modo "Hoje":

- **Projeção do replay oficial:** a UI envia `asOf` civil e apresenta o read model retornado com os mesmos mappers do modo atual. Nenhuma filtragem local de transações, nenhum recálculo de quantidade, preço médio, custo ou ganho.
- **Banner persistente:** "Visualizando carteira em DD/MM/YYYY" + badge "Histórico" + ação "Voltar para hoje" (limpa o parâmetro) em overview, asset detail e account detail.
- **Estado na URL (Web) / rota (Mobile):** `/portfolio?asOf=YYYY-MM-DD`; refresh, deep link e back/forward preservam o snapshot. Trocar de carteira limpa `asOf`.
- **Datas:** exibição `DD/MM/YYYY`, tráfego `YYYY-MM-DD` (LocalDate civil, sem timezone); hoje normaliza para modo atual; futuro é recusado ("Escolha uma data de hoje ou anterior"); inválida mostra "Data inválida."; anterior à primeira transação rende "Nenhuma posição nesta data." (sucesso, não erro).
- **Navegação com contexto:** asset/account detail aceitam `asOf`; segurança de navegação avalia o estado histórico (ativo fechado hoje mas aberto então continua acessível; ativo ausente então mostra "Este ativo não fazia parte da carteira nesta data."); conta sem posição histórica mostra "Esta conta não possuía posições abertas nesta data." sem afirmar lifecycle da entidade.
- **Sem comparações:** proibido exibir deltas hoje × passado, percentuais, TWR/XIRR, market value, P&L, benchmarks, FX, DARF/IRPF, gráficos patrimoniais e saldos de caixa.
- **Cache isolado:** chaves incluem `asOf ?? 'current'` por carteira/ativo/conta; sem N+1 nem colisão current × histórico.
