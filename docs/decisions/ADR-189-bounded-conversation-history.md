# ADR-189: Bounded Conversation History

## Status

Approved (Fase 3S)

## Contexto

Conversas longas podem acumular centenas de mensagens, gerando crescimento linear de tokens de entrada para o LLM, o que encarece a operação, aumenta a latência e consome a janela de contexto necessária para o grounding factual. Além disso, sumarizações automáticas feitas por LLMs ("resumo de conversa") introduzem imprecisões e alucinações.

## Decisão

1. Implementar seleção de histórico determinística e estritamente delimitada através da função pura `selectConversationHistory`:
   - Limite de mensagens: no máximo 10 mensagens mais recentes (5 pares de turnos).
   - Limite de caracteres: no máximo 14.000 caracteres no histórico selecionado.
   - Algoritmo FIFO reverso: mensagens mais antigas são descartadas primeiro.
2. Não utilizar sumarizadores LLM em segundo plano na Fase 3S.
3. Prioridade de orçamento de contexto:
   1. Política do Sistema
   2. Grounding Atual da Carteira
   3. Pergunta do Usuário
   4. Histórico Selecionado

## Consequências

- Escala previsível: uma conversa com 500 mensagens envia exatamente o mesmo volume de tokens ao provedor que uma conversa com 10 mensagens.
- Preservação integral do espaço para o grounding factual.
