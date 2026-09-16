# ADR-045: Realized Result Aggregation Policy

## Status

Accepted

## Context

Ao derivar o estado de um portfólio no `PortfolioReplayEngine`, operações de venda podem ocorrer em múltiplas contas ou em diferentes datas ao longo do histórico. É necessário definir regras para consolidação dos resultados realizados nos níveis de conta (`AccountState`) e de portfólio (`PortfolioState`), bem como o tratamento seguro para múltiplas moedas.

## Decision

1. **Agregação Estrita por Soma Linear**:
   Os montantes financeiros acumulados em um período/corte histórico são a soma aritmética exata dos eventos de alienação da respectiva moeda:
   - $\text{portfolioGrossProceeds} = \sum \text{accountGrossProceeds} = \sum \text{disposalGrossProceeds}$
   - $\text{portfolioSellingCosts} = \sum \text{accountSellingCosts} = \sum \text{disposalSellingCosts}$
   - $\text{portfolioNetProceeds} = \sum \text{accountNetProceeds} = \sum \text{disposalNetProceeds}$
   - $\text{portfolioCostBasisRemoved} = \sum \text{accountCostBasisRemoved} = \sum \text{disposalCostBasisRemoved}$
   - $\text{portfolioRealizedGainLoss} = \sum \text{accountRealizedGainLoss} = \sum \text{disposalRealizedGainLoss}$

2. **Proibição de 'Média de Retornos'**:
   O retorno realizado consolidado **nunca** deve ser calculado como a média simples ou aritmética dos retornos percentuais das contas ou vendas individuais ($\text{avg}(R_A, R_B)$ é proibido).
   O retorno ponderado consolidado é calculado estritamente por:
   $$\text{portfolioRealizedReturnPercentage} = \frac{\text{portfolioRealizedGainLoss}}{\text{portfolioCostBasisRemoved}} \times 100$$
   quando $\text{portfolioCostBasisRemoved} > 0$.

3. **Segregação Estrita por Moeda (Multi-Currency Safety)**:
   Resultados realizados em moedas diferentes (ex: `BRL` e `USD`) não são convertidos nem somados num único valor. As estruturas `AccountState.realizedSummary` e `PortfolioState.realizedSummary` utilizam um mapa indexado por moeda (`ReadonlyMap<Currency, RealizedSummary>`), garantindo que cada moeda possua sua própria sumarização contábil independente.

4. **Propagação de Invariantes**:
   A relação $\text{netProceeds} - \text{costBasisRemoved} = \text{realizedGainLoss}$ é garantida em todos os níveis de agregação (evento individual, conta e portfólio).

## Consequences

- **Positivas:**
  - Consistência contábil irrepreensível: a soma dos ganhos das contas é identicamente igual ao ganho do portfólio.
  - Eliminação de distorções estatísticas decorrentes de médias de taxas percentuais heterogêneas.
  - Compatibilidade com estruturas multimoeda sem presunção de taxas de câmbio arbitrariamente fixadas.
- **Negativas:**
  - A consolidação global multimoeda em uma moeda base única exigirá motor cambial explícito em fase futura.
