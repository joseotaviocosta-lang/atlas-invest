# ADR-018: Contratos de Paginação por Cursor e Filtros de Ledger na API

## Status

Aprovado

## Contexto

O Transaction Ledger de uma carteira de investimentos pode conter dezenas de milhares de eventos históricos. A paginação tradicional baseada em offset (`page=N`, `skip=N`) degrada em desempenho à medida que o offset aumenta e sofre de inconsistências (itens duplicados ou ignorados) quando novas transações são inseridas simultaneamente. Além disso, o processamento de portfólio exige travessia estritamente determinística.

## Decisão

1. **Ordenação Estritamente Determinística:**
   - As consultas ao ledger são ordenadas invariavelmente por:
     `tradeDate ASC, createdAt ASC, id ASC`.
   - Essa tupla de três campos garante que a ordem cronológica e de ingestão seja idêntica em qualquer consulta e em qualquer ambiente.
2. **Paginação Baseada em Cursor:**
   - O endpoint `GET /api/v1/portfolios/:portfolioId/transactions` suporta os parâmetros:
     - `limit`: número de registros desejados (mínimo 1, padrão 50, máximo 100).
     - `cursor`: UUID da última transação observada pelo cliente.
   - O caso de uso busca internamente `limit + 1` registros a partir do cursor (com `skip: 1` para avançar após o cursor).
   - Se existirem mais registros, define `hasMore: true` e retorna o `nextCursor` apontando para o último ID da página. Se não houver mais registros, `hasMore: false` e `nextCursor: null`.
3. **Filtros Econômicos e de Entidade:**
   - Suporte a filtros opcionais:
     - `accountId`: UUID da conta de custódia.
     - `assetId`: UUID do ativo negociado.
     - `type`: tipo da transação (ex: `BUY`, `SELL`, `DIVIDEND`).
     - `startDate` e `endDate`: intervalo de datas econômicas no formato `YYYY-MM-DD`.

## Consequências

- **Positivas:**
  - Desempenho linear e eficiente mesmo para ledgers volumosos com indexação pelo cursor do Prisma.
  - Zero duplicações durante paginação contínua em feeds ou reconciliações de dados.
- **Negativas / Mitigações:**
  - Navegação aleatória ("pular para página 15") não é suportada por design; aplicações de investimentos navegam por filtros de datas ou rolagem infinita.
