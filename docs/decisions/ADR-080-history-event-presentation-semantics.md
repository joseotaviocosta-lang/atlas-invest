# ADR-080: History Event Presentation Semantics and Canonical Portuguese Labels

## Status

Accepted

## Context

Para garantir conformidade auditável e impedir ambiguidades contábeis ou fiscais perante o usuário final, as telas de histórico e atividade devem adotar uma taxonomia canônica unificada de termos e rótulos entre Web e Mobile.
Rótulos confusos como "Imposto devido" (que induziria cálculo ou débito tributário pendente) ou "Compra" atribuída indiscriminadamente a eventos corporativos de subscrição violam as diretrizes de governança do Project Atlas.

## Decision

1. **Matriz Canônica de Rótulos e Semântica de Eventos:**
   - **`REALIZED_DISPOSAL`** (origem: `SELL`) → **"Venda"** (com quantidade, valor líquido, custos de venda e ganho/perda realizado quando conhecidos; nunca categorizado como provento).
   - **`INCOME`** (origem: eventos econômicos de rendimento):
     - `DIVIDEND` → **"Dividendo"**
     - `JCP` → **"JCP"**
     - `FII_INCOME` → **"Rendimento de FII"**
   - **`CASH_FLOW`** (origem: movimentações financeiras externas e despesas):
     - `DEPOSIT` → **"Depósito"**
     - `WITHDRAWAL` → **"Retirada"**
     - `FEE` → **"Taxa"**
     - `TAX` → **"Tributo pago"** (terminantemente vedado utilizar "Imposto devido" ou qualquer termo que induza cálculo tributário ou obrigação pendente)
     - `AMORTIZATION` → **"Amortização"** (com contexto secundário explícito **"Devolução de capital"**)
   - **`CORPORATE_ACTION`** (origem: ações corporativas sobre custódia):
     - `SPLIT` → **"Desdobramento"**
     - `REVERSE_SPLIT` → **"Grupamento"**
     - `BONUS` → **"Bonificação"**
     - `SUBSCRIPTION` → **"Subscrição"** (sempre distinta de compra em bolsa)
     - `AMORTIZATION` → **"Amortização"** (**"Devolução de capital"**)
   - **`TRANSFER`** (origem: transferências de custódia entre contas ou corretoras):
     - `TRANSFER_IN` → **"Transferência de entrada"**
     - `TRANSFER_OUT` → **"Transferência de saída"**

2. **Exaustividade e Proibição de Kinds Inventados:**
   - A camada de apresentação (`buildPortfolioActivityViewModel`) é estritamente exaustiva sobre o enum `PortfolioHistoryKind` congelado no read model (`REALIZED_DISPOSAL`, `INCOME`, `CASH_FLOW`, `CORPORATE_ACTION`, `TRANSFER`).
   - É terminantemente vedado inventar ou manter kinds artificiais no client (ex: `SPIN_OFF`, `MERGER`, `INTEREST`, `BONUS_SHARES`, `BUY`).
   - Qualquer tipo não catalogado em tempo de execução aciona `assertNever`, falhando de modo fail-closed sem fallbacks silenciosos.

3. **Badges de Integridade e Status:**
   - Quando `status === 'UNMATCHED'` em transferências: badge amarelo de aviso **"Transferência incompleta"**.
   - Quando `costBasisStatus === 'INCOMPLETE'`: badge **"Custo incompleto"**.

4. **Multi-Moeda Isolado:**
   - Cada evento é exibido em sua respectiva moeda original (`currency`). É vedada qualquer conversão cambial fictícia ou soma cruzada entre moedas (`BRL` vs `USD`).

5. **Zero Client Financial Math (ADR-077):**
   - A timeline e seu ViewModel atuam puramente como projetores de strings formatadas via `@atlas/ui`. Não executam agregações aritméticas, divisão financeira ou cálculo de percentuais de participação por conta.

## Consequences

- Linguagem consistente, precisa e estritamente auditável em todas as superfícies do produto.
- Ausência de distorções semânticas ou interpretações fiscais precoces antes do Tax Engine oficial.
- Garantia de que o cliente consome 100% dos contratos congelados sem derivação ad-hoc.
