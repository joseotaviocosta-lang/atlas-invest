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

Com a conclusão das Fases 1A, 1B, 1C e 1D, o motor processa 8 tipos canônicos de transações aplicadas:

| Tipo de Transação | Efeito Patrimonial / Custódia            | Destino               |
| :---------------- | :--------------------------------------- | :-------------------- |
| `BUY`             | Acréscimo de quantidade e custo          | `appliedTransactions` |
| `SELL`            | Dedução de quantidade e custo realizado  | `appliedTransactions` |
| `TRANSFER_IN`     | Acréscimo de quantidade                  | `appliedTransactions` |
| `TRANSFER_OUT`    | Dedução de quantidade                    | `appliedTransactions` |
| `SPLIT`           | Multiplicação de quantidade (custo fixo) | `appliedTransactions` |
| `REVERSE_SPLIT`   | Divisão de quantidade (custo fixo)       | `appliedTransactions` |
| `BONUS`           | Acréscimo de quantidade bonificada       | `appliedTransactions` |
| `AMORTIZATION`    | Redução de custo (quantidade fixa)       | `appliedTransactions` |

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

O modelo de domínio possui 16 tipos de transação. Na Fase 1D, 8 tipos são aplicados e 8 tipos permanecem formalmente diferidos:

- **Proventos Periódicos**: `DIVIDEND`, `JCP`, `FII_INCOME` (Diferidos para Fase 1E)
- **Subscrição**: `SUBSCRIPTION` (Diferido para Fase 1F)
- **Caixa & Encargos Isolados**: `DEPOSIT`, `WITHDRAWAL`, `FEE`, `TAX` (Diferidos para Fase 1G)

**Zero Silent Drops**: Toda transação diferida é registrada no array `deferredEvents` de `ReplayResult` com justificativa explícita e metadados, satisfazendo a invariante:

$$\text{totalProcessed} = \text{appliedCount} + \text{deferredCount}$$

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
- **Precisão Decimal Operacional**: Operações financeiras executadas exclusivamente com `Decimal.js` (40 dígitos de precisão decimal operacional, suficiente para mitigar qualquer erro de ponto flutuante, não precisão infinita). Sem arredondamentos prematuros na camada de cálculo.
- **Portfolio Cost Basis ≠ Tax Basis**: A base de custo calculada pelo motor é estritamente a base patrimonial carregada da carteira, não se confundindo com apuração tributária (ADR-040).

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

---

## 9. Alienação Econômica e Resultado Realizado (Fase 1C)

A Fase 1C introduz a derivação matemática dos resultados econômicos de vendas (`SELL`), registrando os eventos derivados `RealizedDisposal` e os resumos agregados `RealizedSummary` por moeda em cada conta e no portfólio.

### 9.1. Fórmulas Canônicas de Venda

Para cada transação `SELL`:
$$\text{grossProceeds} = \text{quantity} \times \text{unitPrice}$$
$$\text{sellingCosts} = \text{fees} + \text{taxes}$$
$$\text{netProceeds} = \text{grossProceeds} - \text{sellingCosts}$$
$$\text{costBasisRemoved} = \text{averageCostBefore} \times \text{quantity}$$
$$\text{realizedGainLoss} = \text{netProceeds} - \text{costBasisRemoved}$$
$$\text{realizedReturnPercentage} = \frac{\text{realizedGainLoss}}{\text{costBasisRemoved}} \times 100 \quad (\text{quando } \text{costBasisRemoved} > 0)$$

- **Sinal do Retorno**: Lucros resultam em ganho positivo; prejuízos resultam em ganho negativo; break-even resulta em ganho zero.
- **Validações**: Exige `unitPrice > 0` (`InvalidSellPriceError`) e encargos não-negativos (`InvalidSellingCostError`). Rejeita moedas conflitantes com `CurrencyMismatchError`.
- **Semântica de `SELL.taxes`**: Representa estritamente encargos contratuais atribuídos à transação de venda na nota de corretagem (ex: emolumentos, taxas de liquidação B3). Não expressa nem antecipa apuração de imposto de renda, IRRF, DARF ou obrigação tributária.

### 9.2. Agregação e Proibição de Média de Retornos

- Os totais de valor bruto da venda e ganho realizado em cada moeda são obtidos pela soma estrita dos eventos da respectiva moeda (ADR-045):
  $$\text{portfolioRealizedGainLoss} = \sum \text{accountRealizedGainLoss}$$
- **Proibição de Média de Retornos**: O retorno percentual consolidado **nunca** é calculado como a média simples dos retornos das contas ou vendas individuais. Utiliza-se exclusivamente a razão entre o ganho líquido total e o custo total removido:
  $$\text{portfolioRealizedReturnPercentage} = \frac{\text{portfolioRealizedGainLoss}}{\text{portfolioCostBasisRemoved}} \times 100$$
- **Segregação Multimoeda**: Saldos e resumos de moedas distintas (ex: BRL e USD) são mantidos em mapas independentes (`realizedSummary`), sem conversão cambial fictícia.

### 9.3. Política de Custo Incompleto em Vendas

- Quando uma posição possui `costBasisStatus: 'INCOMPLETE'` e cotas são vendidas:
  - A quantidade é deduzida normalmente da custódia.
  - Os valores de venda (`grossProceeds`, `netProceeds`) são apurados com exatidão com base no preço negociado e custos explícitos.
  - `costBasisRemoved`, `realizedGainLoss` e `realizedReturnPercentage` permanecem `undefined`.
  - O evento e os resumos da conta e do portfólio são marcados como `status: 'INCOMPLETE'` (ADR-046).
  - **Zero Custo é Proibido**: Custo desconhecido nunca é tratado como zero para inventar lucros artificiais.

