# ADR-080: History Event Presentation Semantics and Canonical Portuguese Labels

## Status

Accepted

## Context

Para garantir conformidade auditável e impedir ambiguidades contábeis ou fiscais perante o usuário final, as telas de histórico e atividade devem adotar uma taxonomia canônica unificada de termos e rótulos entre Web e Mobile.
Rótulos confusos como "Imposto devido" (que induziria cálculo ou débito tributário pendente) ou "Compra" atribuída indiscriminadamente a eventos corporativos de subscrição violam as diretrizes de governança do Project Atlas.

## Decision

1. **Catálogo Canônico de Rótulos de Eventos:**
   - `REALIZED_DISPOSAL` → **"Venda"** (com quantidade, valor líquido, custos de venda e ganho/perda realizado quando conhecidos).
   - `INCOME`:
     - `DIVIDEND` → **"Dividendo"**
     - `JCP` → **"JCP"**
     - `FII_INCOME` → **"Rendimento FII"**
   - `CASH_FLOW`:
     - `DEPOSIT` → **"Aporte"**
     - `WITHDRAWAL` → **"Retirada"**
     - `FEE` → **"Taxa"**
     - `TAX` → **"Tributo pago"** (terminantemente vedado utilizar "Imposto devido" ou termos que impliquem cálculo fiscal)
     - `AMORTIZATION` → **"Amortização"** (com contexto secundário **"Devolução de capital"**)
   - `CORPORATE_ACTION`:
     - `SPLIT` → **"Desdobramento"**
     - `REVERSE_SPLIT` → **"Grupamento"**
     - `BONUS` → **"Bonificação"**
     - `SUBSCRIPTION` → **"Subscrição"** (distinto de compra em mercado comum)
     - `AMORTIZATION` → **"Amortização"** (**"Devolução de capital"**)
   - `TRANSFER`:
     - `TRANSFER_IN` → **"Transferência de entrada"**
     - `TRANSFER_OUT` → **"Transferência de saída"**
2. **Badges de Integridade e Status:**
   - Quando `status === 'UNMATCHED'` em transferências: badge amarelo de aviso **"Transferência incompleta"**.
   - Quando `costBasisStatus === 'INCOMPLETE'`: badge **"Custo incompleto"**.
3. **Multi-Moeda Isolado:**
   - Cada evento é exibido em sua respectiva moeda original (`currency`). É vedada qualquer conversão cambial fictícia ou soma cruzada entre moedas (`BRL` vs `USD`).
4. **Zero Client Financial Math (ADR-077):**
   - A timeline e seu ViewModel atuam puramente como projetores de strings formatadas via `@atlas/ui`. Não executam agregações aritméticas no cliente.

## Consequences

- Linguagem consistente, precisa e estritamente auditável em todas as superfícies do produto.
- Ausência de distorções semânticas ou interpretações fiscais precoces antes do Tax Engine oficial.
