# ADR-011: Modelo de Armazenamento do Transaction Ledger (Tabela Única Discriminada)

## Status

Aprovado

## Contexto

O modelo de domínio do Project Atlas define 16 tipos especializados de transações no Ledger (Trade, Income, Split, Bonus, Subscription, Amortization, Transfer, Cash Movement, Expense), organizados como uma Discriminated Union baseada no discriminador `type`.
Haviam três alternativas de persistência no PostgreSQL:

1. Tabela por Tipo de Transação (16 tabelas separadas).
2. Tabela Base + Tabelas Específicas com Foreign Key (Class Table Inheritance).
3. Tabela Única com Discriminador e Colunas Específicas Anuláveis (Single Table Inheritance).

## Decisão

Adotamos a **Tabela Única com Discriminador** (`transactions`).

### Justificativas

1. **Ordenação Determinística do Ledger:** O cálculo de carteira e preço médio requer ler todas as transações de um portfólio ordenadas estritamente por `(trade_date ASC, created_at ASC, id ASC)`. Com tabela única, essa consulta utiliza um único índice composto (`portfolio_id, trade_date, created_at, id`) com custo $O(\log N)$ e zero overhead de joins polimórficos ou `UNION ALL`.
2. **Append-Only e Performance:** Inserções e consultas no histórico financeiro são frequentes; manter uma única tabela evita overhead de múltiplos índices e locks distribuídos entre tabelas.
3. **Idempotência Unificada:** A restrição única de idempotência `(portfolio_id, provider, external_id)` é garantida em um único ponto para todos os tipos de transações.
4. **Proteção Cross-Portfolio:** A chave estrangeira composta `(account_id, portfolio_id)` garante a nível de banco que a conta associada à transação pertence impreterivelmente ao mesmo portfólio da transação.

Campos específicos que não se aplicam a determinado tipo de transação (ex.: `quantity` em `DEPOSIT` ou `factor` em `BUY`) são nulos na linha e validados com rigor no `TransactionMapper` e nas factories do domínio.

## Consequências

- **Positivas:**
  - Altíssima performance de leitura e ordenação do ledger.
  - Paginação cursor-based direta e sem descontinuidades.
  - Invariantes garantidas pelo mapper ao carregar do banco.
- **Negativas / Mitigações:**
  - A tabela contém colunas anuláveis. Essa flexibilidade é controlada pelo `TransactionMapper`, que lança `PersistenceMappingError` se campos obrigatórios de uma variante estiverem ausentes.
