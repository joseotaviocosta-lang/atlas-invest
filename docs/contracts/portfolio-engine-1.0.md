# Formal Specification & Contract Freeze: Portfolio Engine 1.0 (Release Candidate)

**Engine Version:** `1.0.0-rc.1`  
**Package:** `@atlas/portfolio-engine`  
**Status:** Frozen Contract (Release Candidate)

---

## 1. Architectural Pipeline

O Portfolio Engine opera sob um fluxo estritamente unidirecional e determinístico:

```
Transaction Ledger (Append-Only)
        │
        ▼
Deterministic Replay Engine (Pure Function)
        │
        ▼
Derived State (In-Memory Frozen PortfolioState)
        │
        ▼
Application Read Models (State, Positions, History)
        │
        ▼
Portfolio Read API v1 (HTTP Endpoints)
```

### Invariantes do Pipeline

- **Imutabilidade de Entrada**: O array e as instâncias de `Transaction` passados como entrada nunca são modificados.
- **Congelamento Estrutural de Saída**: O objeto `PortfolioState` e todas as coleções internas (`Map`, `Array`) são congelados via `Object.freeze`.
- **Zero Aritmética de Ponto Flutuante**: Cálculos monetários e quantitativos utilizam estritamente `Money`, `Quantity` e `DecimalValue` (base `decimal.js`), eliminando erros de arredondamento IEEE 754.

---

## 2. Matriz Semântica de Tipos de Transação (16 Tipos)

O Portfolio Engine 1.0 suporta formalmente 16 tipos de transação no livro-razão:

| Tipo de Transação | Efeito na Quantidade | Efeito no Custo Base                   | Efeito no Caixa Externo           | Apura Resultado Realizado? | Registra Rendimento? |
| :---------------- | :------------------- | :------------------------------------- | :-------------------------------- | :------------------------- | :------------------- |
| `BUY`             | Aumenta              | Aumenta (preço + taxas/impostos)       | Neutro (liquidação de bolsa)      | Não                        | Não                  |
| `SELL`            | Reduz                | Reduz (proporcional ao custo médio)    | Neutro (liquidação de bolsa)      | Sim (`RealizedDisposal`)   | Não                  |
| `DIVIDEND`        | Neutro               | Neutro                                 | Neutro                            | Não                        | Sim (`DIVIDEND`)     |
| `JCP`             | Neutro               | Neutro                                 | Neutro                            | Não                        | Sim (`JCP`)          |
| `FII_INCOME`      | Neutro               | Neutro                                 | Neutro                            | Não                        | Sim (`FII_INCOME`)   |
| `SPLIT`           | Aumenta (`* factor`) | Neutro (custo total idêntico)          | Neutro                            | Não                        | Não                  |
| `REVERSE_SPLIT`   | Reduz (`/ factor`)   | Neutro (custo total idêntico)          | Neutro                            | Não                        | Não                  |
| `BONUS`           | Aumenta              | Aumenta (se `assignedCost` atribuído)  | Neutro                            | Não                        | Não                  |
| `SUBSCRIPTION`    | Aumenta              | Aumenta (`qty * unitPrice`)            | Neutro                            | Não                        | Não                  |
| `AMORTIZATION`    | Neutro               | Reduz (pelo valor amortizado)          | `CAPITAL_RETURN` (Entrada)        | Não                        | Não                  |
| `TRANSFER_IN`     | Aumenta              | Transfere custo de origem (se pareado) | Neutro (custódia interna)         | Não                        | Não                  |
| `TRANSFER_OUT`    | Reduz                | Remove custo proporcional              | Neutro (custódia interna)         | Não                        | Não                  |
| `DEPOSIT`         | Neutro               | Neutro                                 | `EXTERNAL_CONTRIBUTION` (Entrada) | Não                        | Não                  |
| `WITHDRAWAL`      | Neutro               | Neutro                                 | `EXTERNAL_WITHDRAWAL` (Saída)     | Não                        | Não                  |
| `FEE`             | Neutro               | Neutro                                 | `OPERATIONAL_EXPENSE` (Saída)     | Não                        | Não                  |
| `TAX`             | Neutro               | Neutro                                 | `TAX_PAYMENT` (Saída)             | Não                        | Não                  |

