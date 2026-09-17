# ADR-063: Portfolio State & Positions API Contract

## Status

Accepted

## Context

Clientes front-end (Web e Mobile) e integrações precisam consultar o estado patrimonial consolidado de uma carteira, suas posições em aberto por ativo e a distribuição por contas de custódia.

De acordo com os princípios do Project Atlas, nenhuma posição é persistida estaticamente em tabelas relacionais (`Positions` ou `Snapshots`). Todo estado é derivado sob demanda diretamente do livro-razão de transações via replay determinístico do `PortfolioReplayEngine`.

## Decision

1. **Endpoints de Consulta de Estado**:
   - `GET /api/v1/portfolios/:portfolioId/state`:
     - Retorna o estado patrimonial consolidado: completude do custo médio (`completeness.costBasis`), posições em aberto por ativo, contas de custódia e seus respectivos saldos/posições, sumários de ganhos realizados, rendimentos acumulados, fluxos de caixa e metadados de execução do motor (`engineVersion`, `processedTransactionCount`, etc.).
   - `GET /api/v1/portfolios/:portfolioId/positions`:
     - Retorna especificamente o conjunto de posições em aberto (`positions`), opcionalmente filtradas por uma conta de custódia (`accountId`) pertencente à carteira.

2. **Autorização, Escopo e Preservação de Privacidade (Phase 0E)**:
   - Ambas as rotas exigem autenticação Bearer JWT (`@UseGuards(JwtAuthGuard)`).
   - O use case valida a titularidade da carteira (`portfolio.userId === principal.userId`). Caso pertença a outro usuário ou não exista, retorna `404 Not Found` (código `PORTFOLIO.NOT_FOUND`), prevenindo enumeração de recursos e vazamento de metadados.
   - Quando `accountId` for fornecido no query parameter, valida-se estritamente que a conta pertence à carteira solicitada (`account.portfolioId === portfolioId`). Em caso de divergência ou conta inexistente, retorna `404 Not Found` (código `PORTFOLIO.INVALID_ACCOUNT_SCOPE`).

3. **Tratamento de Falhas de Integridade do Livro-Razão**:
   - Se o livro-razão apresentar anomalia matemática que impeça o cálculo (como venda a descoberto ou corrupção de sequência), o motor dispara `PortfolioReplayError`, interceptado pelo `GlobalExceptionFilter` e mapeado para HTTP `422 Unprocessable Entity` com código `PORTFOLIO.REPLAY_FAILED`.

## Consequences

- **Positivas:**
  - Contrato HTTP coeso, seguro e aderente às convenções do projeto.
  - Eliminação de anomalias de estado desatualizado em tabelas derivadas.
  - Isolamento estrito entre usuários com respostas que evitam inferências de existência de contas alheias.
- **Negativas:**
  - Requer execução de replay do ledger em cada chamada, exigindo queries eficientes de transações indexadas por `portfolio_id`.
