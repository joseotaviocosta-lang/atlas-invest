# Portfolio AI Stream API Contract v1 (Fase 3U)

**Route:** `POST /api/v1/portfolios/:portfolioId/ai/conversations/:conversationId/messages/stream`  
**Protocol:** HTTP/1.1 or HTTP/2 Server-Sent Events (SSE)  
**Status:** ACTIVE  
**Package:** `apps/api`

---

## 1. Descrição e Propósito

Disponibiliza entrega por fluxo (Server-Sent Events) para envio e processamento de mensagens em conversas de IA fundamentadas em carteiras do Project Atlas.

O endpoint opera de forma aditiva e complementar ao endpoint síncrono existente `POST /api/v1/portfolios/:portfolioId/ai/conversations/:conversationId/messages`, preservando 100% de compatibilidade retroativa e paridade semântica.

---

## 2. Cabeçalhos HTTP

### Requisição

- `Authorization: Bearer <access_token>` (Mandatório)
- `Content-Type: application/json` (Mandatório)
- `Accept: text/event-stream` (Recomendado)

### Resposta

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

---

## 3. Segurança e Isolamento Anti-Enumeração (Section 7)

1. **Validação Pré-Stream (`verifyOwnership`):**  
   Antes de confirmar ou enviar qualquer cabeçalho SSE (`res.flushHeaders()`), o endpoint verifica compulsoriamente se a carteira e a conversa pertencem ao usuário autenticado (`principal.userId`).
2. **Resposta 404 Estrita:**  
   Caso a carteira ou conversa pertença a outro investidor ou não exista, o endpoint responde imediatamente com HTTP 404 (`AI.CONVERSATION_NOT_FOUND`), impedindo vazamento de existência ou enumeração via sniffing de cabeçalhos.
3. **Throttling:**  
   Taxa controlada por `@Throttle({ default: { limit: 20, ttl: 60000 } })` (máximo de 20 mensagens por minuto por usuário).

---

## 4. Carga Útil da Requisição (`SendAiConversationMessageBody`)

```json
{
  "question": "Como foi o desempenho da minha carteira no período?",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31"
}
```

- `question`: string de 1 a 2000 caracteres (obrigatório).
- `startDate`: string de data civil ISO `YYYY-MM-DD` (opcional).
- `endDate`: string de data civil ISO `YYYY-MM-DD` (opcional).

---

## 5. Formato de Eventos SSE Wire Format

Cada evento obedece à especificação W3C SSE:

```text
event: <EVENT_TYPE>
data: <JSON_STRINGIFIED_PAYLOAD>

```

### Sequência Canônica de Eventos

1. `STARTED`: Identifica o início da requisição.
2. `PROGRESS` (`CLASSIFYING`): Classificação semântica da pergunta.
3. `PROGRESS` (`GROUNDING`): Extração de fatos auditados no ledger.
4. `PROGRESS` (`GENERATING`): Geração da resposta pelo modelo.
5. `PROGRESS` (`VALIDATING`): Validação das afirmações no servidor.
6. `PROGRESS` (`RENDERING`): Renderização de strings canônicas.
7. `FINAL`: Resposta validada, snapshot de evidências e turno persistido.

Em caso de falha irrecuperável ou cancelamento, um evento `ERROR` é emitido e o fluxo é encerrado imediatamente.