### 9.4. Exclusão de Operações Não-Alienações

- `TRANSFER_OUT` e `TRANSFER_IN` não são disposições econômicas e **nunca** emitem `RealizedDisposal` (a contagem de eventos realizados permanece rigorosamente inalterada).
- `BUY` nunca gera resultado realizado.
- Transações separadas `FEE` e `TAX` permanecem em `deferredEvents` e **nunca** são associadas a vendas por heurística temporal ou de valor.

### 9.5. Separação Estrita da Esfera Fiscal (Economic ≠ Tax)

- O `PortfolioReplayEngine` apura exclusivamente o **resultado econômico** da carteira (ADR-047).
- O motor **não** calcula imposto de renda, DARF, isenção de R$ 20.000, segregação de day trade ou compensação de prejuízos fiscais. O futuro `Tax Engine` consumirá os eventos de alienação e aplicará autonomamente a legislação fiscal pertinente.

---

## 10. Eventos Corporativos (Corporate Actions)

Na Fase 1D, o `PortfolioReplayEngine` incorpora suporte determinístico para 4 eventos societários canônicos: `SPLIT`, `REVERSE_SPLIT`, `BONUS` e `AMORTIZATION`.

### 10.1. Desdobramento (`SPLIT`) — ADR-048

- **Regra**: Multiplica a quantidade pelo fator; preserva integralmente o custo carregado; recalcula o preço médio unitário:
  $$\text{quantity}_{after} = \text{quantity}_{before} \times \text{factor}$$
  $$\text{totalCost}_{after} = \text{totalCost}_{before}$$
  $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
- **Validações**: $\text{factor} > 0 \land \text{factor} \neq 1$. Rejeita posições vazias com `EmptyPositionCorporateActionError`.

### 10.2. Grupamento (`REVERSE_SPLIT`) — ADR-048

- **Regra**: Divide a quantidade pelo fator; preserva integralmente o custo carregado; recalcula o preço médio unitário:
  $$\text{quantity}_{after} = \frac{\text{quantity}_{before}}{\text{factor}}$$
  $$\text{totalCost}_{after} = \text{totalCost}_{before}$$
  $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
- **Precisão de Sobras Fracionárias**: Frações de cotas/ações são preservadas com precisão exata (40 dígitos decimais) e não sofrem truncamento arbitrário para inteiros.
- **Validações**: $\text{factor} > 0 \land \text{factor} \neq 1$. Rejeita posições vazias com `EmptyPositionCorporateActionError`.

### 10.3. Bonificação (`BONUS`) — ADR-049

- **Regra**: Acrescenta as novas cotas bonificadas à custódia:
  $$\text{quantity}_{after} = \text{quantity}_{before} + \text{bonusQuantity}$$
- **Com Custo Atribuído (`assignedCost` informado)**:
  $$\text{totalCost}_{after} = \text{totalCost}_{before} + \text{assignedCost}$$
  $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
  Mantém `costBasisStatus: 'KNOWN'` (se a posição prévia já for `KNOWN`).
- **Sem Custo Atribuído (`assignedCost` ausente/indefinido)**:
  - O motor **NÃO** assume custo zero.
  - $\text{totalCost} \to \text{undefined}$, $\text{averageCost} \to \text{undefined}$, $\text{costBasisStatus} \to \text{'INCOMPLETE'}$.
- **Validações**: $\text{bonusQuantity} > 0$. Rejeita posições vazias com `EmptyPositionCorporateActionError`.

### 10.4. Amortização de Capital (`AMORTIZATION`) — ADR-050

- **Regra**: Quantidade permanece estritamente inalterada; o montante amortizado é subtraído do custo total carregado:
  $$\text{quantity}_{after} = \text{quantity}_{before}$$
  $$\text{totalCost}_{after} = \text{totalCost}_{before} - \text{amortizationAmount}$$
  $$\text{averageCost}_{after} = \frac{\text{totalCost}_{after}}{\text{quantity}_{after}}$$
- **Limite de Custo Carregado**: A amortização não pode exceder o custo total carregado ($\text{amortizationAmount} \le \text{totalCost}_{before}$). Se exceder, lança `AmortizationExceedsCostError`.
- **Fronteira de Custo Zero Conhecido**: Se o custo atingir exatamente zero, $\text{totalCost} = 0$, $\text{averageCost} = 0$ com `costBasisStatus: 'KNOWN'`. Custo zero conhecido é ontologicamente distinto de custo ausente (`INCOMPLETE`).
- **Posição Incompleta**: Lança `IncompleteAmortizationCostError` se a posição possuir custo `INCOMPLETE`.

### 10.5. Invariantes & Auditoria de Eventos Corporativos

1. **Zero Disposals**: Eventos corporativos nunca são alienações econômicas e **nunca** emitem registros em `realizedDisposals`.
2. **Trilha de Auditoria (`AppliedCorporateAction`)**: Registrados em `AccountState.appliedCorporateActions` e `PortfolioState.appliedCorporateActions` com o snapshot antes e depois das grandezas financeiras.
3. **Filtro Temporal `asOfDate`**: Eventos societários ocorridos estritamente após a data de corte `asOfDate` não afetam o estado reconstituído.
