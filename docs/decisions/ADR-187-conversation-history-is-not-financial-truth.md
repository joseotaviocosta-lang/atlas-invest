# ADR-187: Conversation History Is Not Financial Truth

## Status

Approved (Fase 3S)

## Contexto

Em modelos LLM conversacionais com histórico, declarações feitas pelo assistente em turnos anteriores ("No ano passado seu retorno foi 12%") tendem a ser tratadas pelo modelo como "fatos consolidados". Em finanças, o estado patrimonial e as métricas mudam continuamente conforme novas transações entram no ledger ou novas cotações são registradas. Permitir que o modelo use seu próprio texto anterior como evidência geraria alucinações cumulativas e dados desatualizados (stale data).

## Decisão

1. **O histórico da conversa é contexto narrativo e NUNCA fonte de verdade financeira.**
2. O modelo é explicitamente instruído na política do sistema (`PORTFOLIO_AI_CONVERSATION_POLICY_V1`) de que mensagens anteriores do assistente podem estar desatualizadas ou imprecisas, e que o grounding atual é a autoridade absoluta.
3. Para cada turno respondido, as citações de evidência (`evidenceFactIds`) devem obrigatoriamente se referir a fatos presentes no grounding ATUAL da rodada. Citar declarações anteriores ou fatos inexistentes no grounding corrente resulta em rejeição com status 422.

## Consequências

- Imunidade absoluta contra a propagação de erros conversacionais ou dados defasados.
- Preservação da hierarquia: Transaction Ledger → Portfolio Engine → Derived State → Intelligence → Grounding → IA.
