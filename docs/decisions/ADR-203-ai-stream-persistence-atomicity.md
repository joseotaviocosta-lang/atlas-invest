# ADR-203: Atomicidade de Persistência em AI Streaming (Persist-Before-FINAL)

## Status
Aceito (Fase 3U)

## Contexto
O Project Atlas adota persistência estrita do histórico de conversas no PostgreSQL através do repositório `AiConversationRepository`.
Em uma entrega por streaming, surge a questão da ordem entre:
- Persistir o turno no banco de dados.
- Emitir o evento terminal `FINAL` no stream SSE para o cliente.

Se o evento `FINAL` fosse emitido antes da persistência no banco e a gravação falhasse, o investidor veria uma resposta na tela que não existiria no histórico persistido do servidor, causando discrepâncias e quebra de continuidade do diálogo em turnos subsequentes.

## Decisão
1. **Regra Persist-Before-FINAL:**
   - O turno da conversa é gravado de forma atômica no banco de dados via `conversationRepository.appendTurn` **antes** da emissão do evento terminal `FINAL`.
   - O `messageId` e o `turnIndex` atribuídos pelo repositório são incorporados na carga útil do evento `FINAL`.
2. **Rollback em Caso de Falha de Persistência:**
   - Se a operação de escrita no banco de dados falhar, o caso de uso intercepta a exceção e emite compulsoriamente um evento `ERROR` com código `AI.INTERNAL_ERROR`.
   - O evento `FINAL` nunca é transmitido se a persistência falhar.
3. **Turnos Sem Assistente em Caso de Abort ou Erro:**
   - Se o cliente desconectar, cancelar a requisição ou se o provedor falhar durante a geração/validação, nenhum turno de assistente respondido com sucesso é gravado no banco de dados.

## Consequências
- Garantia matemática de consistência entre o que o cliente recebe no evento `FINAL` e o que está gravado no banco de dados.
- O histórico da conversa nunca armazena turnos corrompidos ou fantasmas.

