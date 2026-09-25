# ADR-199: Grounded AI Streaming Protocol & Architecture Boundary

## Status
Aceito (Fase 3U)

## Contexto
O Project Atlas adota uma arquitetura em camadas limpas e estritamente determinística:
Transaction Ledger → Portfolio Engine → Financial Engines → Portfolio Intelligence → AI Grounding → AI Explanation → AI Conversation → Claim Validation.

Na Fase 3U, surgiu a necessidade de introduzir uma experiência de streaming (Server-Sent Events - SSE) no envio de mensagens de diálogo (`POST .../messages/stream`), permitindo que investidores vejam o progresso da requisição em tempo real sem bloqueios opacos de interface.

Contudo, protocolos de streaming tradicionais em aplicações de IA frequentemente transmitem tokens parciais do LLM diretamente para o cliente à medida que são gerados. No Project Atlas, isso violaria o princípio inegociável de que **o modelo nunca é autoridade financeira** e subverteria a validação de afirmações estruturadas (ADR-193 a ADR-198), que exige validação rigorosa no servidor antes de qualquer exibição de números ao usuário.

## Decisão
1. **Protocolo SSE Puro e Unidirecional:** Implementar entrega em fluxo através de Server-Sent Events (SSE) padronizados (`text/event-stream`), com ciclo de vida estritamente delimitado e sequencial.
2. **Isolamento de Camada:**
   - A especificação do protocolo, sequenciador monotônico (`GroundedAiStreamEmitter`), serializador (`formatSseEvent`) e analisador (`parseSseStream`) residem exclusivamente em `@atlas/ai-engine`.
   - O `@atlas/ai-engine` permanece com zero dependências de frameworks HTTP, React, React Native ou banco de dados.
   - O orquestrador de aplicação (`StreamAiConversationMessageUseCase`) reside em `apps/api` e coordena a esteira analítica.
3. **Sequenciamento Monotônico e Travamento:**
   - Todo fluxo inicia com `sequence = 1` e incrementa estritamente `+1` a cada evento.
   - O fluxo transmite no máximo 8 eventos por mensagem.
   - Após emitir um evento terminal (`FINAL` ou `ERROR`), o emissor é compulsoriamente travado contra novas emissões.

## Consequências
- A experiência de streaming é previsível, determinística e facilmente testável.
- Interfaces web e mobile recebem estágios semânticos claros de processamento.
- Motores financeiros a montante permanecem completamente agnósticos quanto ao meio de transporte.

