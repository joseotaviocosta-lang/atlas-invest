# ADR-039: Zero Position Policy in Portfolio State

## Status

Accepted

## Context

Ao longo da vida útil de uma carteira de investimentos, posições são abertas por compras e fechadas integralmente por vendas ou transferências de saída. Quando a quantidade de um ativo atinge exatamente zero (`quantity.isZero()`), existem duas abordagens arquiteturais possíveis para a representação do estado da carteira:

1. Manter a posição no mapa de posições ativas com quantidade 0 (ghost positions).
2. Omitir a posição do mapa de posições ativas (`state.assets` e `accountState.assets`).

Manter posições zeradas no mapa ativo causa poluição de memória, sobrecarga em listagens de tela (exigindo filtros repetitivos em cada camada consumidora) e confusão conceitual em relatórios patrimoniais.

## Decision

1. **Omission of Zero Quantities**: Quando a quantidade de um ativo é zerada após uma venda ou transferência de saída, ele é omitido dos mapas de posições ativas em `AccountState.assets` e `PortfolioState.assets`.
2. **Strict Long-Only Protection**: A quantidade NUNCA pode transitar abaixo de zero. Se uma operação tentar deduzir mais do que a quantidade disponível na conta, o motor lança imediatamente `NegativePositionError`, rejeitando a transição.
3. **Auditability Preserved**: O histórico completo de transações que levou a posição a zero permanece íntegro no ledger e em `appliedTransactions`. O histórico e fechamento da posição são auditáveis pelas transações do ledger.
4. **Clean Active View**: `state.assets.size` reflete estritamente a quantidade de ativos com custódia positiva (> 0) na data de avaliação.

## Consequences

- **Positivas:**
  - Mapas de posições limpos e diretos: qualquer ativo presente em `PortfolioState.assets` possui quantidade estritamente positiva (`> 0`).
  - Simplificação das camadas superiores (API, Mobile, Web), que não precisam filtrar ativos com quantidade zero em suas telas de custódia.
  - Eliminação de acúmulo de posições extintas na memória ao longo dos anos de histórico.
- **Negativas:**
  - Consultas que precisem expressamente de relatórios de 'posições encerradas com preço médio histórico' (Fase 1B e Fase 1E) deverão inspecionar as vendas realizadas ou relatórios de encerramento específicos gerados pela Fase 1B.
