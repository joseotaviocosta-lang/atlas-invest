# ADR-196: Fail-Closed Claim Validation

## Status

Approved (Fase 3T)

## Contexto

A validação de afirmações estruturadas (`validateGroundedClaims`) é o guardião de integridade entre o modelo de linguagem gerador e o armazenamento/apresentação no sistema. Se o modelo falhar em produzir afirmações que respeitem a política e os fatos de evidência, o sistema deve adotar um comportamento determinístico e seguro.

## Decisão

1. A validação de afirmações opera em regime estritamente **fail-closed**:
   - Qualquer violação estrutural, semântica ou política resulta em rejeição imediata da resposta (`isValid: false` com array detalhado de `errors`).
   - Na camada de API, respostas inválidas do provedor disparam exceção HTTP 422 Unprocessable Entity com código `AI.INVALID_MODEL_RESPONSE`.
   - Nenhuma mensagem, turno ou afirmação inválida é persistida no banco de dados.
2. Invariantes verificados na validação:
   - Limite máximo de afirmações (<= 10) e segmentos por afirmação (<= 10).
   - Não-vacuidade: se o modelo responder, pelo menos uma afirmação válida deve ser fornecida.
   - Existência de fatos: todo `factId` referenciado em segmentos `FACT_VALUE` ou `FACT_LABEL` deve existir no mapa de fatos de grounding do contexto.
   - Fatos indisponíveis: fatos marcados como indisponíveis não podem ser usados como valores de métricas ativas ou afirmações conclusivas.
   - Proibição de aconselhamento e previsões: regex com normalização sem acentos para detectar palavras proibidas (recomendo, compre, venda, aporte, projecao, expectativa, prevejo, etc.).
   - Segmentos `TEXT` puros: proibido embutir literais de moeda (ex: `R$ 100`) ou percentuais (ex: `15%`).
   - Presença de valor: afirmações factuais (`FACTUAL_METRIC`, `BENCHMARK_COMPARISON`, etc.) devem conter pelo menos um segmento `FACT_VALUE`.
3. A função `validateGroundedClaims` é pura, determinística, síncrona e executa em O(N) com base em `Map<string, GroundedFactV1>`.

## Consequências

- Tolerância zero para alucinações ou evasões de restrições por parte de modelos de terceiros.
- Robustez operacional: falhas do LLM são interceptadas e impedidas de alcançar o cliente ou poluir o histórico conversacional.
