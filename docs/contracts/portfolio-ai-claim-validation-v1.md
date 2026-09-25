# Portfolio AI Claim Validation Contract v1 (Fase 3T)

**Schema Version:** `1`
**Policy Version:** `1`
**Status:** FROZEN
**Package:** `@atlas/ai-engine`

---

## 1. Finalidade

Este documento define os critérios de validação determinística, pura e estrita para as afirmações estruturadas geradas por modelos de inteligência artificial (`validateGroundedClaims`), garantindo que nenhuma informação espúria ou violadora de políticas seja armazenada ou exposta aos usuários.

---

## 2. Invariante Fail-Closed

1. A validação de afirmações opera compulsoriamente em modo **Fail-Closed**:
   - `isValid: true` somente se **todas** as afirmações e segmentos forem 100% válidos.
   - Qualquer não-conformidade invalida o conjunto inteiro e retorna `isValid: false` com o rol detalhado de erros encontrados.
2. Na camada de API (`apps/api`), respostas inválidas disparam HTTP 422 Unprocessable Entity com payload:
   ```json
   {
     "statusCode": 422,
     "error": "Unprocessable Entity",
     "code": "AI.INVALID_MODEL_RESPONSE",
     "message": "Model response failed grounded claim validation",
     "details": [ ...erros de validação... ]
   }
   ```
3. Nenhuma mensagem ou turno associado a uma resposta que falhou na validação é gravada no banco de dados.

---

## 3. Matriz de Regras de Validação

| Regra                                   | Descrição                                                                                                                                                   | Comportamento em Falha |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Limite de Afirmações**                | Máximo de 10 claims e 10 segmentos por claim                                                                                                                | Rejeição (Fail-Closed) |
| **Não-Vacuidade**                       | Resposta deve conter ao menos 1 afirmação                                                                                                                   | Rejeição (Fail-Closed) |
| **Existência do Fato**                  | Todo `factId` em `FACT_VALUE` ou `FACT_LABEL` deve existir no grounding                                                                                     | Rejeição (Fail-Closed) |
| **Fato Disponível**                     | Fatos com `isAvailable: false` não podem ser usados em afirmações afirmativas de métricas                                                                   | Rejeição (Fail-Closed) |
| **Compatibilidade de Categoria**        | O tipo da afirmação deve ser compatível com a categoria do fato conforme `CLAIM_CATEGORY_COMPATIBILITY`                                                     | Rejeição (Fail-Closed) |
| **Presença de Valor Factual**           | Afirmações dos tipos `FACTUAL_METRIC`, `BENCHMARK_COMPARISON`, `RISK_EXPLANATION` e `SCENARIO_EXPLANATION` devem conter pelo menos um segmento `FACT_VALUE` | Rejeição (Fail-Closed) |
| **Proibição de Aconselhamento**         | Segmentos de texto não podem conter palavras de recomendação (recomendo, compre, venda, aporte, etc.)                                                       | Rejeição (Fail-Closed) |
| **Proibição de Previsões**              | Segmentos de texto não podem conter projeções ou promessas de retorno futuro                                                                                | Rejeição (Fail-Closed) |
| **Segmento TEXT sem Números Fictícios** | Segmentos `TEXT` não podem conter números de moeda (R$, US$) ou percentuais (%) mascarados                                                                  | Rejeição (Fail-Closed) |
| **Isolamento Cambial**                  | Uma única afirmação não pode misturar fatos monetários de moedas distintas sem contexto                                                                     | Rejeição (Fail-Closed) |
| **Consistência de Natureza Hipotética** | Fatos de cenários (`SCENARIO_ANALYSIS`) só podem ser referenciados em afirmações de tipo `SCENARIO_EXPLANATION`                                             | Rejeição (Fail-Closed) |
| **Consistência de Natureza Histórica**  | Fatos de cauda (`TAIL_RISK`) não podem ser referenciados como cenários hipotéticos                                                                          | Rejeição (Fail-Closed) |

---

## 4. Renderização Autoritativa do Servidor

A função `renderValidatedClaims(claims, facts)` substitui o texto bruto gerado pelo modelo:

- Concatena os segmentos `TEXT`, `FACT_LABEL` e `FACT_VALUE`.
- Para segmentos `FACT_VALUE`, injeta o valor canônico formatado via `formatFactValueForDisplay` em conformidade com as regras de precisão decimal e pt-BR.
- Garante separação legível entre afirmações sucessivas.
