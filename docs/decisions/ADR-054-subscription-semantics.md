# ADR-054: Subscription Rights Exercise and Cost Basis Acquisition Semantics

## Status

Accepted

## Context

Subscrições de ações e cotas (`SUBSCRIPTION`) ocorrem quando o emissor confere aos investidores o direito de subscrever novas cotas/ações a um preço de emissão prefixado.

No modelo de domínio do Project Atlas (`@atlas/domain`), a entidade `SubscriptionTransaction` possui:

- `assetId: AssetId`
- `quantity: Quantity` (quantidade de cotas subscritas)
- `unitPrice: Money` (preço de emissão por cota)

Essa estrutura modela especificamente o **exercício** da subscrição com aquisição física das novas cotas, e não a cessão ou negociação do recibo/direito em bolsa (que seria transacionado sob ticker próprio como `BUY` ou `SELL`).

Faz-se necessário formalizar a matemática patrimonial do exercício da subscrição e sua integração com a base de custo do ativo subjacente.

## Decision

1. **Aumento de Quantidade e Custo Carregado**:
   - O exercício de subscrição eleva a quantidade de cotas do ativo em carteira e incorpora o capital despendido na emissão:
     $$\text{acquisitionCost} = \text{unitPrice} \times \text{quantity}$$
     $$\text{quantity}_{after} = \text{quantity}_{before} + \text{quantity}$$
     $$\text{totalCost}_{after} = \text{totalCost}_{before} + \text{acquisitionCost}$$
     $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
   - A matemática é idêntica à de uma compra regular (`BUY`), refletindo a natureza de aquisição onerosa de novas cotas.

2. **Preservação de Tipo e Trilha de Auditoria**:
   - A transação preserva seu tipo originário `type = 'SUBSCRIPTION'`.
   - Permite auditoria clara diferenciando compras em mercado secundário de subscrições primárias.

3. **Subscrição com Preço Zero (Bonificação / Exercício Gratuito)**:
   - Se $\text{unitPrice} = 0$, a subscrição aumenta a quantidade sem acrescentar custo financeiro, reduzindo o preço médio unitário por diluição proporcional.

4. **Tratamento de Posições com Custo Incompleto**:
   - Caso a posição já possua `costBasisStatus = 'INCOMPLETE'` (por exemplo, originada de `TRANSFER_IN` sem custo), o exercício de subscrição acresce a quantidade, mas o status permanece `INCOMPLETE`, com `totalCost` e `averageCost` indefinidos (`undefined`), pois não é possível sintetizar um custo total válido a partir de uma base pretérita desconhecida.

5. **Isolamento de Alienação Realizada**:
   - O exercício de subscrição não é uma alienação e **não** emite registros em `RealizedDisposal`.

6. **Validações de Domínio**:
   - Quantidade deve ser estritamente positiva ($\text{quantity} > 0$).
   - Preço unitário não pode ser negativo ($\text{unitPrice} \ge 0$).
   - A moeda da subscrição deve coincidir com a moeda da posição previamente existente.
   - Violações disparam `SubscriptionCostBasisError` ou `CurrencyMismatchError`.

## Consequences

- **Positivas:**
  - Tratamento determinístico e preciso de aumento de capital por subscrição de cotas/ações.
  - Alinhamento pleno com as normas tributárias e patrimoniais vigentes na B3.
  - Rastreabilidade inequívoca entre compras a mercado e emissões primárias.
- **Negativas:**
  - O desembolso de caixa correspondente ao preço de subscrição requer o Cash Ledger para debitar o saldo da conta na data de liquidação.
