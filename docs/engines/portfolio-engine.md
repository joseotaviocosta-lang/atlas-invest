# Portfolio Replay Engine — Architecture & Specification

## 1. Overview

O **Portfolio Replay Engine** (`@atlas/portfolio-engine`) é o núcleo financeiro determinístico responsável por reconstituir o estado derivado de uma carteira de investimentos (`PortfolioState`, `AccountState`, `AssetState`) a partir do histórico imutável de transações do ledger (`Transaction`).

### Princípios Arquiteturais Fundamentais

1. **Ledger as Source of Truth**: Posições em custódia (`Position` / `AssetState`) **NÃO** são mantidas como dados mutáveis no banco de dados. O livro-razão de transações (`Transaction`) é a única fonte da verdade (ADR-004, ADR-036).
2. **Função Pura e Sem Estado**: O motor não realiza I/O, não acessa banco de dados e não possui estado mantido entre execuções. Para a mesma entrada, produz exatamente a mesma saída (`deterministic replay`).
3. **Precisão Arbitrária**: Nenhuma operação financeira utiliza pontos flutuantes IEEE 754. Quantidades utilizam o Value Object `Quantity` do `@atlas/domain` (precisão arbitrária de até 18 casas decimais).
4. **Imutabilidade Total**: A coleção de transações fornecida na entrada é tratada como imutável. Todos os mapas, arrays e estruturas retornadas são profundamente congelados (`Object.freeze`).

---

## 2. Ordenação Canônica Cronológica (3-Tuple)

A consistência de um motor financeiro depende criticamente da estabilidade e determinismo da ordem em que os eventos são avaliados. Conforme estabelecido no **ADR-037**, o motor e o repositório de persistência aplicam a tupla canônica de ordenação em 3 níveis:

```typescript
(tradeDate ASC, createdAt ASC, id ASC)
```

1. **`tradeDate` (Data Econômica)**: Ordena pelo dia em que o pregão ou evento societário ocorreu (`LocalDate`).
2. **`createdAt` (Ordem de Registro)**: Desempate para operações registradas na mesma data econômica, refletindo a sequência temporal em que foram inseridas.
3. **`id` (Desempate Estrito)**: Desempate lexicográfico estável por UUID, garantindo que mesmo operações inseridas no mesmo milissegundo tenham ordem 100% determinística em qualquer plataforma.

---

## 3. Semântica de Quantidade e Transações Suportadas

Na Fase 1A, o motor concentra-se estritamente na reconstituição de **quantidades de custódia**:

| Tipo de Transação | Efeito na Quantidade | Destino               |
| :---------------- | :------------------- | :-------------------- |
| `BUY`             | Acréscimo (+qty)     | `appliedTransactions` |
| `SELL`            | Dedução (-qty)       | `appliedTransactions` |
| `TRANSFER_IN`     | Acréscimo (+qty)     | `appliedTransactions` |
| `TRANSFER_OUT`    | Dedução (-qty)       | `appliedTransactions` |

### Invariante Long-Only (Sem Posições Vendidas a Descoberto)

O Project Atlas adota estritamente a política long-only. Se uma operação `SELL` ou `TRANSFER_OUT` tentar deduzir uma quantidade superior à existente na conta, o motor lança imediatamente `NegativePositionError`:

```typescript
throw new NegativePositionError({
  portfolioId,
  accountId,
  assetId,
  currentQuantity,
  attemptedDeduction,
  resultingQuantity,
});
```

### Política de Posição Zero (ADR-039)

Quando a quantidade de um ativo é integralmente liquidada (`quantity.isZero()`), ele é omitido dos mapas de posições ativas em `AccountState.assets` e `PortfolioState.assets`. Isso garante que `state.assets` contenha apenas ativos com custódia positiva (> 0).

---

## 4. Política de Transações Diferidas (ADR-038)

O modelo de domínio possui 16 tipos de transação. Na Fase 1A, operações que envolvem precificação média, desdobramentos societários ou fluxo de caixa puro são formalmente diferidas:

- **Proventos**: `DIVIDEND`, `JCP`, `FII_INCOME` (Diferidos para Fase 1B/1D)
- **Ações Societárias**: `SPLIT`, `REVERSE_SPLIT`, `BONUS`, `SUBSCRIPTION`, `AMORTIZATION` (Diferidos para Fase 1C)
- **Caixa & Encargos**: `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX` (Diferidos para Fase 1D/1E)

**Zero Silent Drops**: Toda transação diferida é registrada no array `deferredEvents` de `ReplayResult` com justificativa explícita e metadados, satisfazendo a invariante:
$$\text{totalProcessedCount} = \text{appliedTransactions.length} + \text{deferredEvents.length}$$

