# ADR-193: Grounded Claim Types and Segment Structure

## Status

Approved (Fase 3T)

## Contexto

Nas Fases 3R e 3S, as respostas do modelo de IA eram geradas como prosa contínua com referências de evidência por IDs (`usedEvidenceFactIds`), mas sem correspondência direta entre afirmações financeiras individuais e os fatos canônicos. Para garantir integridade estrita e auditabilidade no nível da afirmação ("claim-level"), era necessário estruturar as respostas em declarações discretas compostas por segmentos tipados.

## Decisão

1. A resposta do modelo em `@atlas/ai-engine` é estruturada em uma lista ordenada de afirmações validadas (`claims: GroundedClaimV1[]`).
2. Cada afirmação possui um dos 7 tipos canônicos fechados (`GROUNDED_CLAIM_TYPES`):
   - `FACTUAL_METRIC`: afirmações sobre métricas factuais da carteira (valuation, performance, alocação).
   - `BENCHMARK_COMPARISON`: comparações com índices de referência (CDI, IBOV).
   - `RISK_EXPLANATION`: métricas e diagnósticos de risco (volatilidade, Sharpe, drawdown, VaR).
   - `SCENARIO_EXPLANATION`: simulações hipotéticas e testes de estresse pré-calculados.
   - `DATA_QUALITY`: avisos de qualidade de dados ou ativos sem cotação recente.
   - `LIMITATION`: limitações analíticas do sistema ou da carteira.
   - `CONTEXTUAL_EXPLANATION`: explicações conceituais estritamente contextuais e sem inventar dados.
3. Cada afirmação é composta por segmentos sequenciais (`ClaimSegment`):
   - `TEXT`: texto explicativo seguro sem números financeiros inventados.
   - `FACT_VALUE`: referência a um fato canônico (`factId`), com papel semântico explícito (`PRIMARY`, `BENCHMARK`, `THRESHOLD`, `REFERENCE`).
   - `FACT_LABEL`: rótulo descritivo canônico de um fato.
4. É imposto um limite superior rigoroso de no máximo 10 afirmações por resposta e 10 segmentos por afirmação.

## Consequências

- Rastreabilidade atômica: cada métrica citada aponta diretamente para o nó de evidência de onde se originou.
- Impossibilidade de o modelo fundir números ou omitir contexto sem que o validador do servidor detecte a incongruência.
