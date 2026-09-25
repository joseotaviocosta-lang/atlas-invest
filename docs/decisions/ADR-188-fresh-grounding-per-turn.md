# ADR-188: Fresh Grounding Per Turn

## Status

Approved (Fase 3S)

## Contexto

Durante uma conversa que pode durar dias ou semanas, ou mesmo em turnos consecutivos no mesmo dia, eventos financeiros reais (novos aportes, splits, amortizações, atualização de benchmarks) podem ocorrer na carteira. Reutilizar o grounding obtido no primeiro turno para responder perguntas subsequentes causaria respostas baseadas em premissas desatualizadas.

## Decisão

1. Para **cada turno suportado** da conversa, o caso de uso `GetPortfolioAiGroundingContextUseCase` é executado exatamente uma vez para obter um grounding context completamente atualizado (`fresh grounding`).
2. O prompt enviado ao provedor LLM para o novo turno inclui o grounding context recém-gerado, que substitui qualquer estado anterior como autoridade factual.
3. Se a pergunta for classificada como não suportada (gate de intenção), nenhuma chamada de grounding ou modelo é realizada (0 grounding, 0 modelo).

## Consequências

- Fatos financeiros refletem sempre o estado mais recente do Ledger e dos motores matemáticos.
- Zero trabalho de replay financeiro redundante além do pipeline canônico estabelecido na Fase 3Q.
