# ADR-046: Incomplete Cost Basis Policy on Realized Disposals

## Status

Accepted

## Context

Conforme estabelecido na ADR-043, transferências de custódia recebidas (`TRANSFER_IN`) sem nota de corretagem ou custo de aquisição auditado resultam em posições com `costBasisStatus: 'INCOMPLETE'`, onde `totalCost` e `averageCost` são `undefined`.

Quando o usuário vende cotas de uma posição nessa condição, o motor não pode inventar um custo base (nem assumir R$ 0,00), sob pena de falsear gravemente o resultado econômico e o retorno percentual da operação.

## Decision

1. **Permissibilidade da Operação de Venda**:
   A venda de cotas com base de custo incompleta é permitida no ledger: a quantidade é deduzida normalmente (e a posição é omitida se atingir zero).

2. **Apuração de Receitas Conhecidas**:
   Como o preço de execução da venda (`unitPrice`) e as quantidades alienadas são conhecidos, `grossProceeds`, `sellingCosts` e `netProceeds` são computados normalmente em caixa e receita.

3. **Neutralização do Resultado Realizado (Sem Fabricação de Ganho/Prejuízo)**:
   Para vendas com base de custo desconhecida:
   - `costBasisRemoved = undefined`
   - `realizedGainLoss = undefined`
   - `realizedReturnPercentage = undefined`
   - `status = 'INCOMPLETE'`

4. **Proibição Absoluta da Assunção de Custo Zero**:
   É terminantemente vedado adotar custo base zero para posições sem custo histórico conhecido. A assunção de custo zero transformaria artificialmente o valor total da venda em "lucro de 100%", induzindo o investidor e eventuais módulos a conclusões errôneas.

5. **Propagação do Status Incompleto no Resumo Contábil (Do Not Partially Lie)**:
   Se qualquer alienação de uma moeda contiver `status: 'INCOMPLETE'`, o resumo consolidado daquela moeda (`RealizedSummary`) no nível da conta e do portfólio terá:
   - `status: 'INCOMPLETE'`
   - `costBasisRemoved = undefined`
   - `realizedGainLoss = undefined`
   - `realizedReturnPercentage = undefined`
   - As receitas líquidas e brutas conhecidas permanecem somadas, mas nenhum valor de ganho líquido parcial é apresentado como se fosse o total definitivo.

6. **Exclusão de Transferências**:
   Transferências de saída (`TRANSFER_OUT`) e de entrada (`TRANSFER_IN`) não representam alienações econômicas e **nunca** geram registros de `RealizedDisposal`.

## Consequences

- **Positivas:**
  - Integridade patrimonial absoluta: o sistema nunca informa lucros fabricados ou incorretos ao investidor.
  - Alinhamento pleno com a política de integridade contábil da Fase 1B.
  - Clara sinalização ao usuário de que há lacunas de documentação histórica a regularizar.
- **Negativas:**
  - Posições migradas sem custo impedem a exibição de ganho acumulado em vendas até que os custos sejam informados.
