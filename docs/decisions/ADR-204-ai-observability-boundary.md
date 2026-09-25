# ADR-204: AI Observability Architecture & Pipeline Boundaries

## Status

Aceito (Fase 3V)

## Contexto

A esteira de inteligência artificial do Project Atlas orquestra múltiplos estágios analíticos e operacionais (classificação de intenção, verificação de propriedade, recuperação de histórico, grounding factual, chamada a provedores externos de LLM, validação estrutural de claims, renderização canônica e persistência transacional).

Na Fase 3V, faz-se necessária observabilidade de nível de produção (latência detalhada por estágio, contabilidade de tokens, rastreamento operacional e taxonomia de erros). No entanto, essa instrumentação não pode violar a separação arquitetural das camadas limpas, nem transformar a observabilidade em fonte de verdade financeira.

## Decisão

1. **Separação de Papéis e Fonte da Verdade:**
   - A telemetria descreve o comportamento operacional da esteira (durações, contagens, status de execução, erros técnicos).
   - A telemetria **NUNCA** é fonte de verdade financeira e não tem autoridade para calcular ou retificar métricas de carteira.
2. **Isolamento de Pacotes:**
   - O schema unificado e as funções puras de construção (`buildAiExecutionTelemetry`, `extractSafeMetricLabels`, `validateContextBudget`) residem em `@atlas/ai-engine`.
   - O `@atlas/ai-engine` permanece livre de dependências de logging (`@atlas/logger`), I/O, Prisma ou NestJS.
   - O sink de telemetria (`LoggingAiTelemetrySink`) reside na camada de infraestrutura de `apps/api` e injeta dependências via NestJS.
   - Os motores financeiros (`portfolio-engine`, `performance-engine`, etc.) **NUNCA** importam ou interagem com a camada de telemetria de IA.
3. **Garantia Fail-Open:**
   - Quaisquer exceções no registro da telemetria são capturadas de forma transparente (`try / catch`), impedindo que falhas em sinks de observabilidade interrompam ou quebrem a entrega de respostas para o usuário.

## Consequências

- Observabilidade unificada e precisa sem acoplamento a ferramentas proprietárias de monitoramento.
- Integridade total da esteira financeira e de respostas do usuário em caso de indisponibilidade de sinks.
