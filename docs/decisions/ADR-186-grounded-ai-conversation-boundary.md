# ADR-186: Grounded AI Conversation Boundary

## Status

Approved (Fase 3S)

## Contexto

A Fase 3R introduziu a explicação factual e fundamentada em turno único (`POST /api/v1/portfolios/:portfolioId/ai/explain`). A Fase 3S introduz diálogos conversacionais multi-turnos (`POST /api/v1/portfolios/:portfolioId/ai/conversations/:conversationId/messages`).
Era necessário garantir que a adição de conversação multi-turnos não expandisse o escopo do assistente para além das capacidades factuais aprovadas, nem permitisse a invasão de papéis de recomendação, previsão ou recálculo financeiro.

## Decisão

1. A conversação de IA é uma extensão estrita da fundação de explicação (`@atlas/ai-engine`), mantendo os mesmos princípios canônicos:
   - Proibição absoluta de recomendações de compra, venda, alocação ou rebalanceamento.
   - Proibição absoluta de projeções de rentabilidade futura ou metas de preço.
   - Proibição absoluta de novos cálculos financeiros ou fórmulas em tempo de execução.
   - Isolamento cambial estrito (zero FX implícito).
2. O histórico conversacional existe exclusivamente para fornecer continuidade linguística (compreensão de anáforas e elipses) e NUNCA para introduzir novos fatos ou regras.
3. Não há uso de ferramentas (tool calling), agentes autônomos, busca na web, nem RAG/embeddings/banco vetorial.

## Consequências

- Capacidade factual estritamente delimitada e segura.
- Continuidade conversacional fluida para o investidor sem violar as regras regulatórias ou de integridade matemática do Project Atlas.
