# ADR-038: Deferred Transaction Semantics in Phase 1A

## Status

Accepted

## Context

O domínio do Atlas modela 16 tipos de transação (`TRANSACTION_TYPES`):

- Operações de quantidade: `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`
- Proventos / Renda: `DIVIDEND`, `JCP`, `FII_INCOME`
- Eventos societários / Custódia: `BONUS`, `SPLIT`, `REVERSE_SPLIT`, `SUBSCRIPTION`, `AMORTIZATION`
- Caixa da conta: `DEPOSIT`, `WITHDRAWAL`
- Encargos financeiros: `FEE`, `TAX`

Na Fase 1A (Portfolio Engine Core & Deterministic Replay), o escopo estrito é restrito à reconstituição de quantidades (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`), sem incorporar a matemática de desdobramentos, cálculo de custo médio ponderado, retenção tributária ou saldo de caixa bancário.

Entretanto, transações válidas do ledger não podem ser silenciosamente descartadas ou ignoradas sem deixar rastros, sob risco de quebra de auditabilidade e perda de transparência.

## Decision

1. **Explicit Exhaustive Handling**: O `dispatcher.ts` deve tratar exaustivamente todos os 16 tipos de transação através de verificação em tempo de compilação com `never` typecheck do TypeScript.
2. **Applied Transactions**: `BUY`, `SELL`, `TRANSFER_IN` e `TRANSFER_OUT` alteram a quantidade do ativo na conta e são registradas no array `appliedTransactions`.
3. **Deferred Events**: Os outros 12 tipos são reconhecidos formalmente e registrados como `DeferredPortfolioEvent` no array `deferredEvents` da saída `ReplayResult`, contendo:
   - `transactionId`: ID da transação
   - `type`: Tipo de transação
   - `reason`: Justificativa explícita (ex: `'SPLIT corporate action logic is deferred to Phase 1C'`)
   - `tradeDate`: Data econômica
   - Metadados relevantes disponíveis (`assetId`, `amount`, `quantity`)
4. **Zero Silent Drops**: Nenhuma transação pode ser ignorada silenciosamente. Cada transação no ledger processada deve constar ou em `appliedTransactions` ou em `deferredEvents`, satisfazendo:
   `totalProcessedCount === appliedTransactions.length + deferredEvents.length`

## Consequences

- **Positivas:**
  - Auditabilidade e transparência absolutas em todas as fases do projeto.
  - Segurança de compilação: novos tipos adicionados a `TRANSACTION_TYPES` no futuro quebrarão a compilação no dispatcher, impedindo esquecimentos.
  - O motor da Fase 1A já é 100% compatível com ledgers que contêm proventos, splits e lançamentos financeiros.
- **Negativas:**
  - Desdobramentos (`SPLIT`/`REVERSE_SPLIT`) e bonificações (`BONUS`) presentes no histórico não alteram a quantidade física de ações até a conclusão da Fase 1C.
