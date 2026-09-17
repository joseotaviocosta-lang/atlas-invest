# ADR-055: Standalone FEE and TAX Cash Flow Policy and Prohibition of Heuristic Matching

## Status

Accepted

## Context

Custos de custódia, taxas de corretagem, emolumentos periódicos e recolhimento de tributos avulsos ocorrem via transações independentes do tipo `FEE` e `TAX`.

Em fases anteriores, foi expressamente vedada a vinculação heurística de taxas avulsas a notas de corretagem de compra ou venda (ADR-044).

Na Fase 1E, faz-se necessário definir como essas despesas avulsas são classificadas e contabilizadas no Portfolio Engine.

## Decision

1. **Classificação como Saídas de Caixa Operacionais (`CashFlowEvent`)**:
   - `FEE`:
     - `direction`: `'OUTFLOW'`
     - `category`: `'OPERATIONAL_EXPENSE'`
   - `TAX`:
     - `direction`: `'OUTFLOW'`
     - `category`: `'TAX_PAYMENT'`
   - Ambas as transações são registradas com magnitude positiva em `amount` e computadas em `appliedTransactions`.

2. **Associação Opcional de Ativo (`relatedAssetId`)**:
   - Quando a taxa ou imposto avulso contiver referência a um ativo (`assetId`), essa associação é preservada no campo `relatedAssetId` do `CashFlowEvent` para fins analíticos e de relatórios.

3. **Invariância de Posição e de Base de Custo**:
   - Transações avulsas de `FEE` e `TAX` **não** alteram a quantidade, o custo total ou o preço médio de nenhuma posição de ativo.
   - Apenas taxas e impostos formalmente embutidos nos campos `fees` e `taxes` da própria `TradeTransaction` de compra ou venda compõem o custo de aquisição ou os custos de liquidação da alienação.

4. **Proibição Estrita de Vinculação Heurística**:
   - É terminantemente proibido tentar correlacionar, agrupar ou deduzir transações `FEE` ou `TAX` avulsas contra alienações `SELL` (mesmo que coincidam em conta, ativo ou data).
   - O resultado líquido de alienações em `RealizedDisposal` depende exclusivamente dos custos expressos na própria transação `SELL`.

5. **Sumarização Segregada**:
   - Os totais de taxas e impostos avulsos acumulam-se em `totalFees` e `totalTaxes` no `CashFlowSummary` da conta e do portfólio.

## Consequences

- **Positivas:**
  - Imutabilidade e determinismo garantidos sem depender de heurísticas frágeis de reconciliação de notas de corretagem.
  - Visibilidade analítica clara entre despesas transacionais (incorporadas ao trade) e despesas de custódia/tributárias avulsas.
- **Negativas:**
  - Transações importadas com taxas avulsas que deveriam constar na nota de corretagem precisam ser consolidadas na camada de ingestão/integração antes de ingressar no ledger.
