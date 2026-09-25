# Portfolio AI Conversation Contract v1 (Fase 3S)

**Schema Version:** `1`
**Policy Version:** `1`
**Status:** FROZEN
**Package:** `@atlas/ai-engine`

---

## 1. Finalidade

O contrato de conversação de IA fundamentada define as regras, garantias e interfaces para interações conversacionais multi-turnos sobre uma carteira de investimentos no Project Atlas.

O objetivo é prover continuidade contextual e linguística através de histórico delimitado (bounded history), sem jamais permitir que o histórico da conversa se torne fonte de verdade financeira ou substitua fatos auditados do Ledger.

---

## 2. Invariante Central

> **O HISTÓRICO CONVERSACIONAL NUNCA É FONTE DE VERDADE FINANCEIRA.**
> Afirmações anteriores do assistente ou do usuário são contexto narrativo não confiável.
> Para cada turno suportado, fatos financeiros são obtidos exclusivamente via `PortfolioAiGroundingContextV1` reconstruído fresh a partir do estado derivado do Portfolio Engine.

---

## 3. Delimitação de Escopo

1. **Escopo Estrito de Carteira:** Toda conversa pertence a exatamente um usuário autenticado e uma carteira. Não há conversas globais nem transferência de contexto entre carteiras.
2. **Proibição de Recomendações e Previsões:** Perguntas de acompanhamento como "E agora o que compro?" ou "Quanto vai render?" são interceptadas deterministicamente pelo gate de intenção e recusadas antes de qualquer chamada ao modelo ou grounding.
3. **Isolamento Cambial (Zero FX Implícito):** Perguntas de acompanhamento multimoeda nunca provocam consolidação cambial implícita.

---

## 4. Política de Histórico (Bounded History)

1. **Limite de Mensagens:** No máximo 10 mensagens mais recentes (5 pares de turnos).
2. **Orçamento de Caracteres:** No máximo 14.000 caracteres no histórico selecionado.
3. **Descarte Ordenado:** Mensagens mais antigas são descartadas primeiro (FIFO).
4. **Prioridade de Contexto:**
   1. Política do Sistema (`PORTFOLIO_AI_CONVERSATION_POLICY_V1`)
   2. Grounding Atual (`PortfolioAiGroundingContextV1`)
   3. Pergunta do Turno Atual
   4. Histórico Recente Delimitado

---

## 5. Auditoria de Evidência Histórica

1. Fatos citados em turnos passados são preservados como snapshots auditáveis mínimos (`MinimalEvidenceSnapshotFact`) contendo:
   - `factId`
   - `metric`
   - `scope`
   - `value` (string decimal canônica)
   - `unit`
   - `nature` (`HISTORICAL` | `HYPOTHETICAL` | `FACT`)
   - `asOf` / `period`
2. Respostas anteriores exibem seus snapshots originais de evidência e nunca são atualizadas silenciosamente com valores correntes.
3. Respostas do turno atual validam e resolvem evidências estritamente contra o grounding ATUAL.
