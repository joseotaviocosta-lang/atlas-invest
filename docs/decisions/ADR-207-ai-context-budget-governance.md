# ADR-207: Pre-Provider Context Budget Governance

## Status

Aceito (Fase 3V)

## Contexto

Requisições com históricos conversacionais excessivamente longos ou contextos com milhares de fatos serializados podem estourar as janelas de contexto dos modelos, gerar custos computacionais imprevisíveis ou degradar a qualidade da atenção do modelo.

Faz-se mandatória uma política de governança que intercepte requisições que excedam limites razoáveis de contexto antes que qualquer tráfego seja direcionado ao provedor.

## Decisão

1. **Limite de Tamanho de Contexto:**
   - Adotar `AI_DEFAULT_MAX_CONTEXT_BYTES = 32,768` (32 KB) como orçamento máximo padrão para o payload de contexto serializado.
2. **Avaliação Pura Pré-Provedor:**
   - A função pura `validateContextBudget(serializedBytes, maxBytes)` avalia o payload antes da invocação do provedor de IA.
3. **Rejeição Imediata com Zero Chamadas ao Provedor:**
   - Se o tamanho em bytes exceder o orçamento estipulado (mesmo por 1 byte), o use case aborta com código `AI.CONTEXT_BUDGET_EXCEEDED` (HTTP 400).
   - O número de chamadas ao provedor de IA (`providerCallCount`) permanece estritamente `0`.
   - A telemetria registra status `BUDGET_EXCEEDED` e tokens com `source: 'NOT_APPLICABLE'`.

## Consequências

- Proteção robusta contra sobrecarga e custos descontrolados de LLMs externos.
- Diagnóstico determinístico e previsível para requisições fora do padrão.
