# ADR-068: Portfolio Read API v1 Contract Freeze

## Status

Accepted

## Context

A API HTTP de leitura do portfólio expõe o estado derivado recalculado sob demanda pelo Portfolio Engine. Para assegurar que clientes Web, Mobile e integrações de terceiros consumam os dados sem risco de quebra de contrato, é necessário congelar os endpoints, envelopes de resposta, convenções de paginação, parâmetros de consulta e formatos de serialização.

## Decision

1. **Congelamento dos Três Endpoints Centrais**:
   - `GET /api/v1/portfolios/:portfolioId/state`: Estado consolidado patrimonial da carteira e de suas contas.
   - `GET /api/v1/portfolios/:portfolioId/positions`: Posições abertas consolidadas ou filtradas por conta.
   - `GET /api/v1/portfolios/:portfolioId/history`: Extrato cronológico unificado com suporte a keyset cursor pagination.

2. **Envelope de Resposta Padrão**:
   - Todos os endpoints retornam o padrão de envelope `{ data: ... }` e, quando paginados, `{ data: [...], meta: { limit, totalCount, hasMore, nextCursor } }`.

3. **Política Estrita de Serialização de Decimais**:
   - Campos monetários e quantidades são sempre serializados como strings decimais numéricas (ex: `"100.50"`, `"30.12"`).
   - Valores nunca utilizam notação científica (ex: rejeição absoluta de `1e-8`).
   - Custo base incompleto é expressado como `null`, nunca omitido e nunca forjado como zero (`"0.00"`).

4. **Blindagem e Validação de Paginação**:
   - O parâmetro `limit` é restrito ao intervalo inteiro de 1 a 200 (padrão 50). Valores fora desse intervalo resultam em HTTP `400 Bad Request` com código `PORTFOLIO.INVALID_HISTORY_FILTER`.
   - Cursores de paginação inválidos ou forjados entre carteiras distintas (IDOR) são rejeitados com HTTP `400 Bad Request` com código `PORTFOLIO.INVALID_PAGINATION_CURSOR`.

## Consequences

- **Positivas:**
  - Interfaces cliente consom dados estruturados, consistentes e fortemente tipados.
  - Segurança reforçada contra manipulação de filtros e cursores entre usuários e carteiras.
- **Negativas:**
  - Adições de novos campos exigirão manter retrocompatibilidade com o schema congelado.
