# ADR-048: SPLIT and REVERSE_SPLIT Accounting Semantics and Invariants

## Status

Accepted

## Context

Eventos corporativos de desdobramento (`SPLIT`) e grupamento (`REVERSE_SPLIT`) alteram a quantidade de cotas/ações em custódia de um determinado ativo sem que ocorra desembolso financeiro, alienação ou injeção de capital novo.

No Project Atlas, a Fase 1D introduz o suporte determinístico a esses eventos no `PortfolioReplayEngine`, exigindo a formalização das regras matemáticas de transformação de custódia, preservação de custo carregado e recálculo de preço médio.

## Decision

1. **SPLIT (Desdobramento)**:
   - **Quantidade pós-evento**:
     $$\text{quantity}_{after} = \text{quantity}_{before} \times \text{factor}$$
   - **Custo Total Carregado**:
     $$\text{totalCost}_{after} = \text{totalCost}_{before}$$
     _Invariante Fundamental 1_: O desdobramento é neutro em valor contábil; o custo total carregado não se altera.
   - **Preço Médio Ponderado Unitário**:
     $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
   - **Validações**:
     O fator (`factor`) deve ser estritamente positivo e diferente de 1 ($\text{factor} > 0 \land \text{factor} \neq 1$). Operações com fator unitário constituem no-op e são rejeitadas com `InvalidCorporateActionFactorError`. Fatores fracionários (ex.: 1.5) são aceitos e computados com exatidão decimal total.

2. **REVERSE_SPLIT (Grupamento)**:
   - **Quantidade pós-evento**:
     $$\text{quantity}_{after} = \frac{\text{quantity}_{before}}{\text{factor}}$$
   - **Custo Total Carregado**:
     $$\text{totalCost}_{after} = \text{totalCost}_{before}$$
     _Invariante Fundamental 1_: O grupamento é neutro em valor contábil; o custo total carregado não se altera.
   - **Preço Médio Ponderado Unitário**:
     $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
   - **Tratamento de Frações de Ações**:
     O motor opera com precisão decimal exata (`Quantity` com precisão operacional de 40 dígitos). Qualquer fração resultante de grupamento é preservada integralmente na posição custodiada até que um evento futuro explícito (ex.: leilão de sobras ou liquidação de frações) seja emitido e processado. O motor não realiza truncamento arbitrário para inteiros.
   - **Validações**:
     O fator (`factor`) deve ser estritamente positivo e diferente de 1 ($\text{factor} > 0 \land \text{factor} \neq 1$), rejeitando valores inválidos com `InvalidCorporateActionFactorError`.

3. **Exigência de Posição Prévia Ativa**:
   Tanto `SPLIT` quanto `REVERSE_SPLIT` exigem a existência de uma posição ativa com quantidade estritamente positiva ($\text{quantity}_{before} > 0$). Caso a posição não exista ou possua quantidade zero, a operação é rejeitada com `EmptyPositionCorporateActionError`.

4. **Isolamento de Resultados Realizados**:
   Eventos corporativos de `SPLIT` e `REVERSE_SPLIT` não configuram alienação ou liquidação. Portanto, **nunca** geram eventos `RealizedDisposal` e não incrementam contadores de alienação realizada.

5. **Trilha de Auditoria**:
   Cada evento aplicado emite um registro imutável `AppliedCorporateAction` associado à conta e ao portfólio, registrando o estado anterior e posterior de quantidade e custo.

## Consequences

- **Positivas:**
  - Garantia de preservação matemática exata do capital investido ($\text{totalCost}_{after} = \text{totalCost}_{before}$).
  - Consistência determinística entre quantidade ajustada e novo preço médio unitário.
  - Precisão total para sobras fracionárias sem perdas de arredondamento.
- **Negativas:**
  - Leilões de sobras de grupamentos posteriores dependerão de transações explícitas adicionais para liquidar frações remanescentes.
