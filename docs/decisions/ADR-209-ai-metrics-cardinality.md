# ADR-209: Metrics Low-Cardinality Dimension Governance

## Status

Aceito (Fase 3V)

## Contexto

Métricas de observabilidade (contadores, taxas e histogramas) são agregadas em sistemas de séries temporais (como Prometheus, Datadog ou OpenTelemetry). Incluir identificadores com alta cardinalidade (como UUIDs de usuário, carteira, conversa ou requisição) gera explosão combinatorial de dimensões de armazenamento, tornando o monitoramento excessivamente custoso e instável.

## Decisão

1. **Separação de Métricas e Logs/Traces:**
   - Identificadores de alta cardinalidade (`requestId`, `portfolioId`, `conversationId`, `userId`) são restritos a logs estruturados e traces distribuídos.
   - É expressamente **proibido** utilizar esses identificadores como tags ou dimensões em métricas agregadas.
2. **Função Pura de Extração de Labels:**
   - A função `extractSafeMetricLabels(telemetry)` extrai estritamente dimensões categóricas e delimitadas (`operation`, `deliveryMode`, `intent`, `status`, `provider`, `model`, `errorCode`).
3. **Padrão Canônico de Nomes de Métricas:**
   - Métricas adotam o prefixo `atlas.ai.*`:
     - `atlas.ai.requests.total`
     - `atlas.ai.requests.duration_ms`
     - `atlas.ai.provider.duration_ms`
     - `atlas.ai.tokens.total`
     - `atlas.ai.errors.total`
     - `atlas.ai.unsupported.total`
     - `atlas.ai.context_budget_exceeded.total`

## Consequências

- Armazenamento de métricas estável, com baixa sobrecarga e consumo previsível de memória.
- Correlação detalhada preservada com segurança através de logs estruturados correlacionados por `requestId`.
