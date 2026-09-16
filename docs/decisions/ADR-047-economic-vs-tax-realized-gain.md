# ADR-047: Economic Realized Result vs. Taxable Realized Gain Separation

## Status

Accepted

## Context

No mercado de capitais brasileiro, a realização financeira de uma venda não é sinônimo direto de base de cálculo do imposto de renda ou obrigação tributária. A legislação fiscal (Instruções Normativas da RFB e Leis nº 11.033/2004 e 14.754/2023) introduz complexidades como:

- Limite de isenção de R$ 20.000,00 por mês para alienação de ações no mercado à vista;
- Segregação mandatória entre operações comuns (_swing trade_) e operações de compra e venda no mesmo dia (_day trade_);
- Regras tributárias específicas e alíquotas distintas para FIIs/FIAGROs, ETFs de renda fixa, ETFs de renda variável, BDRs e derivativos;
- Compensação de prejuízos fiscais anteriores da mesma modalidade;
- Retenção na fonte (imposto "dedo-duro") e emissão de DARF.

Faz-se necessário demarcar com precisão a fronteira arquitetural entre o resultado econômico derivado pelo `PortfolioReplayEngine` e a futura apuração tributária.

## Decision

1. **Escopo Estritamente Econômico do Portfolio Engine**:
   O `PortfolioReplayEngine` apura exclusivamente o **resultado realizado econômico** da alienação:
   $$\text{realizedGainLoss} = \text{netProceeds} - \text{costBasisRemoved}$$
   Este resultado quantifica a variação patrimonial do investidor em relação ao custo histórico carregado na carteira.

2. **Separação Arquitetural do Tax Engine**:
   Registra-se expressamente que:
   $$\text{Economic Realized Gain} \neq \text{Taxable Realized Gain}$$
   O `PortfolioReplayEngine` **NÃO** calcula:
   - Imposto devido;
   - DARF mensal;
   - Classificação fiscal de ativos;
   - Segregação de day trade vs. swing trade;
   - Limite de isenção de R$ 20.000,00;
   - Compensação de prejuízos acumulados entre períodos fiscais.

3. **Papel dos Encargos (`taxes`) na Venda**:
   Se a transação de venda contiver o campo `taxes`, este é tratado puramente como **encargo transacional explícito** (ex: impostos municipais ou taxas sobre serviços da corretora) que reduz a receita líquida (`netProceeds`), e **NÃO** como estimativa de Imposto de Renda sobre Ganho de Capital.

4. **Consumo Futuro pelo Tax Engine**:
   O futuro `Tax Engine` consumirá os eventos `RealizedDisposal` gerados pelo `PortfolioReplayEngine` como dados brutos de entrada, aplicando sobre eles as regras tributárias e o calendário fiscal aplicável.

## Consequences

- **Positivas:**
  - Desacoplamento arquitetural limpo entre regras patrimoniais imutáveis e regras fiscais sujeitas a alterações legislativas frequentes.
  - O Portfolio Engine permanece agnóstico em relação a enquadramentos fiscais particulares do investidor (residente fiscal no Brasil, pessoa física, pessoa jurídica, investidor não-residente).
  - Testabilidade matemática pura do motor sem necessidade de configurar regimes tributários.
- **Negativas:**
  - O investidor não verá a apuração de imposto a pagar ou DARF até que o Tax Engine seja construído.
