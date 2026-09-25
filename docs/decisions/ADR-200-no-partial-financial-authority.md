# ADR-200: Proibição de Autoridade Financeira Parcial em Streaming

## Status

Aceito (Fase 3U)

## Contexto

Na maioria dos sistemas de IA generativa comercial, o texto gerado pelo modelo é emitido token por token diretamente na tela do usuário. Em um contexto financeiro como o Project Atlas, tal prática acarreta riscos severos:

1. O modelo pode começar a redigir números incorretos ou alucinados (ex.: "Sua rentabilidade foi de 18%...") antes de qualquer validação.
2. Mesmo que um validador posterior detectasse o erro, o usuário já teria visto o número falso, ferindo a confiança e a integridade da plataforma.
3. Não há garantia de que o token emitido no meio de um stream corresponda à precisão canônica do ledger (ex.: frações de centavos ou strings decimais exatas).

## Decisão

1. **Buffer Obrigatório no Servidor:** A resposta bruta gerada pelo provedor de IA é integralmente recebida e retida em memória no servidor (`apps/api`). Nenhum fragmento de texto da resposta é emitido antecipadamente.
2. **Validação Prévia de Afirmações:** O analisador extrai as afirmações estruturadas (`GroundedClaimInput`) da resposta rascunhada e executa a validação canônica via `validateGroundedClaims`.
3. **Renderização pelo Servidor:** Todo e qualquer valor financeiro exibido na resposta é formatado e inserido exclusivamente pelo servidor (`renderValidatedClaims`) a partir dos fatos oficiais do grounding context.
4. **Isenção de Valores Financeiros em Eventos de Progresso:**
   - Os eventos de estágio `PROGRESS` (`CLASSIFYING`, `GROUNDING`, `GENERATING`, `VALIDATING`, `RENDERING`) são estritamente proibidos de carregar valores monetários, percentuais ou numéricos.
   - Servem exclusivamente como feedback de estado técnico e conforto visual.
5. **Entrega Apenas no Evento FINAL:**
   - A resposta analítica final e suas evidências comprovadas são transmitidas unicamente no evento terminal `FINAL`.

## Consequências

- Falsa autoridade financeira e alucinações numéricas parciais são matematicamente eliminadas.
- O cliente nunca recebe ou exibe dados financeiros não auditados.
- Preserva-se 100% da garantia da Fase 3T: "Nenhum valor financeiro apresentado ao usuário origina-se de literal do modelo".
