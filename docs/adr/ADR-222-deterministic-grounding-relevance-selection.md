# ADR-222: Seleção Determinística de Relevância no Grounding

## Status

Aceito (Fase 3Y)

## Contexto

A Fase 3X passou a enviar ao provedor todos os fatos canônicos do grounding. Isso é
seguro, porém ineficiente: um período com 50 eventos expandia-se em 304 fatos e mais de
117 KB de payload, com o array de fatos respondendo por cerca de 73% do total. Como o
orçamento de contexto é rigorosamente 32.768 bytes, pedidos legítimos de timeline com 15
ou mais eventos passavam a falhar fechado.

A causa não era o teto de eventos (que funcionou corretamente em 50), mas o envio
indiscriminado de fatos irrelevantes para a pergunta ativa: uma pergunta sobre
rentabilidade recebia também VaR, CVaR, drawdown, Sharpe, beta e cenários de estresse.

## Decisão

1. **Seleção Determinística Pré-Provedor:**
   - `selectGroundingFacts({ context, intent })` é uma função pura em `@atlas/ai-engine`
     que escolhe, antes de qualquer chamada ao modelo, o subconjunto de fatos canônicos
     exigido pela intenção e pelo escopo ativos.
   - Versão canônica da política: `GROUNDING_SELECTION_POLICY_VERSION = "1"`.

2. **Entradas Estritamente Permitidas:**
   - Intenção classificada deterministicamente (`classifyConversationIntent`), tipo de
     escopo, `AssetId` explícito, período, e os fatos canônicos já construídos.
   - É **terminantemente proibido** usar a saída do provedor, embeddings, similaridade
     vetorial, ranking por magnitude numérica de valores financeiros ou parsing de
     valores por expressão regular para decidir relevância.

3. **Mapa Intenção → Famílias de Fatos:**
   - `OVERVIEW` é sempre exigido como moldura interpretativa.
   - `EXPLAIN_PERFORMANCE` recebe performance e benchmark, **não** recebe cauda nem
     cenário; `EXPLAIN_RISK` recebe risco, risco ajustado, risco relativo e cauda, **não**
     recebe cenário; `EXPLAIN_SCENARIO` recebe cenário; `EXPLAIN_ASSET` recebe as famílias
     de ativo; `EXPLAIN_TIMELINE` recebe as famílias de evento.

4. **Isolamento de Escopo de Ativo:**
   - Em escopo `ASSET` ou `ASSET_TIMELINE`, fatos pertencentes a outro `AssetId` **nunca**
     são selecionados, reforçando na camada de seleção a proibição de evidência cruzada da
     Fase 3W.

5. **Ordenação Estável e Deduplicação Canônica:**
   - A ordem canônica de entrada é preservada; `factId` duplicado é colapsado.
   - Entradas idênticas produzem lista selecionada idêntica e bytes idênticos.
   - Complexidade de uma única passagem `O(n)` com `Set`/`Map`.

6. **Fallback Seguro e Delimitado:**
   - Intenção não mapeada define `usedFallback = true` e seleciona o subconjunto amplo
     seguro. Prefere-se abrangência segura a adivinhação agressiva.

7. **Manifesto de Seleção:**
   - Cada requisição produz `GroundingSelectionManifestV1` com contagens de fatos
     disponíveis, selecionados e excluídos, categorias, uso de fallback e
     `answerability` (`ANSWERABLE | LIMITED | UNAVAILABLE`), sem qualquer valor financeiro.

## Consequências

- Reduções medidas: performance de carteira 36,6%, custo médio de ativo 46,5%, timeline de
  10 eventos 70,2%, de 15 eventos 76,1%, de 50 eventos 85,4%.
- Timelines de 15 e de 50 eventos passam a caber no orçamento de 32.768 bytes.
- O motor financeiro não é alterado: zero novo replay, zero nova valuation, zero nova
  chamada de mercado, zero novo algoritmo financeiro.
- A seleção custa 0 chamadas de provedor.
