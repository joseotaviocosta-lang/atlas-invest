# ADR-221: Historical Event Evidence Stability and Immutability

## Status

Aceito (Fase 3X)

## Contexto

Em conversas multi-turnos com a IA, novas mensagens podem ser enviadas após novas transações serem registradas no ledger. Mensagens passadas já persistidas no banco de dados devem preservar com exatidão o snapshot de evidências citado no momento de sua geração.

## Decisão

1. **Snapshot de Evidências Imutável:**
   - Mensagens persistidas mantêm seus snapshots mínimos de evidência (`evidenceSnapshot`) inalterados.
   - Mensagens antigas nunca são reescritas retroativamente quando novas transações ocorrem.
2. **Grounding Atualizado por Turno:**
   - A cada nova mensagem, o contexto de grounding é reconstruído deterministicamente a partir do estado atualizado do ledger.
   - O modelo responde à nova pergunta com base no contexto fresco, sem contaminação por dados defasados presentes no histórico de chat.

## Consequências

- Rastreabilidade e auditabilidade perfeitas de respostas passadas.
- Coexistência harmoniosa entre histórico imutável e respostas contemporâneas.
