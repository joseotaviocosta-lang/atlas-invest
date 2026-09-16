# ADR-016: Tratamento Unificado de Erros e Rastreabilidade (Tracing) na API

## Status

Aprovado

## Contexto

Aplicações financeiras exigem que respostas de erro sejam previsíveis, padronizadas, rastreáveis ponta a ponta e seguras contra vazamento acidental de dados sensíveis (valores de operações, senhas, chaves de API, credenciais bancárias ou stack traces internas).

## Decisão

1. **Envelope de Erro Padronizado:**
   Todas as exceções lançadas na API são interceptadas pelo `GlobalExceptionFilter` e formatadas no schema:
   ```json
   {
     "statusCode": 400,
     "error": "Bad Request",
     "code": "VALIDATION.INVALID_INPUT",
     "message": "Request validation failed",
     "details": [ ... ],
     "timestamp": "2026-09-15T21:00:00.000Z",
     "path": "/api/v1/portfolios",
     "requestId": "a1b2c3d4-..."
   }
   ```
2. **Mapeamento Semântico de Exceções de Domínio e Banco:**
   - `ZodError` -> `400 Bad Request` (`VALIDATION.INVALID_INPUT`) com array detalhado de `details`.
   - `DomainError` (ex: `InvalidMoneyError`, `InvalidLocalDateError`, `InvalidTransactionError`) -> `400 Bad Request` com código tipado do erro.
   - `EntityNotFoundError` -> `404 Not Found` com código `ENTITY.NOT_FOUND`.
   - `CrossPortfolioIntegrityError` -> `409 Conflict` (`PORTFOLIO.CROSS_PORTFOLIO_VIOLATION`).
   - `DuplicateExternalTransactionError` -> `409 Conflict` (`TRANSACTION.DUPLICATE_EXTERNAL_ID`).
   - `PersistenceError` / Exceções desconhecidas -> `500 Internal Server Error` (`INTERNAL_SERVER_ERROR`).
3. **Rastreabilidade com `x-request-id`:**
   - O middleware `RequestIdMiddleware` preserva o header `x-request-id` recebido ou gera um novo UUID v4 via `node:crypto`.
   - O header é injetado na resposta HTTP e registrado em todos os logs.
4. **Logging Seguro (Sanitização):**
   - Logs de erro registram exclusivamente: timestamp, `requestId`, método HTTP, URL, status code e mensagem resumida de erro.
   - O corpo da requisição (`body`) e campos financeiros nunca são despejados nos logs de erro.

## Consequências

- **Positivas:**
  - Diagnóstico simplificado de incidentes através do `requestId`.
  - Contrato estável para clientes mobile e web interpretarem erros de forma programática.
  - Conformidade com segurança da informação financeira e privacidade de dados.
- **Negativas / Mitigações:**
  - Erros 500 ocultam mensagens internas do cliente; desenvolvedores devem consultar os logs do servidor utilizando o `requestId`.
