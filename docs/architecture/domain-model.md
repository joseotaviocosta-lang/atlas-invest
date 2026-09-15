# Modelo de Domínio — Project Atlas (Fase 0B)

## 1. Visão Geral da Camada de Domínio

O pacote `@atlas/domain` é o núcleo isolado e agnóstico de frameworks do Project Atlas. Ele estabelece a linguagem ubíqua (Ubiquitous Language) financeira, garantindo invariantes de precisão, integridade de transações e ausência de dependências de infraestrutura, bancos de dados, frameworks de UI ou SDKs externos.

---

## 2. Primitivas Financeiras e Value Objects

Todos os Value Objects são **imutáveis** e têm sua igualdade determinada pelo **valor semântico**:

### 2.1. Estratégia Decimal (`decimal.js` Encapsulado)

- A precisão matemática é garantida pela biblioteca `decimal.js`, mantida estritamente interna ao domínio.
- Proibido qualquer cálculo financeiro ou monetário com tipos primitivos de ponto flutuante (`number` do JS).
- Entradas decimais canônicas são strings (ex.: `"31.074532"`).

### 2.2. `Money`

- Representa um valor monetário exato atrelado a uma moeda forte (`Currency`).
- **Currency Safety:** Operações aritméticas ou de comparação entre moedas distintas (`BRL` vs `USD`) lançam `CurrencyMismatchError`.
- Multiplicação e divisão são permitidas apenas por escalares decimais (ex.: `Money * Quantity`).
- Serialização JSON: `{"amount": "1234.56", "currency": "BRL"}`.

### 2.3. `Quantity`

- Representa quantidade exata de ativos ou cotas fracionárias.
- A primitiva suporta valores negativos em cálculos matemáticos abstratos, mas transações de compra/venda (`BUY`/`SELL`) exigem quantidades estritamente positivas.
- Serialização JSON: string decimal pura (ex.: `"123.456789"`).

### 2.4. `Currency`

- Tipo forte suportando inicialmente `BRL`, `USD` e `EUR`. Rejeita moedas não catalogadas.

### 2.5. `Percentage`

- Representa valores percentuais na escala `10% = Percentage.from("10")`.
- Método `toFraction()` retorna a fração decimal correspondente (`"0.1"`).
- Serialização JSON: `"10.25"`.

### 2.6. `LocalDate`

- Representa uma data civil/econômica de pregão no formato canônico `YYYY-MM-DD`.
- Desprovido de horário e imune a desvios de fuso horário (`America/Sao_Paulo`, UTC, etc.).
- Valida o calendário gregoriano real e anos bissextos (aceita `2024-02-29`, rejeita `2025-02-29` e `2026-02-30`).

---

## 3. Identificadores de Domínio (`DomainId`)

Branded types baseados em UUID v4 garantem segurança em tempo de compilação e execução:

- `UserId`
- `PortfolioId`
- `AccountId`
- `InstitutionId`
- `AssetId`
- `TransactionId`

O TypeScript impede passar acidentalmente um `AccountId` onde se espera um `AssetId`.

---

## 4. Entidades Principais

Identidade determinada estritamente pelo seu `DomainId`:

### 4.1. `Asset`

- Ativo financeiro cotado em mercado.
- Campos: `id`, `ticker` (normalizado em maiúsculas sem espaços), `name`, `type`, `currency`, `exchange`, `isin?`, `cnpj?`, `status?`.
- **Regra de Ouro:** `ticker != identity`. Dois ativos podem ter o mesmo ticker em bolsas diferentes (ex.: `ABC` na B3 e `ABC` na NYSE).

### 4.2. `Institution`

- Instituição custodiante, banco ou corretora.
- Campos: `id`, `name`, `type` (`BROKER`, `BANK`, `CUSTODIAN`, `OTHER`), `country` (código ISO, ex.: `BR`, `US`).

### 4.3. `Account`

- Conta de custódia vinculada a uma instituição e a uma carteira.
- Campos: `id`, `portfolioId`, `institutionId`, `name`, `currency`, `status` (`ACTIVE`, `INACTIVE`, `CLOSED`).

### 4.4. `Portfolio`

