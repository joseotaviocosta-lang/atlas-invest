# ADR-227: Fatos Excluídos Não São Autoritativos

## Status

Aceito (Fase 3Y)

## Contexto

Introduzir seleção de relevância cria um risco novo e sutil: se o validador continuasse
verificando citações contra o conjunto canônico **completo**, o modelo poderia afirmar
algo sobre um fato que nunca lhe foi mostrado e a afirmação seria aceita. Na prática isso
seria alucinação validada — o pior resultado possível.

Exemplo concreto: uma pergunta sobre data de compra exclui deliberadamente o fato de valor
monetário. Se o modelo inventasse um valor e citasse o fato de valor excluído, uma
validação contra o conjunto completo aprovaria a citação.

## Decisão

1. **Registro Autoritativo Restrito ao Selecionado:**
   - `canonicalFactRegistry` contém **apenas** os fatos selecionados e é o único registro
     autoritativo do turno.

2. **Validação Contra a Autoridade Selecionada:**
   - `validateExplanationEvidence` e `validateGroundedClaims` operam sobre o contexto
     autoritativo do turno (`{ ...context, facts: selection.selectedFacts }`), nunca sobre
     o conjunto canônico completo.

3. **Citação de Fato Excluído Falha Fechada:**
   - Citar um fato excluído é indistinguível de citar um fato inexistente: rejeição
     imediata com `AI.INVALID_MODEL_RESPONSE` (422). Nenhuma resposta é persistida.

4. **Seleção Finalizada Antes do Provedor:**
   - A seleção é definida antes da chamada e **nunca** é revisada após a resposta. É
     proibido descartar fatos depois da resposta do provedor e igualmente proibido ampliar
     a autoridade para acomodar uma citação.

5. **Sem Requisição de Mais Fatos no Meio do Turno:**
   - Não há ferramentas e não há segunda chamada. Se o contexto selecionado não sustenta a
     resposta, o servidor expõe limitação ou indisponibilidade em vez de buscar mais dados.

6. **Ausência de Grounding Não É Resposta Silenciosa:**
   - Quando nenhum fato autoritativo é selecionado, `answerability = UNAVAILABLE`, e a
     pergunta não é tratada como respondível.

7. **Isolamento de Ativo Reforçado em Duas Camadas:**
   - A seleção já exclui fatos de outro `AssetId` em escopo de ativo, e a validação
     cruzada da Fase 3W permanece ativa sobre a autoridade selecionada.

## Consequências

- A superfície de alucinação encolhe junto com o contexto: o modelo só pode afirmar
  aquilo que efetivamente recebeu.
- Uma pergunta estreita produz autoridade estreita, por desenho.
- O comportamento é verificado por `AI-EVAL-042` e por testes dedicados de autoridade
  excluída.
