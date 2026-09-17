# ADR-066: Categorized Portfolio History Read Model & Keyset Pagination

## Status

Accepted

## Context

Para que o investidor visualize o extrato de eventos de sua carteira (vendas com apuração de ganho/perda, dividendos recebidos, subscrições, desdobramentos e transferências de custódia), é necessário um modelo de leitura consolidado que unifique os diferentes eventos produzidos pelo replay determinístico.

Esses eventos precisam ser filtráveis por tipo, intervalo de datas (`from`, `to`), conta e ativo, além de suportar paginação eficiente e ordem cronológica reversa (os eventos mais recentes primeiro).

## Decision

1. **Unificação de Eventos no Read Model de Histórico**:
   - Foi criado o endpoint `GET /api/v1/portfolios/:portfolioId/history`.
   - O read model mapeia os resultados do replay em uma lista unificada de itens (`PortfolioHistoryItemReadModel`), categorizados por `kind`:
     - `REALIZED_DISPOSAL`: Vendas e alienações que geraram apuração de ganho/perda de capital e consumo de custo.
     - `INCOME`: Proventos creditados (dividendos, JCP, rendimentos).
     - `CASH_FLOW`: Movimentações de caixa externas (aportes, retiradas, taxas, custos).
     - `CORPORATE_ACTION`: Ações corporativas aplicadas (splits, reverse splits, bonificações, amortizações).
     - `TRANSFER`: Transferências de custódia entre contas ou externas.

2. **Ordenação Determinística Cronológica Reversa**:
   - Os eventos são ordenados de forma estrita e determinística por: `tradeDate DESC, id DESC`.
   - Isso garante uma apresentação natural de extrato bancário/corretora (mais recentes primeiro).

3. **Paginação Estável via Keyset Cursor**:
   - A paginação utiliza cursor estável baseado no identificador do evento (`id`), evitando anomalias de "pulo de registro" (offset pagination drift).
   - O payload retorna a estrutura paginada padrão:
     - `data`: lista de itens da página atual.
     - `meta`: metadados de paginação contendo `limit`, `cursor`, `nextCursor`, `hasMore` e `totalCount`.

4. **Validação de Parâmetros de Filtro**:
   - O parâmetro `type` aceita os valores enum `['realized', 'income', 'cash-flow', 'corporate-action', 'transfer']`.
   - O intervalo `from` e `to` valida a existência real no calendário civil gregoriano e garante que `from <= to`, retornando HTTP `400 Bad Request` com código `PORTFOLIO.INVALID_DATE_RANGE` em caso de inversão.

## Consequences

- **Positivas:**
  - Visão unificada de extrato patrimonial sem necessidade de múltiplas chamadas especializadas.
  - Navegação suave e determinística na interface por meio da paginação com cursor.
  - Alinhamento pleno com a taxonomia de eventos do Portfolio Engine.
- **Negativas:**
  - A geração do extrato exige a execução do replay completo (ou até a data `to`) para derivar os eventos e seus impactos econômicos.
