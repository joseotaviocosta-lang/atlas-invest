# ADR-215: Bounded Asset Context Scale Independence

## Status

Aceito (Fase 3W)

## Contexto

Uma carteira no Project Atlas pode conter 10 posições, 100 posições ou mais de 1.000 posições. Se a consulta sobre um ativo envolvesse serializar todas as posições da carteira no prompt do LLM, o consumo de tokens e a latência explodiriam, ultrapassando os limites do context budget.

## Decisão

1. **Contexto Bounded e Independente da Escala:**
   - O contexto de grounding de ativo (`PortfolioAssetAiGroundingContextV1`) inclui estritamente o resumo executivo da carteira e a fatia bounded de fatos do ativo consultado (`assetFacts`, limitado a $\le 25$ fatos).
   - O tamanho serializado do contexto de ativo permanece rigorosamente limitado a $\le 32.768$ bytes, independentemente do total de ativos sob custódia na carteira.
2. **Cardinalidade Estrita na Telemetria:**
   - Para métricas de observabilidade (`extractSafeMetricLabels`), a granularidade de escopo é agregada exclusivamente em `scopeType: 'PORTFOLIO' | 'ASSET'`. O `assetId` é excluído das labels de métricas para evitar explosão de cardinalidade no monitoramento.

## Consequências

- Custo de tokens e latência constantes e previsíveis para consultas de ativos.
- Garantia de governança e escalabilidade operacional para portfólios institucionais e de varejo.
