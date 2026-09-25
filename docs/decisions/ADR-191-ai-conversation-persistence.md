# ADR-191: AI Conversation Persistence

## Status

Approved (Fase 3S)

## Contexto

Diferente da Fase 3R, onde toda interação era efêmera e sem persistência, a Fase 3S introduz a retenção e persistência do histórico conversacional para continuidade entre sessões do usuário. É indispensável definir o que pode e o que não pode ser persistido.

## Decisão

1. **Modelos Persistidos:**
   - `AiConversation`: metadados da conversa (`id`, `userId`, `portfolioId`, `title`, `archivedAt`, `createdAt`, `updatedAt`).
   - `AiConversationMessage`: mensagens individuais (`id`, `conversationId`, `role`, `content`, `status`, `intent`, `evidenceSnapshot`, `limitations`, `provider`, `model`, `providerRequestId`, `createdAt`).
2. **Proibições Estritas de Persistência:**
   - PROIBIDO persistir a chave de API do provedor ou tokens de autenticação.
   - PROIBIDO persistir o prompt bruto de sistema ou requisição bruta enviada ao provedor.
   - PROIBIDO persistir o contexto de grounding completo da carteira.
   - PROIBIDO persistir o livro de transações bruto (ledger).
3. **Atomicidade de Transação:**
   - No caso de uso `SendAiConversationMessageUseCase`, a mensagem do usuário e a resposta do assistente (ou recusa do gate) são persistidas conjuntamente em transação atômica (`appendTurn`), evitando estados inconsistentes (ex: pergunta órfã sem resposta).

## Consequências

- Persistência limpa, segura e auditável, compatível com as regras de privacidade e governança do Project Atlas.
