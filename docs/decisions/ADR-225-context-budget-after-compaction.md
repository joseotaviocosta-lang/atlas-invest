# ADR-225: Orçamento de Contexto Medido Após a Compactação

## Status

Aceito (Fase 3Y)

## Contexto

A Fase 3X estabeleceu uma decisão única e autoritativa de orçamento sobre o payload total
do provedor. A Fase 3Y introduz seleção de relevância e compactação antes dessa decisão.
Sem uma regra explícita de ordem, haveria risco de medir a estrutura canônica pré-compactação
(bloqueando indevidamente) ou de assumir que a compactação dispensa a medição (permitindo
indevidamente).

## Decisão

1. **Orçamento Congelado:**
   - `AI_DEFAULT_MAX_CONTEXT_BYTES = 32768` permanece **imutável**. A Fase 3Y é sobre
     eficiência, nunca sobre inflação de orçamento. Proibido elevar para 64 KB, 128 KB,
     tamanho de contexto do modelo do provedor ou aproximação por tokens.
   - O orçamento é medido em **bytes**, nunca em tokens.

2. **Ordem Canônica de Decisão:**

   ```
   grounding canônico
     -> seleção determinística de relevância
     -> compactação / projeção para o provedor
     -> mensagens finais do provedor
     -> medição exata de bytes UTF-8
     -> decisão de orçamento
     -> chamada ao provedor (somente se permitida)
   ```

3. **Objeto Medido:**
   - Exatamente o array `AIMessage[]` entregue a `AIProvider.complete`, via
     `Buffer.byteLength(JSON.stringify(messages), 'utf8')`, cobrindo política de sistema,
     histórico delimitado e o turno do usuário já compactado.

4. **Semântica Exata de Fronteira Preservada:**
   - `<= 32768` permitido; `> 32768` bloqueado. Concretamente: 32768 permitido, 32769
     bloqueado.

5. **Limites Anteriores Não São o Portão:**
   - `MAX_AI_TIMELINE_EVENTS = 50`, o histórico delimitado (10 mensagens / 14.000
     caracteres) e a seleção de fatos são limites **a montante**. `groundingSerializedBytes`
     permanece telemetria observacional e nunca é portão.

6. **Falha Fechada Após Compactação:**
   - Se o payload compactado ainda exceder o orçamento: 0 chamadas de provedor,
     `AI.CONTEXT_BUDGET_EXCEEDED`, nenhum evento `FINAL` no streaming, nenhuma resposta de
     assistente bem-sucedida persistida, sem retry, sem reparo, sem juiz e sem modelo de
     fallback.
   - É **proibido** descartar arbitrariamente mensagens do provedor para caber no
     orçamento.

7. **Buckets de Utilização:**
   - `classifyBudgetUtilization` produz rótulo delimitado de baixa cardinalidade
     (`LT_25`, `25_50`, `50_75`, `75_90`, `90_100`, `OVER`) para observabilidade.

## Consequências

- A compactação reduz bytes, mas nunca substitui a medição final.
- Casos legítimos que antes falhavam (timeline de 15 e de 50 eventos) passam a caber.
- Um pedido genuinamente grande — por exemplo 50 eventos somados ao histórico delimitado
  completo — continua falhando fechado, o que é o comportamento correto e esperado.
