# ADR-044: SELL Proceeds and Economic Realized Result Calculation

## Status

Accepted

## Context

No Project Atlas, a Fase 1B consolidou a formação do custo de aquisição em compras (`BUY`), o preço médio ponderado por quantidade e a dedução proporcional de custo carregado em alienações.

Na Fase 1C, faz-se necessário formalizar a apuração matemática dos resultados de vendas (`SELL`): receita bruta, encargos acessórios da alienação, receita líquida, custo carregado removido, resultado realizado (lucro ou prejuízo econômico) e percentual de retorno realizado.

## Decision

1. **Fórmulas Canônicas de Alienação Econômica**:
   - **Valor Bruto da Venda (Gross Proceeds)**:
     $$\text{grossProceeds} = \text{sellQuantity} \times \text{unitPrice}$$
   - **Custos Explícitos de Alienação (Selling Costs)**:
     $$\text{sellingCosts} = \text{fees} + \text{taxes}$$
     Encargos intrínsecos à venda (corretagem, taxas B3) reduzem o valor líquido apurado. Devem ser expressos na mesma moeda da transação e não podem ser negativos. Registra-se que `SELL.taxes` representa única e exclusivamente encargos contratuais atribuídos à transação de alienação pelo intermediário/custodiante, não se confundindo com apuração fiscal, IRRF, DARF ou obrigação tributária.
   - **Valor Líquido da Venda (Net Proceeds)**:
     $$\text{netProceeds} = \text{grossProceeds} - \text{sellingCosts}$$
   - **Custo Carregado Removido (Cost Basis Removed)**:
     $$\text{costBasisRemoved} = \text{averageCostBefore} \times \text{sellQuantity}$$
     Calculado estritamente com base no preço médio pré-venda.
   - **Resultado Realizado (Realized Gain/Loss)**:
     $$\text{realizedGainLoss} = \text{netProceeds} - \text{costBasisRemoved}$$
     Valores positivos indicam ganho econômico; valores negativos indicam perda econômica; zero indica equilíbrio (_break-even_).
   - **Retorno Realizado Percentual (Realized Return Percentage)**:
     $$\text{realizedReturnPercentage} = \frac{\text{realizedGainLoss}}{\text{costBasisRemoved}} \times 100$$
     Calculado exclusivamente quando $\text{costBasisRemoved} > 0$. Caso o custo seja zero ou indefinido, o retorno é `undefined`.

2. **Invariância do Preço Médio Unitário Remanescente**:
   Em vendas parciais, o preço de realização (`unitPrice`) **não** altera o preço médio unitário das cotas restantes (`remainingAverageCost = averageCostBefore`).

3. **Liquidação Integral**:
   Em vendas totais, a posição atinge quantidade zero e é omitida do mapa ativo de posições (ADR-039). O evento `RealizedDisposal` é preservado integralmente no histórico derivado.

4. **Isolamento de Recompras Posteriores**:
   Recompras do mesmo ativo após liquidação total iniciam um novo histórico de custo carregado limpo, sem contaminação por alienações prévias.

5. **Exclusão de Emparelhamento Heurístico**:
   Taxas (`FEE`) ou tributos (`TAX`) lançados em transações separadas permanecem diferidos (ADR-038) e não são vinculados heuristicamente a operações `SELL`.

## Consequences

- **Positivas:**
  - Apuração econômica exata e determinística do resultado de cada venda.
  - Satisfação rigorosa da identidade contábil: $\text{netProceeds} - \text{costBasisRemoved} = \text{realizedGainLoss}$.
  - Independência completa de ponto flutuante via precisão decimal operacional de 40 dígitos.
- **Negativas:**
  - Vendas com custos em moedas divergentes da posição são rejeitadas até o suporte formal a câmbio (FX).
