# ADR-071: Large Ledger Regression & Payload Scaling Strategy

## Status

Accepted

## Context

À medida que o histórico de um investidor cresce (centenas ou milhares de transações ao longo de anos), surge a necessidade de assegurar que o replay determinístico mantenha desempenho aceitável e que o tamanho das respostas HTTP não cresça desproporcionalmente, degradando a experiência móvel e web.

## Decision

1. **Delimitação de Complexidade de Payload no Read Model de Estado (`O(posições)`)**:
   - O payload do endpoint `GET /api/v1/portfolios/:portfolioId/state` depende estritamente do número de posições ativas (`assets`) e contas (`accounts`), e NÃO do volume de transações históricas (`O(N)` onde N é número de transações).
   - Um histórico de 10.000 compras sobre 5 ativos produz um array de posições contendo exatamente 5 itens, mantendo a transferência de bytes na rede ultracompacta (< 10 KB).

2. **Paginação por Cursor no Histórico (`GET /history`)**:
   - O histórico de eventos econômicos e patrimoniais é consumido de forma fracionada via keyset pagination estável com limite padrão de 50 itens e teto máximo de 200 itens.
   - Isso impede o tráfego de megabytes de dados em dispositivos móveis e limita o processamento de serialização.

3. **Rejeição de Caching Prematuro de Snapshots no Banco**:
   - Conforme diretriz de escopo do Release Candidate 1.0, o motor permanece 100% puro e sem persistência intermediária de snapshots de posição ou cache em Redis.
   - O desempenho do motor em memória (com processamento de 10.000 transações em menos de 100ms) atende plenamente ao SLA de leitura interativa, eliminando complexidade operacional de invalidação de cache prematura.

4. **Monitoramento e Suite de Testes de Carga Contínua**:
   - Ficam mantidos testes de estresse com PRNG determinístico (`massive-replay.test.ts` e `large-ledger-read-model.test.ts`) para prevenir regressões de complexidade algorítmica em futuras iterações.

## Consequences

- **Positivas:**
  - Uso frugal de largura de banda e memória em clientes web e mobile.
  - Arquitetura limpa sem cache distribuído desnecessário nesta fase do produto.
- **Negativas:**
  - Para volumes extremos (ex: dezenas de milhares de operações em trading diário), fases futuras deverão introduzir snapshots auditáveis no banco de dados.
