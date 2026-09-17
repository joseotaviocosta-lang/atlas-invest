# ADR-056: Dual-Dimension Amortization Accounting: Cost Basis Reduction and Cash Flow Component

## Status

Accepted

## Context

Na Fase 1D (ADR-050), formalizou-se a redução da base de custo de posições decorrente de amortização de capital (`AMORTIZATION`).

Contudo, uma amortização de capital possui dupla dimensão econômica:

1. **Dimensão Patrimonial de Custódia**: Redução do custo carregado do ativo e recálculo do preço médio unitário.
2. **Dimensão de Fluxo Financeiro**: Entrada efetiva de recursos monetários na conta do investidor (devolução de principal investido).

Com a introdução do subsistema de fluxos de caixa na Fase 1E (`CashFlowEvent`), é necessário formalizar o reflexo financeiro da amortização sem gerar duplicação de contabilidade ou contagem de transações.

## Decision

1. **Emissão de Evento de Fluxo de Caixa (`CashFlowEvent`)**:
   - Toda transação de amortização (`AMORTIZATION`) válida, além de atualizar o custo da posição em custódia, emite simultaneamente um `CashFlowEvent`:
     - `type`: `'AMORTIZATION'`
     - `direction`: `'INFLOW'`
     - `category`: `'CAPITAL_RETURN'`
     - `amount`: `tx.amount` (magnitude positiva)
     - `currency`: `tx.currency`
     - `relatedAssetId`: `tx.assetId`

2. **Invariante de Contagem de Transações Aplicadas**:
   - A amortização permanece sendo **uma única** transação no livro contábil (`Transaction`).
   - Ela incrementa exatamente em 1 o contador `appliedTransactionCount` e consta uma única vez em `appliedTransactions`.
   - A emissão de `AppliedCorporateAction` e `CashFlowEvent` constituem projeções derivadas da mesma operação atômica.

3. **Integração no Sumário de Fluxo de Caixa (`CashFlowSummary`)**:
   - O valor da amortização acumula-se em `totalCapitalReturns` e compõe `totalInflows`.
   - O indicador `netExternalFlow` permanece definido estritamente como a diferença entre aportes e retiradas externas ($\text{totalExternalContributions} - \text{totalExternalWithdrawals}$), **não** incluindo devoluções de capital, evitando distorções no cálculo de aporte líquido externo.

## Consequences

- **Positivas:**
  - Representação completa e fidedigna das duas dimensões de uma amortização de capital (patrimonial e de caixa).
  - Preservação da integridade do histórico do livro contábil sem duplicação de transações.
  - Alinhamento de dados para futura reconciliação do saldo de caixa com extratos de corretoras.
- **Negativas:**
  - Sistemas consumidores devem estar cientes de que uma amortização emite tanto um evento corporativo quanto um evento de fluxo de caixa.