---

## 5. Corte Histórico (`asOfDate`)

O motor suporta reconstrução histórica do estado da carteira através do parâmetro opcional `asOfDate`:

- Transações com `tradeDate <= asOfDate` são incluídas no replay.
- Transações com `tradeDate > asOfDate` são desconsideradas.
- Se `asOfDate` for anterior à primeira transação da carteira, o motor retorna um `PortfolioState` vazio válido com contadores zerados.

---

## 6. Especificação da API Pública

```typescript
import {
  createPortfolioReplayEngine,
  replayPortfolio,
  PortfolioReplayEngine,
  PortfolioState,
  ReplayResult,
  PORTFOLIO_ENGINE_VERSION,
} from '@atlas/portfolio-engine';

// Execução via Engine
const engine = createPortfolioReplayEngine();
const result = engine.replay({
  portfolioId: '33333333-3333-4333-8333-333333333333',
  transactions: transactionList,
  asOfDate: '2026-03-01',
});

// Acesso ao estado derivado
const petr4 = result.state.assets.get(assetId);
console.log(petr4?.quantity.value); // ex: "150"
```

---

## 7. Desempenho e Metas Atingidas

- **1.000 Transações**: Replay completo em menos de **120ms** (alvo: < 500ms).
- **10.000 Transações**: Replay completo em menos de **1.100ms** (alvo: < 3.000ms).
- **Memória**: Zero retenção ou acúmulo de estado; estruturas de transações antigas liberadas para coleta de lixo.

---

## 8. Custo Base e Preço Médio Ponderado (Fase 1B)

A Fase 1B introduz a matemática patrimonial de estoque contábil móvel no motor, expandindo `AssetState` com `totalCost`, `averageCost`, `currency` e `costBasisStatus`.

### 8.1. Acumulação no BUY

Para cada compra, o custo de aquisição incorpora os encargos acessórios atribuíveis:
$$\text{grossCost} = \text{quantity} \times \text{unitPrice}$$
$$\text{acquisitionCost} = \text{grossCost} + \text{fees} + \text{taxes}$$
$$\text{newTotalCost} = \text{previousTotalCost} + \text{acquisitionCost}$$
$$\text{newQuantity} = \text{previousQuantity} + \text{buyQuantity}$$
$$\text{newAverageCost} = \frac{\text{newTotalCost}}{\text{newQuantity}}$$

- **Média Ponderada**: O preço médio é estritamente ponderado por quantidade e custo (ADR-040). Média aritmética simples de preços de aquisição é proibida.
- **Precisão**: Operações financeiras executadas exclusivamente com `Decimal.js` (40 dígitos de precisão). Sem arredondamentos prematuros na camada de cálculo.

### 8.2. Dedução Proporcional no SELL

Ao alienar cotas (`SELL`), o custo carregado é deduzido proporcionalmente pelo preço médio unitário pré-venda:
$$\text{costRemoved} = \text{averageCost} \times \text{sellQuantity}$$
$$\text{newTotalCost} = \text{totalCost} - \text{costRemoved}$$

- **Invariância do Preço Médio**: O preço de execução da venda (`unitPrice`) **não** altera o preço médio das cotas remanescentes (ADR-041).
- **Liquidação Integral**: Se todas as cotas forem vendidas, o custo acumulado zera exatamente (`totalCost = 0`) e a posição é omitida do mapa ativo (ADR-039). Recompras posteriores iniciam novo estoque limpo.

### 8.3. Agregação no Nível da Carteira (Portfolio-Level)

O preço médio consolidado da carteira reflete a razão entre o custo total agregado de todas as contas e a quantidade agregada (ADR-042):
$$\text{portfolioTotalCost} = \sum \text{accountTotalCost}$$
$$\text{portfolioQuantity} = \sum \text{accountQuantity}$$
$$\text{portfolioAverageCost} = \frac{\text{portfolioTotalCost}}{\text{portfolioQuantity}}$$

- **Proibição de 'Média de Médias'**: O preço médio da carteira nunca é a média simples dos preços médios das contas individuais.

### 8.4. Política de Transferências e Custo Incompleto

- Transações `TRANSFER_IN` sem nota ou custo de aquisição explícito estabelecem `costBasisStatus: 'INCOMPLETE'` (ADR-043).
- **Custo Desconhecido ≠ Zero**: É expressamente proibido inventar `averageCost = 0` para posições sem histórico de custo conhecido. `totalCost` e `averageCost` tornam-se `undefined`.
- A presença de uma posição com custo incompleto propaga o status `INCOMPLETE` para o ativo na consolidação do portfólio.
