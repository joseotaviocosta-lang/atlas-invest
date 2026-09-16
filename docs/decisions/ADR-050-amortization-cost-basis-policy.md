# ADR-050: AMORTIZATION Cost Basis Reduction and Zero-Cost Boundary Policy

## Status

Accepted

## Context

Amortizações de capital (`AMORTIZATION`) representam a devolução de parcela do valor patrimonial investido aos cotistas/acionistas (frequente em Fundos de Investimento Imobiliário - FIIs, Fiagros, debêntures e fundos fechados em liquidação).

Diferentemente de rendimentos/proventos operacionais periódicos (`DIVIDEND`, `JCP`, `FII_INCOME`), a amortização de capital possui natureza contábil de devolução de principal e, portanto, reduz diretamente o custo de aquisição carregado da posição custodiada.

Faz-se necessário formalizar a política matemática de dedução de custo, os limites de exaustão e o comportamento em posições com custo incompleto.

## Decision

1. **Invariância de Quantidade**:
   - A amortização de capital não altera o número de cotas ou ações em custódia:
     $$\text{quantity}_{after} = \text{quantity}_{before}$$

2. **Dedução do Custo Carregado e Recálculo de Preço Médio**:
   - O valor total da amortização recebida na conta reduz diretamente o custo total carregado:
     $$\text{totalCost}_{after} = \text{totalCost}_{before} - \text{amortizationAmount}$$
   - O preço médio ponderado unitário é recalculado com a nova base de custo:
     $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$

3. **Restrição de Não-Excedência de Custo Carregado**:
   - O montante amortizado não pode exceder o custo total previamente carregado ($\text{amortizationAmount} \le \text{totalCost}_{before}$).
   - Caso a amortização supere o custo residual da posição, o motor rejeita a operação lançando `AmortizationExceedsCostError`.
   - _Fundamentação_: No escopo patrimonial de base de custo, a devolução de principal é estritamente limitada ao capital investido. Parcela amortizada excedente ao custo caracterizaria ganho de capital tributável extraordinário, fora do escopo de recomposição de custo do motor de replay.

4. **Tratamento da Fronteira de Custo Zero (Known Zero vs Incomplete)**:
   - Se a amortização deduzir o custo total exatamente até zero ($\text{totalCost}_{after} = 0$):
     $$\text{totalCost}_{after} = \text{Money.zero(currency)}$$
     $$\text{averageCost}_{after} = \text{Money.zero(currency)}$$
     $$\text{costBasisStatus} = \text{'KNOWN'}$$
   - Um custo conhecido igual a zero ($\text{totalCost} = 0$, status `KNOWN`) é ontologicamente distinto de custo ausente ou indefinido (`costBasisStatus = 'INCOMPLETE'`). Em alienações futuras de ativos com custo zero conhecido, o custo removido é zero e 100% do valor líquido da venda constitui ganho realizado conhecido.

5. **Tratamento de Posições com Custo Incompleto**:
   - Não é matematicamente possível deduzir um valor de amortização de uma base de custo desconhecida. Caso uma amortização seja aplicada a uma posição com `costBasisStatus = 'INCOMPLETE'`, o motor rejeita a transação lançando `IncompleteAmortizationCostError`.

6. **Isolamento de Alienação Realizada**:
   - A amortização não configura venda de ativos e **não** emite registros em `realizedDisposals`.

## Consequences

- **Positivas:**
  - Redução determinística e exata da base de custo de cotas/ações sujeitas à amortização.
  - Distinção conceitual e matemática clara entre custo zero conhecido (`KNOWN`) e custo faltante (`INCOMPLETE`).
  - Proteção contra custos negativos por meio da trava `AmortizationExceedsCostError`.
- **Negativas:**
  - Lançamentos de amortização em históricos com compras incompletas exigem regularização prévia do custo de aquisição.
