# ADR-040: Weighted Average Cost Basis Method

## Status

Accepted

## Context

Na determinação do custo de aquisição e precificação patrimonial de ativos em custódia, existem diferentes convenções de apuração de estoque contábil (ex: PEPS/FIFO, UEPS/LIFO e Média Ponderada Móvel).

Na Fase 1B do Project Atlas, o `PortfolioReplayEngine` adota o método do Custo Médio Ponderado Móvel como o método canônico de custo carregado do Portfolio Engine para compras sucessivas (`BUY`). Faz-se necessário definir a metodologia de cálculo, a inclusão de encargos operacionais intrínsecos de aquisição, a separação estrita da esfera fiscal e a política de preservação de precisão decimal operacional.

## Decision

1. **Método do Custo Médio Ponderado Móvel (Método Canônico de Custo Carregado do Portfolio Engine)**: O preço médio unitário (`averageCost`) de um ativo é calculado pela razão estrita entre o custo total acumulado e a quantidade total em custódia:
   $$\text{averageCost} = \frac{\text{totalCost}}{\text{quantity}}$$
   É expressamente proibida a média aritmética simples de preços históricos de compra.

2. **Fórmula de Acumulação no BUY**:
   $$\text{grossCost} = \text{quantity} \times \text{unitPrice}$$
   $$\text{acquisitionCost} = \text{grossCost} + \text{fees} + \text{taxes}$$
   $$\text{newTotalCost} = \text{previousTotalCost} + \text{acquisitionCost}$$
   $$\text{newQuantity} = \text{previousQuantity} + \text{buyQuantity}$$
   $$\text{newAverageCost} = \frac{\text{newTotalCost}}{\text{newQuantity}}$$

3. **Custos Acessórios Atribuíveis**: Taxas e emolumentos explicitamente presentes na transação de compra (`fees` e `taxes`) integram o custo de aquisição (`acquisitionCost`) como encargos da transação. Eventos avulsos (`FEE`/`TAX` separados) permanecem diferidos (ADR-038) e não são vinculados heuristicamente a compras.

4. **Precisão Decimal Operacional (Operational Decimal Precision)**: O cálculo utiliza contexto decimal de 40 dígitos sustentado por `Decimal.js` (com arredondamento `ROUND_HALF_UP`). Registra-se expressamente que 40 dígitos representam precisão decimal operacional suficiente para mitigar qualquer desvio cumulativo de ponto flutuante em sistemas financeiros, e não precisão matemática infinita. Não há arredondamento prematuro para 2 casas decimais na raiz do motor.

5. **Isolamento de Moeda**: Cada posição possui uma moeda definida (`Currency`). Transações com moeda conflitante para o mesmo ativo na mesma conta são rejeitadas com `CurrencyMismatchError` (operações multimoeda com conversão cambial FX são diferidas para fases posteriores).

6. **Portfolio Cost Basis ≠ Tax Basis**: O custo apurado pelo `PortfolioReplayEngine` é estritamente a base de custo patrimonial carregada (`portfolio cost basis`). Esta NÃO é a base fiscal tributária (`tax basis`). O futuro `Tax Engine` decidirá de forma autônoma como a base patrimonial se relaciona com a base fiscal, aplicando classificações tributárias, regras de day-trade vs. swing-trade, limites de isenção, compensação de prejuízos acumulados e emissão de DARF.

## Consequences

- **Positivas:**
  - Método canônico de custo carregado determinístico, consistente e independente de regras tributárias voláteis.
  - Separação cristalina de responsabilidades: o Portfolio Engine cuida da evolução patrimonial; o Tax Engine futuro cuidará das regras fiscais.
  - Ausência total de discrepâncias por arredondamento binário IEEE 754 graças à precisão decimal operacional de 40 dígitos.
- **Negativas:**
  - Compras com custos em moedas distintas da posição exigirão conversão FX formal em fases futuras.
