# ADR-041: Proportional Cost Basis Removal on Sell

## Status

Accepted

## Context

Ao realizar uma venda parcial de ativos em custódia, o custo acumulado da carteira deve ser reduzido para refletir a saída das cotas alienadas. É fundamental formalizar:

1. Como o custo residual é recalculado.
2. Como o preço de venda negociado em bolsa afeta (ou não afeta) o preço médio das ações remanescentes.
3. O comportamento em liquidação integral da posição (Full SELL) e recompras posteriores.

## Decision

1. **Remoção Proporcional de Custo pelo Custo Médio Pré-Venda**:
   Quando ocorre uma venda parcial (`SELL` com `quantity < currentQuantity`), o custo descarregado é estritamente proporcional ao preço médio existente no momento da alienação:
   $$\text{costRemoved} = \text{currentAverageCost} \times \text{sellQuantity}$$
   $$\text{newTotalCost} = \text{currentTotalCost} - \text{costRemoved}$$
   $$\text{newQuantity} = \text{currentQuantity} - \text{sellQuantity}$$

2. **Invariância do Preço Médio na Venda**:
   O preço de execução da venda (`unitPrice`) **NÃO** altera o preço médio unitário das cotas remanescentes:
   $$\text{newAverageCost} = \text{currentAverageCost}$$
   O preço de venda serve exclusivamente para a futura apuração de valor realizado/alienação (`proceeds`) na Fase 1C, sem qualquer impacto no estoque de custo remanescente.

3. **Liquidação Integral (Full SELL) e Política de Posição Zero**:
   Quando toda a posição é vendida (`quantity == currentQuantity`):
   - A quantidade é zerada e o custo acumulado é zerado exatamente (`totalCost = 0`), sem deixar poeira decimal.
   - Conforme o ADR-039, a posição é omitida dos mapas de posições ativas (`state.assets` e `account.assets`).

4. **Recompra Após Zeramento**:
   Uma nova compra subsequente a uma liquidação integral inicia uma nova posição contábil limpa. Nenhum resíduo de custo médio antigo é herdado.

5. **Diferimento de Ganho/Perda Realizada**:
   O cálculo de receitas brutas de venda (`proceeds`), ganho ou perda de capital (`realizedGain`/`realizedLoss`) e compensações não é implementado nesta fase (diferido para a Fase 1C).

## Consequences

- **Positivas:**
  - Preservação da lógica matemática de estoque contábil móvel.
  - Imunidade contra distorções onde o preço de venda de mercado corromperia o custo de aquisição do investidor.
  - Descarte exato de resíduos decimais em alienações completas.
- **Negativas:**
  - Relatórios de rentabilidade e apuração fiscal de ganho de capital dependem do motor da Fase 1C.
