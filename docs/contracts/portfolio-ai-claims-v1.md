# Portfolio AI Claims Contract v1 (Fase 3T)

**Schema Version:** `1`
**Policy Version:** `1`
**Status:** FROZEN
**Package:** `@atlas/ai-engine`

---

## 1. Finalidade

O contrato de afirmações fundamentadas (`Grounded Claims`) define a estrutura de dados canônica para decompor respostas de inteligência artificial em afirmações discretas, auditáveis e vinculadas a fatos canônicos de evidência no Project Atlas.

O objetivo é substituir a dependência de prosa livre não-verificada por declarações estruturadas com autoridade de renderização estritamente servidora (`Server Authority`), eliminando alucinações numéricas e divergências em métricas financeiras.

---

## 2. Invariante Central

> **NENHUM VALOR FINANCEIRO APRESENTADO AO USUÁRIO ORIGINA-SE DE LITERAL DO MODELO.**
> Todo número financeiro exibido é renderizado deterministicamente no servidor através de segmentos do tipo `FACT_VALUE`, obtidos exclusivamente do grounding canônico ou de snapshot histórico auditável.
> Segmentos do tipo `TEXT` são proibidos de conter grandezas monetárias ou percentuais arbitrários.

---

## 3. Tipos Canônicos de Afirmação (`GROUNDED_CLAIM_TYPES`)

A taxonomia de afirmações é exaustiva e composta por 7 tipos fechados:

| Tipo                     | Descrição                                                                           | Categorias de Fatos Compatíveis                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FACTUAL_METRIC`         | Afirmação sobre métrica realizada da carteira (patrimônio, rentabilidade, alocação) | `PORTFOLIO_VALUATION`, `PORTFOLIO_PERFORMANCE`, `BENCHMARK_COMPARISON`, `ACTIVE_PERFORMANCE`, `ROLLING_PERFORMANCE`, `ALLOCATION_BREAKDOWN`, `PORTFOLIO_INTELLIGENCE`, `DATA_QUALITY` |
| `BENCHMARK_COMPARISON`   | Comparação contra índices de mercado (CDI, IBOV)                                    | `BENCHMARK_COMPARISON`, `ACTIVE_PERFORMANCE`, `PORTFOLIO_PERFORMANCE`                                                                                                                 |
| `RISK_EXPLANATION`       | Diagnóstico de risco observado (volatilidade, Sharpe, drawdown, VaR)                | `RISK_METRICS`, `RELATIVE_RISK`, `TAIL_RISK`                                                                                                                                          |
| `SCENARIO_EXPLANATION`   | Análise de simulação de estresse hipotético                                         | `SCENARIO_ANALYSIS` exclusivamente                                                                                                                                                    |
| `DATA_QUALITY`           | Advertência ou esclarecimento sobre integridade/cobertura de dados                  | `DATA_QUALITY`, `PORTFOLIO_INTELLIGENCE`                                                                                                                                              |
| `LIMITATION`             | Limitação metodológica ou analítica do sistema ou carteira                          | Todas as categorias informativas                                                                                                                                                      |
| `CONTEXTUAL_EXPLANATION` | Explicação conceitual de apoio sem invenção de dados                                | N/A (não cita valores factuais)                                                                                                                                                       |

---

## 4. Estrutura de Segmentos (`ClaimSegment`)

Cada afirmação (`GroundedClaimV1`) é composta por uma sequência ordenada de segmentos:

1. **`TEXT`**: Prosa explicativa conectiva.
   - Proibido conter valores monetários com moeda (ex: `R$ 1.000`) ou percentuais literais (ex: `15%`).
2. **`FACT_VALUE`**: Referência canônica a um fato existente no grounding.
   - `factId`: identificador canônico no formato `{CURRENCY}.{CATEGORY}.{METRIC}`.
   - `role`: papel semântico do fato (`PRIMARY`, `BENCHMARK`, `THRESHOLD`, `REFERENCE`).
3. **`FACT_LABEL`**: Rótulo oficial da métrica, renderizado deterministicamente pelo servidor.

---

## 5. Limites Estruturais

- Máximo de afirmações por resposta: **10**.
- Máximo de segmentos por afirmação: **10**.
- Mínimo de afirmações por resposta: **1** (respostas de IA não podem ser vazias).
