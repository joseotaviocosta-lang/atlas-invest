# ADR-051: Corporate Actions Accounting Boundaries vs Downstream Tax Treatment

## Status

Accepted

## Context

No domínio de investimentos brasileiro e internacional, eventos corporativos (`SPLIT`, `REVERSE_SPLIT`, `BONUS`, `AMORTIZATION`) interagem frequentemente com regras tributárias (ex.: Instrução Normativa da Receita Federal para bonificações com valor atribuído, amortização de FIIs, tributação exclusiva de frações em leilão).

Faz-se imperativo delimitar com precisão cirúrgica a fronteira de responsabilidade entre a apuração patrimonial/econômica do `PortfolioReplayEngine` (Fase 1) e os módulos subsequentes de apuração fiscal/tributária (Fase 2+).

## Decision

1. **Separação Rígida entre Contabilidade Econômica e Apuração Fiscal**:
   - O `PortfolioReplayEngine` é um motor puramente econômico e patrimonial. Sua função única é computar quantidade custodiada, custo de aquisição carregado, preço médio ponderado e resultados econômicos realizados.
   - O motor **não calcula** impostos devidos, IRRF, DARF, alíquotas de tributação (15%, 20%), faixas de isenção de alienação (ex.: R$ 20.000,00 mensais em ações na B3), retenções na fonte ou compensação de prejuízos fiscais passados.

2. **Natureza Patrimonial dos Eventos Corporativos**:
   - `SPLIT` e `REVERSE_SPLIT`: Alteram meramente a granularidade de cotas/ações em custódia. São operações neutras fiscal e economicamente.
   - `BONUS`: O custo atribuído (`assignedCost`), quando informado, é integrado ao custo contábil da carteira. A tributação de eventual ganho ou rendimento isento/tributável decorrente da bonificação pertence à camada fiscal externa.
   - `AMORTIZATION`: Devolução de capital que reduz a base de custo carregado da posição. O tratamento de eventuais ganhos de capital sobre amortizações excedentes não é processado pelo motor de replay.

3. **Padronização Terminológica Rigorosa**:
   - Para evitar ambiguidades conceituais com a legislação e a prática de mercado:
     - O termo **"Proventos"** é reservado exclusivamente para fluxos de renda distribuídos por emissores (`DIVIDEND`, `JCP`, `FII_INCOME`).
     - Em alienações (`SELL`), os valores resultantes da operação são formalmente denominados **"Valor Bruto da Venda"** (_gross proceeds_) e **"Valor Líquido da Venda"** (_net proceeds_), jamais "proventos da venda".
     - O campo `SELL.taxes` representa única e exclusivamente encargos, emolumentos e taxas contratuais/regulatórias aplicadas à transação pelo intermediário ou ambiente de bolsa, não constituindo apuração de tributo federal ou imposto de renda.

4. **Papel da Camada Fiscal como Consumidora a Jusante (_Downstream_)**:
   - Os módulos de tributação e geração de DARF futuros serão construídos como consumidores independentes do estado derivado e dos eventos emitidos pelo `PortfolioReplayEngine` (`RealizedDisposal`, `AppliedCorporateAction`, `AccountState`), garantindo desacoplamento arquitetural e auditabilidade plena.

## Consequences

- **Positivas:**
  - Preservação da simplicidade, pureza e determinismo do núcleo financeiro.
  - Eliminação de acoplamentos precoces com a volatilidade da legislação tributária brasileira.
  - Alinhamento terminológico semântico estrito em toda a documentação, código e ADRs.
- **Negativas:**
  - A apuração de impostos e obrigações fiscais dependerá do desenvolvimento completo de módulos específicos em fases posteriores.
