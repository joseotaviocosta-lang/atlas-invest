# Portfolio AI Conversation API Contract v1 (Fase 3S)

**API Version:** `v1`
**Base Path:** `/api/v1/portfolios/:portfolioId/ai/conversations`
**Security:** `JwtAuthGuard` + Anti-enumeration (Hidden 404) + Rate Limit (`@Throttle({ default: { limit: 20, ttl: 60000 } })`)

---

## 1. Endpoints

### 1.1 Criar Conversa

- **Rota:** `POST /api/v1/portfolios/:portfolioId/ai/conversations`
- **Status:** `201 Created`
- **Body:** `{ "title"?: string }`
- **Resposta:**
  ```json
  {
    "data": {
      "id": "UUID",
      "portfolioId": "UUID",
      "title": "string | null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "archivedAt": null
    }
  }
  ```

### 1.2 Listar Conversas

- **Rota:** `GET /api/v1/portfolios/:portfolioId/ai/conversations`
- **Status:** `200 OK`
- **Query:** `limit` (default 20, max 100), `cursor` (UUID)
- **Resposta:**
  ```json
  {
    "data": [ ... ],
    "meta": {
      "limit": 20,
      "cursor": "UUID",
      "nextCursor": "UUID | undefined",
      "hasMore": false
    }
  }
  ```

### 1.3 Obter Conversa com Mensagens

- **Rota:** `GET /api/v1/portfolios/:portfolioId/ai/conversations/:conversationId`
- **Status:** `200 OK`
- **Query:** `limit` (default 50, max 100), `cursor` (UUID)
- **Resposta:**
  ```json
  {
    "data": {
      "id": "UUID",
      "portfolioId": "UUID",
      "title": "string | null",
      "messages": [
        {
          "id": "UUID",
          "conversationId": "UUID",
          "role": "USER | ASSISTANT",
          "content": "string",
          "status": "ANSWERED | UNSUPPORTED | PROVIDER_ERROR",
          "intent": "string | null",
          "evidenceSnapshot": [ ... ],
          "limitations": [ ... ],
          "provider": "string | null",
          "model": "string | null",
          "createdAt": "ISO-8601"
        }
      ]
    },
    "meta": {
      "limit": 50,
      "nextCursor": "UUID | undefined",
      "hasMore": false
    }
  }
  ```

### 1.4 Enviar Mensagem

- **Rota:** `POST /api/v1/portfolios/:portfolioId/ai/conversations/:conversationId/messages`
- **Status:** `200 OK`
- **Body:**
  ```json
  {
    "question": "string (min 3, max 2000)",
    "startDate": "YYYY-MM-DD (opcional)",
    "endDate": "YYYY-MM-DD (opcional)"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "data": {
      "schemaVersion": "1",
      "status": "ANSWERED",
      "intent": "EXPLAIN_PERFORMANCE",
      "answer": "string",
      "evidence": [ ... ],
      "limitations": [ ... ],
      "model": {
        "provider": "openai",
        "model": "gpt-4o-mini"
      },
      "userMessageId": "UUID",
      "assistantMessageId": "UUID"
    }
  }
  ```
- **Resposta Recusada (Gate Upstream):**
  ```json
  {
    "data": {
      "schemaVersion": "1",
      "status": "UNSUPPORTED",
      "intent": "UNSUPPORTED_RECOMMENDATION",
      "reason": "...",
      "answer": "O Project Atlas não realiza recomendações de investimento...",
      "evidence": [],
      "limitations": [],
      "userMessageId": "UUID",
      "assistantMessageId": "UUID"
    }
  }
  ```
