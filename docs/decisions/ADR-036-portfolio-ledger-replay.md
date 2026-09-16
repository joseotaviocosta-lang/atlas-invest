# ADR-036: Portfolio Ledger Replay Architecture

## Status

Accepted

## Context

O Project Atlas estabeleceu no ADR-004 que o Transaction Ledger é a Fonte Única da Verdade (Source of Truth) e que todas as posições são estados derivados. Na Fase 1A, surge a necessidade de materializar o componente central de computação: o `PortfolioReplayEngine`.

É crucial definir formalmente as fronteiras do motor, garantindo que ele opere como uma função pura e desacoplada do banco de dados, da camada de rede e de frameworks, garantindo determinismo absoluto, reproducibilidade histórica e isolamento estrito entre carteiras.

## Decision

1. **Pure Stateless Replay Engine**: O `PortfolioReplayEngine` é implementado em `@atlas/portfolio-engine` como um serviço puro, sem estado interno mantido entre invocações e sem dependência de I/O ou banco de dados.
2. **Deterministic Derivation**: Dado o conjunto ordenado de transações de um `portfolioId` e uma data de corte opcional `asOfDate`, o motor reconstrói deterministicamente o estado derivado (`PortfolioState`, `AccountState`, `AssetState`).
3. **Input & Output Immutability**: Os arrays e objetos de entrada nunca sofrem mutação. A estrutura de saída (`ReplayResult`) e todos os subobjetos são profundamente congelados (`Object.freeze`).
4. **Zero Persistent Position Tables in Phase 1A**: Não são criadas tabelas relacionais de posições consolidadas no banco de dados. Todas as posições são derivadas sob demanda pelo motor.
5. **Strict Portfolio Isolation**: O motor rejeita transações pertencentes a outro `portfolioId` lançando `CrossPortfolioTransactionError`.
6. **Transaction ID Uniqueness**: Duplicações de IDs de transação no mesmo lote de entrada são rejeitadas com `DuplicateTransactionError`.

## Consequences

- **Positivas:**
  - Auditabilidade matemática total: qualquer estado histórico em qualquer data pode ser recalculado exatamente.
  - Zero risco de desincronização entre banco e estado em memória.
  - Facilidade extrema de testes unitários através de cenários declarativos.
  - Portabilidade total: o motor pode ser executado no backend, em workers de processamento ou em testes sem dependências externas.
- **Negativas:**
  - A reconstituição completa para carteiras com centenas de milhares de transações exigirá, em fases posteriores, mecanismos de snapshots persistentes e replays incrementais a partir do snapshot mais recente.
