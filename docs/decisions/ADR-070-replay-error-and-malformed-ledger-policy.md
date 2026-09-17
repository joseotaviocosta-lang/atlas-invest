# ADR-070: Replay Error and Malformed Ledger Policy

## Status

Accepted

## Context

No domínio financeiro e patrimonial, um livro-razão (ledger) inconsistente ou corrompido — contendo transações como venda a descoberto (oversell), ID duplicado, transferência cruzada com moedas divergentes ou ações corporativas em posições zeradas — apresenta risco de adulteração contábil. É necessário estabelecer uma política formal e inequívoca de tratamento de erros no Portfolio Engine.

## Decision

1. **Princípio Fail-Closed e Atomicidade de Erro**:
   - Em caso de qualquer inconsistência, o Portfolio Engine rejeita a totalidade do processamento, abortando imediatamente via exceção específica tipada derivada de `PortfolioReplayError`.
   - É estritamente proibido o descarte silencioso de transações inválidas (silent drop) ou a devolução de estado parcial "válido até o ponto do erro".

2. **Hierarquia de Exceções de Replay**:
   - As exceções incluem:
     - `OversellError`: Venda tentando deduzir quantidade superior à custodiada.
     - `DuplicateTransactionError`: Identificador de transação repetido no mesmo lote.
     - `CrossPortfolioTransactionError`: Transação pertencente a outra carteira.
     - `CurrencyMismatchError` / `TransferCurrencyMismatchError`: Divergência cambial entre contas/ativos em operações restritas.
     - `TransferPairMismatchError`, `DuplicateTransferLegError`, `CrossAssetTransferError`: Inconsistências em pares de transferência de custódia.
     - `EmptyPositionCorporateActionError`, `InvalidCorporateActionFactorError`: Operações societárias inválidas.
     - `AmortizationExceedsCostError`, `AmortizationIncompleteCostError`: Amortização excedendo custo ou aplicada em posição com custo desconhecido.

3. **Mapeamento HTTP na Camada de Aplicação**:
   - Na camada HTTP (NestJS), qualquer `PortfolioReplayError` disparado durante o cálculo é capturado e mapeado para HTTP `422 Unprocessable Entity` com o código padronizado `PORTFOLIO.REPLAY_FAILED`.
   - A resposta de erro inclui detalhes diagnósticos estruturados (tipo do erro, identificadores afetados e mensagem explicativa), permitindo correção auditável pelo usuário ou suporte técnico.

## Consequences

- **Positivas:**
  - Garantia de integridade contábil absoluta: estados derivados incorretos jamais chegam ao cliente.
  - Rastreabilidade total e clareza diagnóstica de falhas no ledger.
- **Negativas:**
  - Uma única transação malformada no histórico impede a exibição da carteira até ser retificada ou cancelada.
