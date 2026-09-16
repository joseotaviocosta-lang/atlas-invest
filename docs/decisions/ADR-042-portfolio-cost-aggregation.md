# ADR-042: Multi-Account Cost Isolation and Portfolio Weighted Aggregation

## Status

Accepted

## Context

Um investidor pode manter custódias do mesmo ativo em múltiplas instituições financeiras (ex: 100 ações de PETR4 na Corretora XP e 50 ações de PETR4 no Nubank). Cada conta possui seu histórico independente de aquisições e, portanto, seus próprios custos totais e preços médios.

Ao consolidar a visão global do portfólio (`PortfolioState.assets`), é imperativo definir a metodologia de agregação patrimonial, prevenindo o erro comum de cálculo conhecido como "média de médias" (average of averages).

## Decision

1. **Custos Médios Independentes por Conta**:
   Cada conta (`AccountState.assets`) mantém seu próprio estoque contábil. Uma compra em uma conta não altera o custo médio das cotas custodiadas em outra conta da mesma carteira.

2. **Agregação Ponderada no Nível do Portfólio**:
   O preço médio consolidado de um ativo na carteira é derivado estritamente pela soma de todos os custos totais dividida pela soma de todas as quantidades em custódia:
   $$\text{portfolioTotalCost} = \sum_{a \in \text{accounts}} \text{accountTotalCost}_a$$
   $$\text{portfolioQuantity} = \sum_{a \in \text{accounts}} \text{accountQuantity}_a$$
   $$\text{portfolioAverageCost} = \frac{\text{portfolioTotalCost}}{\text{portfolioQuantity}}$$

3. **Proibição Estrita de Média Simples de Médias**:
   É terminantemente proibido calcular o preço médio da carteira pela média aritmética simples dos preços médios das contas:
   $$\text{portfolioAverageCost} \neq \frac{\text{avgCost}_{\text{accA}} + \text{avgCost}_{\text{accB}}}{2}$$

4. **Invariantes de Conservação Patrimonial**:
   - Invariante de Custo: $\sum \text{account.totalCost} == \text{portfolio.totalCost}$ (quando todos os custos são conhecidos).
   - Invariante de Quantidade: $\sum \text{account.quantity} == \text{portfolio.quantity}$.

5. **Tratamento de Custo Incompleto na Agregação**:
   Se qualquer conta contiver uma posição com `costBasisStatus === 'INCOMPLETE'` para aquele ativo, a visão agregada do portfólio para esse ativo também terá `costBasisStatus = 'INCOMPLETE'`, com `totalCost = undefined` e `averageCost = undefined`. A quantidade consolidada permanece exata. Custo desconhecido **nunca** é representado como zero (ADR-043).

## Consequences

- **Positivas:**
  - Exatidão matemática perfeita na consolidação multiconas.
  - Alinhamento entre extratos individuais de corretoras e o extrato consolidado global.
  - Eliminação de distorções patrimoniais causadas por pesos desiguais de custódia entre contas.
- **Negativas:**
  - A presença de uma transferência incompleta em uma conta marca o custo agregado do ativo como incompleto até que os metadados de aquisição sejam resolvidos.
