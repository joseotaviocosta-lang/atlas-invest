# ADR-194: Server Authority and Claim-Rendered Answers

## Status

Approved (Fase 3T)

## Contexto

Modelos de linguagem (LLMs) são probabilísticos e suscetíveis a alucinações numéricas, inversões de sinal, arredondamentos arbitrários ou manipulações sutis de valores monetários. Em um sistema de inteligência financeira sério como o Project Atlas, a autoridade sobre os valores exibidos ao investidor deve ser 100% determinística e servidora.

## Decisão

1. O servidor é a autoridade absoluta e final sobre o conteúdo textual e numérico apresentado ao usuário (`Server Authority`).
2. O texto da resposta apresentado na API (`answer`) é renderizado no servidor via `renderValidatedClaims(claims, facts)` a partir dos segmentos validados das afirmações.
3. Para qualquer segmento do tipo `FACT_VALUE`, o valor numérico é obtido exclusivamente do nó de evidência no grounding canônico fornecido pelo servidor (ou do snapshot histórico imutável em turnos anteriores). O modelo não tem capacidade de alterar o número apresentado.
4. Caso a resposta original gerada pelo LLM contenha texto divergente, a renderização canônica baseada nas afirmações substitui a prosa não-verificada.
5. Se uma afirmação factual for apresentada sem apontar para um fato de evidência válido existente, ou se o texto contiver números financeiros literais mascarados, a validação falha imediatamente em regime fail-closed.

## Consequências

- Garantia matemática de que todo valor financeiro exibido ao investidor corresponde exatamente ao valor calculado pelas engines analíticas da plataforma.
- Eliminação total do risco de "alucinação de valores" (hallucinated numbers) nas interfaces Web e Mobile.
