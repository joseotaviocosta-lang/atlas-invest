# ADR-079: Portfolio History Filtering and Keyset Cursor Pagination

## Status

Accepted

## Context

Históricos de carteiras de investimento acumulam centenas ou milhares de movimentações ao longo dos anos. A leitura dessas movimentações não pode utilizar paginação por offset (`LIMIT/OFFSET`), que se degrada quadraticamente com grandes volumes e é suscetível a anomalias de "fantasma" ou perda de eventos sob inserções concorrentes.
Adicionalmente, os investidores necessitam filtrar eventos por período, tipo de evento, conta de custódia e ativo específico.

## Decision

1. **Paginação Estrita por Keyset Cursor:**
   - O cliente consome o endpoint `GET /api/v1/portfolios/:portfolioId/history` utilizando o cursor opaco fornecido em `meta.nextCursor`.
   - O cliente nunca decodifica, compõe, modifica ou assume estrutura interna para o cursor.
   - A requisição inicial utiliza `cursor=undefined/null` e as subsequentes passam `cursor=nextCursor` via `useInfiniteQuery`.
2. **Filtros Suportados Diretamente pelo Backend:**
   - A barra de filtros suporta estritamente os parâmetros do contrato congelado da Portfolio Read API v1:
     - `type`: `realized`, `income`, `cash-flow`, `corporate-action`, `transfer`.
     - `from` e `to`: formato civil `YYYY-MM-DD` com validação de monotonicidade (`from <= to`).
     - `accountId`: UUID da conta de custódia pertencente à carteira.
     - `assetId`: UUID do ativo.
     - `limit`: tamanho de página entre 20 e 50 itens (padrão: 25).
3. **Identidade da Query e Reset de Cursor ao Mudar Filtros:**
   - A chave de cache do TanStack Query é estruturada com base na tupla:
     `['portfolio-history', portfolioId, { type, from, to, accountId, assetId }]`.
   - O cursor de paginação não faz parte da chave da query (é gerenciado internamente pelo `pageParam` do `useInfiniteQuery`).
   - Toda alteração nos filtros altera a identidade da chave, acionando uma query limpa e descartando páginas obsoletas sem misturar dados antigos.
4. **Preservação de Eventos em Falha na Próxima Página:**
   - Se a requisição de carregamento da próxima página (`fetchNextPage`) falhar (por instabilidade de rede ou timeout), a lista de eventos previamente carregados permanece visível e intacta, exibindo mensagem amigável e botão de retentativa.

## Consequences

- Paginação estável em $O(1)$, imune a drift e duplicatas.
- Zero vazamento ou mistura de páginas de filtros ou carteiras distintas.
