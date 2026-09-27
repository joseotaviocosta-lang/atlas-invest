# ADR-223: Grounding Canônico versus Projeção para o Provedor

## Status

Aceito (Fase 3Y)

## Contexto

O grounding canônico (`PortfolioAiGroundingContextV1`, `PortfolioAssetAiGroundingContextV1`,
`PortfolioTimelineAiGroundingContextV1`) é rico e autoritativo por desenho: carrega
`source.contract`, `source.path`, períodos completos, metadados de validação e identidade
canônica em cada fato. Essa riqueza é necessária para validação e auditoria, mas o modelo
de linguagem não precisa de nada disso para explicar um fato.

Enviar a estrutura canônica diretamente ao provedor duplicava metadados de forma massiva:
em uma timeline de 50 eventos, cada evento gerava até 6 objetos de fato repetindo
`eventId`, `assetId`, `symbol`, `currency`, `nature`, `status`, `category` e `period`.

## Decisão

1. **Dois Conceitos Formalmente Distintos:**
   - **Grounding canônico:** rico, versionado, autoritativo. Permanece **inalterado** pela
     Fase 3Y. Continua sendo a fonte de verdade financeira e a base de validação.
   - **Projeção para o provedor:** representação compacta, local à requisição, derivada
     apenas dos fatos **selecionados**. Não possui autoridade própria.

2. **Contratos Anteriores Preservados:**
   - Os contratos de 3Q, 3W e 3X não são invalidados nem migrados. A projeção é uma
     representação adicional derivada.

3. **Regras de Compactação, Todas Preservadoras de Valor:**
   - Dicionário de ativos: `symbol`, `name` e identidade hoisted para `assets`; fatos e
     eventos referenciam por chave, com `assetId` canônico dentro da entrada.
   - Envelope de eventos: metadados do evento carregados **uma única vez**, em vez de
     repetidos em seis objetos atômicos.
   - Metadados internos de validação (`source.contract`, `source.path`, índices) não são
     enviados ao provedor.
   - Chaves abreviadas, documentadas ao modelo pelo adendo de formato.
   - `period` omitido apenas quando degenerado (`startDate === endDate === asOf`), caso em
     que `asOf` carrega informação idêntica.

4. **Proibições Absolutas de Compactação:**
   - Nunca arredondar, truncar ou reformatar string decimal exata.
   - Nunca remover `currency` de fato monetário.
   - Nunca remover `nature` onde distingue CURRENT / HISTORICAL / HYPOTHETICAL.
   - Nunca remover `status`; `null` significa indisponível e jamais é coagido a `0`.
   - Nunca fundir conceitos semanticamente distintos: realizado ≠ não realizado,
     `DIVIDEND` ≠ `JCP`, `BUY` ≠ `TRANSFER_IN`, moedas distintas nunca combinadas.
   - Nunca remover limitação necessária à interpretação.
   - Nunca remover diretriz de segurança da política de sistema para economizar bytes.

5. **Política de Sistema Preservada Verbatim:**
   - A mensagem de sistema é `PORTFOLIO_AI_CONVERSATION_POLICY_V1 +
COMPACT_CONTEXT_FORMAT_ADDENDUM`. O adendo apenas explica a estrutura compacta e a
     regra de citação; todas as proibições permanecem íntegras.

## Consequências

- O provedor recebe menos bytes sem perda de autoridade financeira.
- A auditoria e a validação continuam operando sobre a estrutura canônica rica.
- Nenhuma mudança de contrato de API cliente e nenhuma migração de banco de dados.