- Agregador de contas pertencente a um usuário.
- Campos: `id`, `userId`, `name`, `baseCurrency`, `type` (`PERSONAL`, `FAMILY`, `COMPANY`, `SIMULATION`), `status` (`ACTIVE`, `ARCHIVED`), `createdAt`, `updatedAt`.

---

## 5. Transaction Ledger (Source of Truth)

O histórico canônico de investimentos é composto exclusivamente por eventos imutáveis append-only:

```text
Transactions / Events
        ↓
Portfolio Engine
        ↓
Derived State (Position, average cost, realized gain, snapshots)
```

### 5.1. Discriminated Union de Transações

Para impossibilitar estados inválidos, a `Transaction` é modelada como uma discriminated union pelo campo `type`:

1. **`TradeTransaction` (`BUY`, `SELL`):** Exige `assetId`, `quantity > 0`, `unitPrice >= 0`, `currency`, `tradeDate`. Taxas (`fees`) e impostos retidos (`taxes`) opcionais com magnitude positiva.
2. **`IncomeTransaction` (`DIVIDEND`, `JCP`, `FII_INCOME`):** Exige `assetId`, `amount > 0`, `currency`, `tradeDate`.
3. **`SplitTransaction` (`SPLIT`, `REVERSE_SPLIT`):** Exige `assetId`, `factor > 0`, `tradeDate`. Não simula compra/venda.
4. **`BonusTransaction` (`BONUS`):** Exige `assetId`, `quantity > 0`, `tradeDate`.
5. **`SubscriptionTransaction` (`SUBSCRIPTION`):** Exige `assetId`, `quantity > 0`, `unitPrice >= 0`, `tradeDate`.
6. **`AmortizationTransaction` (`AMORTIZATION`):** Exige `assetId`, `amount > 0`, `tradeDate`.
7. **`TransferTransaction` (`TRANSFER_IN`, `TRANSFER_OUT`):** Exige `assetId`, `quantity > 0`, `tradeDate`.
8. **`CashMovementTransaction` (`DEPOSIT`, `WITHDRAWAL`):** Exige `amount > 0`, `currency`, `tradeDate`.
9. **`ExpenseTransaction` (`FEE`, `TAX`):** Exige `amount > 0` (magnitude sempre positiva, direção indicada pelo tipo), `currency`, `tradeDate`.

### 5.2. Metadados Comuns e Idempotência

Todas as transações possuem:

- `id`: `TransactionId`
- `portfolioId`: `PortfolioId`
- `accountId`: `AccountId`
- `type`: `TransactionType`
- `source`: `TransactionSource` (`MANUAL`, `CSV`, `BROKER_NOTE`, `B3`, `OPEN_FINANCE`, `BROKER_API`, `SYSTEM`)
- `tradeDate`: `LocalDate`
- `settlementDate?`: `LocalDate`
- `currency`: `Currency`
- `provider?`: string de identificação do provedor de origem (idempotência)
- `externalId?`: id externo único no provedor (idempotência)
- `notes?`: notas do investidor
- `createdAt`: timestamp técnico de auditoria

---

## 6. Hierarquia de Erros de Domínio

Erros estruturados que herdam de `DomainError` com códigos padronizados:

- `InvalidMoneyError` (`DOMAIN.INVALID_MONEY`)
- `CurrencyMismatchError` (`DOMAIN.CURRENCY_MISMATCH`)
- `DivisionByZeroError` (`DOMAIN.DIVISION_BY_ZERO`)
- `InvalidQuantityError` (`DOMAIN.INVALID_QUANTITY`)
- `InvalidLocalDateError` (`DOMAIN.INVALID_LOCAL_DATE`)
- `InvalidDomainIdError` (`DOMAIN.INVALID_DOMAIN_ID`)
- `InvalidEntityError` (`DOMAIN.INVALID_ENTITY`)
- `InvalidTransactionError` (`DOMAIN.INVALID_TRANSACTION`)

---

## 7. Limites Arquiteturais entre Motores (Engines)

- `tax-engine` **NUNCA** depende de `ai-engine` ou de `UI`.
- `portfolio-engine` **NUNCA** depende de `UI` ou `React`.
- `domain` é estritamente puro TypeScript (zero frameworks, zero ORMs).
