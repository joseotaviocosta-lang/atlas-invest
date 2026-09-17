# Formal Specification & Contract Freeze: Portfolio Read API v1

**Version:** `1.0.0-rc.1`  
**Base Path:** `/api/v1/portfolios`  
**Status:** Frozen Contract (Release Candidate)

---

## 1. Endpoints Overview

| Método | Caminho                                     | Descrição                                  | Parâmetros Principais                                           |
| :----- | :------------------------------------------ | :----------------------------------------- | :-------------------------------------------------------------- |
| `GET`  | `/api/v1/portfolios/:portfolioId/state`     | Estado consolidado patrimonial             | `asOf` (opcional, YYYY-MM-DD)                                   |
| `GET`  | `/api/v1/portfolios/:portfolioId/positions` | Posições abertas consolidadas ou por conta | `accountId` (opcional), `asOf` (opcional)                       |
| `GET`  | `/api/v1/portfolios/:portfolioId/history`   | Extrato cronológico unificado de eventos   | `type`, `from`, `to`, `accountId`, `assetId`, `cursor`, `limit` |

---

## 2. Padrões de Envelope e Serialização

### Envelope de Resposta

Todas as respostas de sucesso utilizam o envelope padrão:

```json
{
  "data": { ... }
}
```

Para listagens com suporte à paginação (`GET /history`), o envelope é estruturado em:

```json
{
  "data": [ ... ],
  "meta": {
    "limit": 50,
    "totalCount": 120,
    "hasMore": true,
    "nextCursor": "rd_3fa85f64-5717-4562-b3fc-2c963f66afa6"
  }
}
```

### Regras Estritas de Serialização

- **Zero Float**: Quantidades e valores monetários são serializados estritamente como strings numéricas decimais (ex: `"100.5"`, `"30.12"`).
- **Sem Notação Científica**: Nenhuma string decimal contém expoentes (ex: `1e-8`).
- **Custo Incompleto Nulo**: Quando `costBasisStatus === 'INCOMPLETE'`, `totalCost` e `averagePrice` são serializados como `null`.

---

## 3. Especificação dos Endpoints

### 3.1 `GET /api/v1/portfolios/:portfolioId/state`

Retorna a visão patrimonial consolidada e por conta.

**Query Parameters:**

- `asOf` _(opcional)_: Data limite civil gregoriana no formato `YYYY-MM-DD`.

**Response Schema (`200 OK`):**

```json
{
  "data": {
    "portfolioId": "uuid",
    "asOfDate": "2026-01-15" | null,
    "completeness": {
      "costBasis": "COMPLETE" | "INCOMPLETE",
      "overall": "COMPLETE" | "INCOMPLETE"
    },
    "positions": [
      {
        "assetId": "uuid",
        "ticker": "PETR4",
        "quantity": "100",
        "currency": "BRL",
        "costBasisStatus": "KNOWN" | "INCOMPLETE",
        "totalCost": { "amount": "2850.00", "currency": "BRL" } | null,
        "averageCost": { "amount": "28.50", "currency": "BRL" } | null
      }
    ],
    "accounts": [ ... ],
    "realizedSummaries": [ ... ],
    "incomeSummaries": [ ... ],
    "cashFlowSummaries": [ ... ],
    "replayMetadata": {
      "engineVersion": "1.0.0-rc.1",
      "processedTransactionCount": 42,
      "appliedTransactionCount": 42,
      "deferredTransactionCount": 0,
      "hasIncompleteCostBasis": false
    }
  }
}
```

---

### 3.2 `GET /api/v1/portfolios/:portfolioId/positions`

Retorna a lista de posições abertas (`quantity > 0`).

**Query Parameters:**

- `accountId` _(opcional)_: UUID de conta específica. Quando omitido, retorna consolidação da carteira.
- `asOf` _(opcional)_: Data limite civil `YYYY-MM-DD`.

**Response Schema (`200 OK`):**

```json
{
  "data": {
    "portfolioId": "uuid",
    "accountId": "uuid" | null,
    "asOfDate": "2026-01-15" | null,
    "positions": [ ... ]
  }
}
```

---

### 3.3 `GET /api/v1/portfolios/:portfolioId/history`

Retorna extrato cronológico reverso unificado de eventos patrimoniais e econômicos.

**Query Parameters:**

- `type` _(opcional)_: Filtro por tipo de evento (`realized`, `income`, `cash-flow`, `corporate-action`, `transfer`).
- `from` _(opcional)_: Data inicial `YYYY-MM-DD`.
- `to` _(opcional)_: Data final `YYYY-MM-DD`.
- `accountId` _(opcional)_: UUID da conta.
- `assetId` _(opcional)_: UUID do ativo.
- `cursor` _(opcional)_: String opaca identificando o último evento recebido na página anterior.
- `limit` _(opcional)_: Inteiro entre `1` e `200` (padrão: `50`).

**Ordenação:**

- Estrita: `tradeDate DESC, id DESC`.

---

## 4. Catálogo de Códigos de Erro da API de Leitura

| Código HTTP         | Código de Erro da API                 | Causa / Condição                                                                                  |
| :------------------ | :------------------------------------ | :------------------------------------------------------------------------------------------------ |
| `400 Bad Request`   | `PORTFOLIO.INVALID_AS_OF_DATE`        | Data `asOf` não existe no calendário civil gregoriano ou formato inválido.                        |
| `400 Bad Request`   | `PORTFOLIO.INVALID_DATE_RANGE`        | Intervalo `from > to` ou datas inválidas.                                                         |
| `400 Bad Request`   | `PORTFOLIO.INVALID_HISTORY_FILTER`    | Valor de `type` inválido ou `limit` fora do intervalo 1-200.                                      |
| `400 Bad Request`   | `PORTFOLIO.INVALID_PAGINATION_CURSOR` | Cursor inexistente no resultado filtrado ou reutilização entre carteiras distintas (IDOR).        |
| `404 Not Found`     | `PORTFOLIO.NOT_FOUND`                 | Identificador de carteira inexistente ou pertencente a outro usuário.                             |
| `404 Not Found`     | `ACCOUNT.NOT_FOUND`                   | Conta solicitada não pertence à carteira.                                                         |
| `422 Unprocessable` | `PORTFOLIO.REPLAY_FAILED`             | Inconsistência matemática ou de regras no ledger (ex: venda a descoberto, transações duplicadas). |
