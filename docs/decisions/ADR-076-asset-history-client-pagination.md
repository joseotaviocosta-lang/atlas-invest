# ADR-076: Asset History Client Pagination & Keyset Navigation

## Status

Accepted

## Context

O extrato histórico de um ativo em carteiras ativas pode acumular centenas ou milhares de movimentações ao longo de anos (compras fracionadas, desdobramentos, amortizações, dividendos mensais, vendas parciais e transferências de custódia). Carregar todos os eventos em uma única requisição HTTP causaria degradação de desempenho, consumo excessivo de memória em clientes móveis e latência indesejada.

O endpoint de leitura do Portfolio Engine expõe suporte a paginação auditável por cursor opaco:
`GET /api/v1/portfolios/:portfolioId/history?assetId=:assetId&limit=:limit&cursor=:cursor`

## Decision

1. **Uso de Infinite Query (TanStack Query):**
   - Tanto na Web quanto no Mobile, a consulta do histórico do ativo utiliza `useInfiniteQuery` com `initialPageParam: null` e resolução de próxima página via `lastPage.meta.nextCursor`.
2. **Deduplicação Determinística no Cliente:**
   - Para prevenir duplicação acidental caso novas transações sejam inseridas enquanto o usuário navega, os itens recebidos nas diferentes páginas do cursor são achatados e deduplicados por `item.id` utilizando um `Set<string>`.
3. **Alvos de Toque Acessíveis para Carga Adicional:**
   - Na Web e no Mobile, o carregamento de mais eventos é acionado sob demanda por botão explícito ("Carregar mais movimentações") com altura mínima garantida de $44\text{px}$ (`minHeight: 44`), prevenindo loops infinitos de rolagem descontrolada.
4. **Isolamento por Ativo e Carteira:**
   - A `queryKey` é estritamente composta por `['portfolio-history', activePortfolioId, assetId]`, garantindo que filtros de ativo nunca poluam o cache de outros ativos ou carteiras distintas.

## Consequences

- Desempenho otimizado mesmo para ativos com centenas de dividendos ou transações frequentes.
- Navegação resiliente e auditável sem perda de contexto ou ordenação temporal.
