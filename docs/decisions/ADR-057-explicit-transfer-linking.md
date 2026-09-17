# ADR-057: Explicit Transfer Linking via transferGroupId and Zero-Heuristic Matching

## Status

Accepted

## Context

No gerenciamento patrimonial de investimentos, a transferência de custódia entre contas e instituições (ex.: transferência de custódia da corretora A para a corretora B) é uma operação frequente.

Tentativas em sistemas legados de associar "pernas" de transferência (`TRANSFER_OUT` e `TRANSFER_IN`) por heurísticas (como coincidir ticker, data aproximada e quantidade) introduzem fragilidade severa:

- Falhas de pareamento sob transferências parciais simultâneas ou consecutivas.
- Falsos positivos quando múltiplas contas movimentam o mesmo ativo.
- Comportamento não determinístico caso a ordem do array de entrada varie.

Era imperativo definir uma semântica rígida, auditável e determinística para pareamento de custódia interna no Portfolio Engine da Fase 1F.

## Decision

1. **Vínculo Explícito por `transferGroupId`**:
   - Todo par de transferência de custódia interna DEVE compartilhar um identificador único de agrupamento (`transferGroupId: string`).
   - O campo é suportado nativamente na entidade de domínio `TransferTransaction`, no schema relacional PostgreSQL (`transfer_group_id VARCHAR(255)` com índice `@@index([portfolioId, transferGroupId])`) e no DTO de criação de transações da API.
   - **Zero Heurística**: O Portfolio Engine não realiza adivinhação, aproximação de datas, busca por similaridade de tickers ou pareamento implícito. Sem `transferGroupId`, as pernas são tratadas rigorosamente como transferências externas/não pareadas.

2. **Validações Semânticas Pré-Replay**:
   - O engine realiza um pré-escaneamento das transações do portfólio para indexar os pares antes da execução.
   - As seguintes regras semânticas geram exceção imediata:
     - **Duplicação de pernas**: No máximo um `TRANSFER_OUT` e um `TRANSFER_IN` podem compartilhar o mesmo `transferGroupId`. Se houver mais de um de qualquer tipo, lança `DuplicateTransferLegError`.
     - **Divergência de Ativo**: As duas pernas devem referenciar exatamente o mesmo `AssetId`. Caso contrário, lança `CrossAssetTransferError`.
     - **Divergência de Moeda**: As duas pernas devem transacionar na mesma moeda. Caso contrário, lança `TransferCurrencyMismatchError`.
     - **Divergência de Quantidade**: A quantidade enviada pelo `TRANSFER_OUT` deve ser estritamente igual à recebida pelo `TRANSFER_IN`. Caso contrário, lança `TransferPairMismatchError`.
     - **Auto-Transferência**: A conta de origem e de destino devem ser distintas (`fromAccountId !== toAccountId`). Caso contrário, lança `InvalidTransferGroupError`.
     - **Inversão Causal de Datas**: A data do `TRANSFER_IN` não pode preceder a data do `TRANSFER_OUT` (`inTradeDate >= outTradeDate`). Caso contrário, lança `InvalidTransferGroupError`.

3. **Independência da Ordenação de Entrada**:
   - O pareamento ocorre na fase de metadados. O replay segue a ordem canônica determinística do livro-razão (`tradeDate ASC`, `createdAt ASC`, `id ASC`), sem violação da linha do tempo.

## Consequences

- **Positivas:**
  - 100% determinístico e à prova de ambiguidades.
  - Rastreabilidade ponta a ponta de movimentações entre instituições.
  - Imutabilidade da integridade patrimonial durante transferências.
- **Negativas:**
  - Sistemas externos ou usuários que importarem notas sem agrupador explícito terão pernas tratadas como transferências externas até que o identificador seja fornecido.
