# ADR-052: Income Event Accounting (DIVIDEND, JCP, FII_INCOME)

## Status

Accepted

## Context

Proventos operacionais periódicos distribuídos por ativos investidos compreendem dividendos ordinários e extraordinários (`DIVIDEND`), juros sobre capital próprio (`JCP`) e rendimentos de fundos imobiliários/do agronegócio (`FII_INCOME`).

Em fases anteriores (1A a 1D), esses eventos eram classificados como formalmente diferidos (`deferredEvents`) por não haver representação contábil para fluxos financeiros sem impacto em quantidade de custódia.

Na Fase 1E, faz-se necessário estabelecer as regras de contabilidade e invariantes patrimoniais para proventos operacionais no Portfolio Engine.

## Decision

1. **Geração de Evento Dedicado (`IncomeEvent`)**:
   - Cada transação de provento (`DIVIDEND`, `JCP`, `FII_INCOME`) gera um registro estruturado e imutável `IncomeEvent` contendo:
     - `transactionId`, `portfolioId`, `accountId`, `assetId`, `tradeDate`, `type`, `amount` e `currency`.
   - As transações são formalmente reconhecidas e incluídas em `appliedTransactions`.
   - `deferredEvents` não recebe mais entradas desses tipos.

2. **Invariância de Posição Custodiada**:
   - Proventos não alteram a quantidade de cotas/ações em custódia ($\Delta\text{quantity} = 0$).
   - Proventos não alteram o custo total carregado ($\Delta\text{totalCost} = 0$) nem o preço médio unitário ($\Delta\text{averageCost} = 0$).
   - Proventos não alteram o status de base de custo da posição (`costBasisStatus`).

3. **Independência de Posição Ativa em Custódia**:
   - Um investidor pode receber proventos mesmo com posição zerada na data de pagamento (se adquiriu antes da data ex e alienou antes do pagamento).
   - O motor não exige custódia ativa não-nula para registrar o recebimento de proventos.

4. **Isolamento de Alienação Realizada**:
   - Proventos não constituem alienação patrimonial de ativos e **nunca** emitem registros em `RealizedDisposal`.

5. **Sumarização Segregada por Moeda (`IncomeSummary`)**:
   - No nível da conta e no nível consolidado da carteira, os proventos são sumarizados por moeda (`Currency`):
     - `totalDividends`: soma de montantes do tipo `DIVIDEND`.
     - `totalJcp`: soma de montantes do tipo `JCP`.
     - `totalFiiIncome`: soma de montantes do tipo `FII_INCOME`.
     - `totalIncome`: soma exata de todos os proventos da moeda ($\text{totalDividends} + \text{totalJcp} + \text{totalFiiIncome}$).
   - Não há agregação cruzada de moedas diferentes sem conversão cambial.

6. **Validações e Fronteiras de Domínio**:
   - O montante do provento deve ser estritamente positivo ($\text{amount} > 0$). Montantes nulos ou negativos geram `InvalidIncomeAmountError`.
   - A moeda da quantia monetária deve coincidir com a moeda da transação, sob pena de `CurrencyMismatchError`.
   - Retenção de imposto na fonte (IRRF sobre JCP) e isenções tributárias pertencem estritamente ao Tax Engine (Fase 2) e não são deduzidas nesta camada contábil.

## Consequences

- **Positivas:**
  - Rastreabilidade exata e determinística de todos os proventos auferidos por conta e por carteira.
  - Zero alteração indevida de preço médio ou quantidade de ativos.
  - Base estruturada para reconciliação com extratos de custodiantes e corretoras.
- **Negativas:**
  - Cálculo líquido de JCP após imposto retido na fonte fica a cargo da camada tributária subsequente.
