# ADR-053: External Cash Flow Semantics (DEPOSIT & WITHDRAWAL)

## Status

Accepted

## Context

Movimentações financeiras de aporte (`DEPOSIT`) e resgate (`WITHDRAWAL`) constituem o canal de entrada e saída de capital externo entre o investidor e suas contas no portfólio.

É imperativo distinguir fluxos de capital externo de rentabilidade de ativos ou fluxos operacionais internos, bem como estabelecer convenções numéricas estritas para direção e magnitude.

## Decision

1. **Geração de Evento de Fluxo (`CashFlowEvent`)**:
   - Transações `DEPOSIT` e `WITHDRAWAL` geram instâncias imutáveis de `CashFlowEvent`.
   - `DEPOSIT`:
     - `direction`: `'INFLOW'`
     - `category`: `'EXTERNAL_CONTRIBUTION'`
   - `WITHDRAWAL`:
     - `direction`: `'OUTFLOW'`
     - `category`: `'EXTERNAL_WITHDRAWAL'`
   - Ambos são incluídos em `appliedTransactions`.

2. **Convenção de Magnitude Positiva**:
   - O campo `amount` em `CashFlowEvent` armazena invariavelmente uma quantia com magnitude positiva ($\text{amount} > 0$).
   - O sentido contábil e econômico (entrada vs saída) é governado exclusivamente pela propriedade discriminada `direction` (`INFLOW` vs `OUTFLOW`).
   - Montantes menores ou iguais a zero são rejeitados com `InvalidCashFlowAmountError`.

3. **Invariância de Posição de Ativos**:
   - Movimentações de caixa não alteram a quantidade, custo total ou preço médio de nenhum ativo custodiado.

4. **Isolamento de Performance e Retorno**:
   - Aportes e resgates externos **não** constituem rendimento, ganho patrimonial ou perda.
   - O cálculo de retorno ponderado no tempo (TWR) ou retorno ponderado pelo dinheiro (MWR/XIRR) é de responsabilidade exclusiva do Performance Engine (Fase 3).

5. **Sumarização Segregada por Moeda (`CashFlowSummary`)**:
   - Para cada conta e para a carteira consolidada, calcula-se:
     - `totalInflows`: soma de todos os fluxos com `direction === 'INFLOW'` (aportes + devoluções de capital).
     - `totalOutflows`: soma de todos os fluxos com `direction === 'OUTFLOW'` (resgates + taxas + impostos).
     - `totalExternalContributions`: montante total aportado externamente (`DEPOSIT`).
     - `totalExternalWithdrawals`: montante total resgatado externamente (`WITHDRAWAL`).
     - `netExternalFlow`: fluxo líquido externo estritamente definido como:
       $$\text{netExternalFlow} = \text{totalExternalContributions} - \text{totalExternalWithdrawals}$$
   - Valores negativos em `netExternalFlow` são suportados e indicam desinvestimento líquido (resgates superando aportes).

## Consequences

- **Positivas:**
  - Segregação analítica rigorosa entre aportes externos e retornos gerados pelos investimentos.
  - Alinhamento de convenções contábeis e matemáticas para alimentação futura dos motores de performance (TWR/XIRR) e saldos operacionais de caixa.
- **Negativas:**
  - Saldos de caixa operacionais (reconciliação bancária, datas de liquidação D+1/D+2) requerem o Cash Ledger completo.
