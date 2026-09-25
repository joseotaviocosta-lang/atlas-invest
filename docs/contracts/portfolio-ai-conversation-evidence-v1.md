# Portfolio AI Conversation Evidence Contract v1 (Fase 3S)

**Evidence Schema:** `MinimalEvidenceSnapshotFact`
**Status:** FROZEN
**Package:** `@atlas/ai-engine`

---

## 1. Princípio da Evidência Histórica vs Evidência Atual

Em conversas multi-turnos, existe uma distinção fundamental entre a evidência utilizada por uma resposta histórica e a evidência necessária para responder a uma nova pergunta:

1. **Evidência do Turno Atual (Current Turn):**
   - Validada estritamente contra o `PortfolioAiGroundingContextV1` reconstruído fresh na rodada.
   - Qualquer citação de `factId` inexistente no grounding atual resulta em `422 Unprocessable Entity`.
   - Se 0 evidências forem citadas para afirmações analíticas, a resposta é rejeitada com 422.

2. **Evidência Histórica Auditada (Historical Snapshot):**
   - No momento em que uma resposta de assistente é persistida, um snapshot minimalista contendo **apenas** os fatos efetivamente citados na resposta é salvo.
   - O snapshot contém:
     - `factId`: Identificador canônico do fato.
     - `category`: Categoria de inteligência (`PERFORMANCE`, `RISK`, etc.).
     - `metric`: Métrica formal (`TWR`, `VOLATILITY`, etc.).
     - `scope`: Escopo da métrica (moeda ou benchmark).
     - `value`: Valor serializado em string decimal canônica (`"12.50"`, `"1234.56"` ou `null`).
     - `unit`: Unidade (`PERCENTAGE`, `CURRENCY`, `RATIO`).
     - `nature`: Natureza (`HISTORICAL`, `HYPOTHETICAL`, `FACT`).
     - `asOf` / `period`: Janela econômica.
   - **Invariante:** Respostas históricas exibem seu snapshot persistido. Elas NUNCA são atualizadas silenciosamente com os valores correntes do dia de hoje.
