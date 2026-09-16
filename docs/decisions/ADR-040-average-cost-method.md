# ADR-040: Weighted Average Cost Basis Method

## Status

Accepted

## Context

Na determinação do custo de aquisição e precificação patrimonial de ativos negociados em bolsa e fundos de investimento no Brasil, existem diferentes convenções de apuração de estoque contábil (ex: PEPS/FIFO, UEPS/LIFO e Média Ponderada Móvel). A legislação societária brasileira e as normas da Receita Federal do Brasil (Instrução Normativa RFB nº 1.585/2015) prescrevem o método do Custo Médio Ponderado Móvel para ativos em custódia.

Na Fase 1B do Project Atlas, o `PortfolioReplayEngine` implementa a matemática patrimonial de compras sucessivas (`BUY`). Faz-se necessário definir a metodologia de cálculo, a inclusão de custos acessórios de aquisição e a política de preservação de precisão decimal.

## Decision

1. **Método do Custo Médio Ponderado Móvel**: O preço médio unitário (`averageCost`) de um ativo é calculado pela razão estrita entre o custo total acumulado e a quantidade total em custódia:
   $$\text{averageCost} = \frac{\text{totalCost}}{\text{quantity}}$$
   É expressamente proibida a média aritmética simples de preços históricos de compra.

2. **Fórmula de Acumulação no BUY**:
   $$\text{grossCost} = \text{quantity} \times \text{unitPrice}$$
   $$\text{acquisitionCost} = \text{grossCost} + \text{fees} + \text{taxes}$$
   $$\text{newTotalCost} = \text{previousTotalCost} + \text{acquisitionCost}$$
   $$\text{newQuantity} = \text{previousQuantity} + \text{buyQuantity}$$
   $$\text{newAverageCost} = \frac{\text{newTotalCost}}{\text{newQuantity}}$$

3. **Custos Acessórios Atribuíveis**: Taxas de corretagem e emolumentos explicitamente presentes na transação de compra (`fees` e `taxes`) integram o custo de aquisição (`acquisitionCost`). Eventos de custo avulsos (`FEE`/`TAX` separados) permanecem diferidos (ADR-038) e não são vinculados heuristicamente a compras.

4. **Precisão Arbitrária sem Ponto Flutuante**: O cálculo utiliza exclusivamente instâncias de `Money` e `Quantity` sustentadas por `Decimal.js` (com precisão interna de 40 dígitos decimais e arredondamento `ROUND_HALF_UP`). Não há arredondamento prematuro para 2 casas decimais na raiz do motor.

5. **Isolamento de Moeda**: Cada posição possui uma moeda definida (`Currency`). Transações com moeda conflitante para o mesmo ativo na mesma conta são rejeitadas com `CurrencyMismatchError` (operações multimoeda com conversão cambial FX são diferidas para fases posteriores).

6. **Distinção entre Custo Patrimonial e Custo Fiscal**: O custo apurado pelo `PortfolioReplayEngine` é o custo contábil/patrimonial da carteira. Regras tributárias específicas (alíquotas, limites de isenção de R$ 20.000, compensação de perdas e emissão de DARF) pertencem exclusivamente ao futuro `Tax Engine`.

## Consequences

- **Positivas:**
  - Alinhamento total com as práticas contábeis e fiscais do mercado de capitais brasileiro (B3).
  - Determinismo matemático absoluto em qualquer quantidade de aportes sucessivos.
  - Ausência total de discrepâncias por arredondamento binário IEEE 754.
- **Negativas:**
  - Compras com custos em moedas distintas da posição exigirão conversão FX formal em fases futuras.
