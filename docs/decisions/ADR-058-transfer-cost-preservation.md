# ADR-058: Custody Transfer Cost Basis Preservation and Position Merging

## Status

Accepted

## Context

Quando um investidor transfere ativos entre contas pertencentes ao mesmo portfólio, a operação representa mera mudança de custódia física/institucional.

Não há evento de liquidação, alienação ou realização de capital. A base de custo do ativo deve ser transportada com precisão absoluta, preservando integralmente os invariantes patrimoniais consolidados do portfólio.

## Decision

1. **Transporte Exato de Custo Carregado**:
   - A conta de origem (`TRANSFER_OUT`) deduz a quantidade transferida e o montante exato de custo carregado correspondente:
     $$\text{carriedCost} = \text{currentAverageCost}_{\text{origin}} \times \text{transferQuantity}$$
   - Caso a transferência seja total, a posição na conta de origem é zerada (quantidade zero e custo zero, conforme ADR-039).
   - Caso seja parcial, o custo médio remanescente na conta de origem permanece inalterado.

2. **Mescla Ponderada na Conta de Destino**:
   - A conta de destino (`TRANSFER_IN`) recebe exatamente o `carriedCost`.
   - Se a conta de destino já possuir posição no ativo, os valores são somados de forma ponderada (idêntica à incorporação de uma compra, mas sem custos de corretagem):
     $$\text{newTotalCost}_{\text{dest}} = \text{totalCost}_{\text{dest}} + \text{carriedCost}$$
     $$\text{newQuantity}_{\text{dest}} = \text{quantity}_{\text{dest}} + \text{transferQuantity}$$
     $$\text{newAverageCost}_{\text{dest}} = \frac{\text{newTotalCost}_{\text{dest}}}{\text{newQuantity}_{\text{dest}}}$$

3. **Invariantes Patrimoniais Globais**:
   - Entre o instante imediatamente anterior e imediatamente posterior à aplicação de um par de transferências casado:
     - $\text{portfolioQuantity}_{\text{before}} = \text{portfolioQuantity}_{\text{after}}$
     - $\text{portfolioTotalCost}_{\text{before}} = \text{portfolioTotalCost}_{\text{after}}$
     - $\text{portfolioRealizedGain}_{\text{before}} = \text{portfolioRealizedGain}_{\text{after}}$
     - $\text{portfolioIncome}_{\text{before}} = \text{portfolioIncome}_{\text{after}}$
   - Uma transferência interna:
     - **NUNCA** emite `RealizedDisposal`.
     - **NUNCA** gera ganho ou perda realizada (`realizedGainLoss`).
     - **NUNCA** emite `IncomeEvent`.
     - **NUNCA** emite `CashFlowEvent` de fluxo de caixa externo ou operacional.
     - Emite estritamente registros de auditoria `AppliedTransfer`.

## Consequences

- **Positivas:**
  - Preservação matemática rigorosa do custo de aquisição histórico entre contas.
  - Vendas subsequentes na conta de destino apuram ganhos e perdas fiscais/econômicos legítimos com base no custo carregado original.
- **Negativas:**
  - Se a perna de saída for processada em data posterior à de entrada no mesmo dia, o engine precisa consultar o estado pontual da conta de origem no momento da transação.
