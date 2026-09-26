# ADR-219: Bounded Event Context and Deterministic Selection

## Status

Aceito (Fase 3X)

## Contexto

Carteiras ativas com anos de histórico podem conter milhares de eventos de negociação, custódia e proventos. Injetar centenas de transações no prompt de um LLM estoura limites de contexto, degrada a qualidade da resposta e gera custos excessivos.

## Decisão

1. **Limite Estrito de Eventos:**
   - O grounding temporal seleciona no máximo 50 eventos (`MAX_AI_TIMELINE_EVENTS = 50`).
2. **Critério de Seleção Determinístico:**
   - Os eventos dentro do período solicitado são ordenados por `economicDate DESC, eventId DESC` para a seleção dos 50 mais recentes.
   - Em seguida, são dispostos em ordem cronológica `economicDate ASC, eventId ASC` para coerência narrativa no prompt.
3. **Divulgação Obrigatória de Truncamento:**
   - Quando o período contiver mais de 50 eventos, o contexto registra obrigatoriamente `summaryFacts.hasMore: true` e a limitação `PARTIAL_TIMELINE_EVENTS`. O sistema nunca trunca dados silenciosamente.

## Consequências

- Consumo previsível de contexto mantido dentro do orçamento orçado ($< 32.768$ bytes).
- Determinismo matemático na seleção, garantindo que execuções idênticas produzam os mesmos fatos.
