# ADR-067: Portfolio Engine 1.0 Contract Freeze

## Status

Accepted

## Context

Com o encerramento das fases 1A a 1G, o Portfolio Engine atingiu a maturidade funcional necessária para o cálculo determinístico de posições, custos médios ponderados, eventos de renda, ações corporativas, fluxos de caixa, transferências de custódia e modelos de leitura HTTP. Para garantir estabilidade aos clientes do motor (APIs, Web, Mobile e futuros motores de Performance e Tax), faz-se mandatório congelar os contratos do Portfolio Engine 1.0 como Release Candidate (`1.0.0-rc.1`).

## Decision

1. **Congelamento do Pipeline Arquitetural**:
   - Fica formalizado e congelado o pipeline unidirecional:
     `Transaction Ledger -> Deterministic Replay -> Derived State -> Application Read Models -> Portfolio Read API v1`.
   - Nenhuma camada posterior pode retroalimentar ou mutar o Transaction Ledger.

2. **Congelamento da Matriz Semântica de 16 Tipos de Transação**:
   - Os 16 tipos suportados (`BUY`, `SELL`, `DIVIDEND`, `JCP`, `FII_INCOME`, `SPLIT`, `REVERSE_SPLIT`, `BONUS`, `SUBSCRIPTION`, `AMORTIZATION`, `TRANSFER_IN`, `TRANSFER_OUT`, `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX`) têm seus efeitos formais congelados em termos de quantidade, custo total carregado, custo médio, fluxos de caixa e apuração de resultado.

3. **Imutabilidade Estrita e Congelamento Estrutural**:
   - Todos os mapas (`Map`), coleções (`Array`) e objetos de estado retornados pelo engine são congelados via `Object.freeze`.
   - A entrada de transações nunca é modificada pelo motor.

4. **Zero Aritmética de Ponto Flutuante**:
   - Todas as quantidades e grandezas financeiras operam estritamente sobre tipos decimais exatos (`Quantity`, `Money`, `DecimalValue`), sendo expressas como strings numéricas sem notação científica nas interfaces externas.

## Consequences

- **Positivas:**
  - Estabilidade absoluta e garantia contratual para integração com aplicações front-end e camadas superiores.
  - Prevenção de divergências contábeis e regressões funcionais.
- **Negativas:**
  - Qualquer alteração nas assinaturas centrais ou semântica exigirá versionamento explícito (ex: Engine 2.0).