---

## 3. Matriz de Resultados Derivados (Contêineres de Saída)

A execução de `replayPortfolio({ portfolioId, transactions, asOfDate })` produz um objeto `ReplayResult` contendo:

1. `engineVersion`: Versão canônica (`1.0.0-rc.1`).
2. `totalProcessedCount`: Total de transações processadas após ordenação e filtro `asOfDate`.
3. `appliedTransactions`: Lista de transações aplicadas no replay.
4. `deferredEvents`: Eventos adiados por regras temporais ou dependências (se aplicável).
5. `state: PortfolioState`:
   - `portfolioId`: Identificador da carteira.
   - `asOfDate`: Data limite do replay ou `undefined` se histórico completo.
   - `assets`: `ReadonlyMap<string, AssetState>` — posições consolidadas abertas (quantidade > 0).
   - `accounts`: `ReadonlyMap<string, AccountState>` — estados por conta segregada.
   - `realizedDisposals`: `readonly RealizedDisposal[]` — alienações com resultado apurado.
   - `realizedSummary`: `ReadonlyMap<Currency, RealizedSummary>` — totais de vendas e ganhos por moeda.
   - `appliedCorporateActions`: `readonly AppliedCorporateAction[]` — auditoria de splits, bonificações, etc.
   - `incomeEvents`: `readonly IncomeEvent[]` — proventos recebidos.
   - `incomeSummary`: `ReadonlyMap<Currency, IncomeSummary>` — totais de proventos por moeda.
   - `cashFlowEvents`: `readonly CashFlowEvent[]` — fluxos de caixa classificados.
   - `cashFlowSummary`: `ReadonlyMap<Currency, CashFlowSummary>` — sumário de aportes, retiradas, taxas por moeda.
   - `appliedTransfers`: `readonly AppliedTransfer[]` — auditoria de pernas de transferência.

---

## 4. Catálogo de Invariantes Formais

1. **Ordenação Canônica Determinística**:
   - Critério estrito de ordenação da tupla `(tradeDate ASC, createdAt ASC, id ASC)`.
2. **Omissão de Posições Zeradas**:
   - Posições cujo saldo seja integralmente liquidado (`quantity == 0`) são excluídas do mapa de ativos abertos.
3. **Consistência de Custo Médio Ponderado**:
   - O custo médio por cota/ação é derivado por divisão direta: `totalCost / quantity`. Nunca é calculada média simples ou média de médias.
4. **Conservação de Custo e Quantidade em Transferências Pareadas**:
   - Uma transferência pareada (`TRANSFER_OUT` + `TRANSFER_IN` com mesmo `transferGroupId`) conserva a quantidade global e o custo total transferido no nível consolidado da carteira.
5. **Degradação Elegante de Histórico Incompleto**:
   - Transações sem custo conhecido (ex: `TRANSFER_IN` órfão) marcam a posição como `costBasisStatus = 'INCOMPLETE'`.
   - O custo total e custo médio passam a ser `undefined` / `null`. É terminantemente proibido fabricar custo zero (`0.00`).
6. **Segregação Estrita Multimoeda**:
   - Ativos em moedas distintas (ex: BRL e USD) operam em dimensões segregadas sem conversão cambial implícita.
7. **Princípio Fail-Closed**:
   - Qualquer anomalia contábil fatal (venda a descoberto, ID duplicado, amortização superior ao custo) aborta o replay com erro atômico, sem geração de estado parcial.

---

## 5. Hierarquia de Erros do Engine

Todos os erros operacionais derivam de `PortfolioReplayError`:

```
PortfolioReplayError
├── OversellError
├── DuplicateTransactionError
├── CrossPortfolioTransactionError
├── CurrencyMismatchError
├── TransferCurrencyMismatchError
├── TransferPairMismatchError
├── DuplicateTransferLegError
├── CrossAssetTransferError
├── InvalidTransferGroupError
├── EmptyPositionCorporateActionError
├── InvalidCorporateActionFactorError
├── AmortizationExceedsCostError
├── AmortizationIncompleteCostError
├── InvalidBuyCostError
└── InvalidSellPriceError
```
