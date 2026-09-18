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
