# ADR-049: BONUS Share Allocation and Cost Basis Determination Policy

## Status

Accepted

## Context

Bonificações em ações (`BONUS`) ocorrem quando uma empresa capitaliza lucros acumulados ou reservas e distribui novas ações gratuitamente aos acionistas proporcionalmente às suas participações.

Na legislação brasileira (e em práticas contábeis rigorosas), a bonificação pode ocorrer com atribuição de custo fiscal/econômico declarado pelo emissor (valor aprovado em AGE/Ata), que é incorporado ao custo de aquisição da posição, ou sem atribuição expressa conhecida no momento do lançamento.

Faz-se necessário definir a política de custo carregado e status de custo (`KNOWN` vs `INCOMPLETE`) do `PortfolioReplayEngine`.

## Decision

1. **Transformação de Quantidade**:
   - A quantidade bonificada incrementa a quantidade custodiada:
     $$\text{quantity}_{after} = \text{quantity}_{before} + \text{bonusQuantity}$$
   - A quantidade bonificada (`bonusQuantity`) deve ser estritamente positiva ($\text{bonusQuantity} > 0$). Caso contrário, a operação é rejeitada com `InvalidBonusQuantityError`.

2. **Determinação do Custo Carregado e Preço Médio**:
   - **Caso 1: Custo Atribuído Informado (`assignedCost` presente)**:
     Quando o emissor/usuário informa o custo atribuído:
     $$\text{totalCost}_{after} = \text{totalCost}_{before} + \text{assignedCost}$$
     $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
     Se o status prévio da posição for `KNOWN`, a posição permanece com `costBasisStatus = 'KNOWN'`.
   - **Caso 2: Custo Atribuído Omitido (`assignedCost` ausente/indefinido)**:
     Quando a transação de bonificação não possui custo atribuído explícito, o motor de cálculo **não assume custo zero** ($\text{assignedCost} \neq 0$). Em vez disso:
     $$\text{totalCost}_{after} = \text{undefined}$$
     $$\text{averageCost}_{after} = \text{undefined}$$
     $$\text{costBasisStatus} = \text{'INCOMPLETE'}$$
     _Justificativa_: Assumir custo zero incorreria em distorção patrimonial severa, diluindo indevidamente o preço médio do ativo e inflando artificialmente ganhos de capital futuros em alienações.

3. **Propagação de Status Incompleto Prévio**:
   Se a posição prévia já se encontrava com status `INCOMPLETE`, o recebimento de bonificação (mesmo com `assignedCost` informado) mantém a posição como `INCOMPLETE`, dado que o custo total acumulado prévio permanece desconhecido.

4. **Exigência de Posição Prévia Ativa**:
   A bonificação exige a existência de uma posição prévia com quantidade estritamente positiva ($\text{quantity}_{before} > 0$). Caso contrário, lança-se `EmptyPositionCorporateActionError`.

5. **Isolamento de Vendas e Descarte Realizado**:
   Bonificações não representam descarte ou venda e **nunca** emitem eventos de `RealizedDisposal`.

## Consequences

- **Positivas:**
  - Preservação da integridade fiscal e contábil: ausência de custo não é mascarada como custo zero.
  - Conformidade estrita com o princípio da transparência de custo (`KNOWN` vs `INCOMPLETE`).
  - Precisão patrimonial garantida quando o custo atribuído é conhecido.
- **Negativas:**
  - Posições bonificadas sem custo atribuído exigirão retificação ou edição do lançamento para restaurar o status `KNOWN` e permitir apuração de resultado realizado exato.
