# ADR-192: AI Conversation Tenant Isolation

## Status

Approved (Fase 3S)

## Contexto

O Project Atlas adota regras rigorosas de isolamento multitenant e anti-enumeração de recursos: nenhum investidor pode saber da existência ou acessar dados de carteiras de outro investidor, e requisições não autorizadas devem retornar invariavelmente `404 Not Found` (nunca `403 Forbidden`).

## Decisão

1. Toda conversa (`AiConversation`) possui relacionamento explícito com `userId` e `portfolioId`.
2. Todas as rotas de conversação (`/api/v1/portfolios/:portfolioId/ai/conversations/*`) realizam dupla validação de propriedade:
   - A carteira deve pertencer ao usuário autenticado (`principal.userId`).
   - A conversa deve pertencer à carteira informada e ao usuário autenticado.
3. Se qualquer uma das validações falhar, a API dispara compulsoriamente `404 Not Found` com código `PORTFOLIO.NOT_FOUND` ou `CONVERSATION.NOT_FOUND`.
4. Uma conversa nunca pode ser transferida ou acessada através de rota de outra carteira pertencente ao mesmo usuário (isolamento cross-portfolio).

## Consequências

- Proteção robusta contra ataques de enumeração e vazamento cross-user ou cross-portfolio.
