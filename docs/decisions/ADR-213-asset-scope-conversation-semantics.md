# ADR-213: Per-Message Conversation Scope & Anti-Bleed Semantics

## Status

Aceito (Fase 3W)

## Contexto

Em uma conversa contínua com a IA, o investidor pode alternar entre perguntas sobre a carteira como um todo e perguntas sobre ativos específicos. Se o escopo de um turno persistir silenciosamente para o próximo, perguntas genéricas podem ser erroneamente respondidas sob o contexto de um ativo antigo (stale scope bleed).

## Decisão

1. **Escopo Explícito por Mensagem:**
   - O escopo (`scope: { type: 'PORTFOLIO' } | { type: 'ASSET', assetId: string }`) é transmitido a cada mensagem.
   - Mensagens sem escopo explícito adotam por padrão `{ type: 'PORTFOLIO' }`.
2. **Precedência do Grounding Fresco sobre o Histórico:**
   - O histórico de conversas passado ao LLM é truncado e sanitizado (sem metadados de claims internos), servindo apenas para contexto semântico.
   - A autoridade factual de cada turno provém exclusivamente do contexto de grounding gerado no instante da requisição atual.
3. **Desacoplamento Visual e Limpeza de Escopo:**
   - As interfaces Web e Mobile exibem um banner de escopo ("Sobre PETR4") com ação explícita de "Limpar escopo", permitindo retornar suavemente à visão global da carteira.

## Consequências

- Zero vazamento de contexto entre ativos diferentes ou entre ativo e carteira global.
- Previsibilidade absoluta no roteamento de intenção e no orçamento de contexto.
