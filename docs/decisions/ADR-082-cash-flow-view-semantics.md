# ADR-082: Cash Flow View Semantics

**Status:** Accepted  
**Date:** 2026-09-18  
**Phase:** Fase 2D — Income & Cash Flow Views  
**Related:** ADR-053, ADR-055, ADR-056, ADR-073, ADR-077

---

## 1. Context

A Fase 2D introduz uma visão dedicada a movimentações de caixa dentro da área Carteira. É necessário distinguir fluxos de caixa de rendimentos e definir a terminologia correta para cada tipo.

## 2. Decision

### 2.1. Definição de Movimentações de Caixa

Os seguintes tipos de transação do ledger são classificados como **fluxos de caixa**:

| Tipo           | Label Canônico | Direção | Categoria             |
| :------------- | :------------- | :------ | :-------------------- |
| `DEPOSIT`      | Depósito       | INFLOW  | EXTERNAL_CONTRIBUTION |
| `WITHDRAWAL`   | Retirada       | OUTFLOW | EXTERNAL_WITHDRAWAL   |
| `FEE`          | Taxa           | OUTFLOW | OPERATIONAL_EXPENSE   |
| `TAX`          | Tributo pago   | OUTFLOW | TAX_PAYMENT           |
| `AMORTIZATION` | Amortização    | INFLOW  | CAPITAL_RETURN        |

### 2.2. Terminologia Estrita

- **TAX** → **"Tributo pago"** (ou "Pagamento de tributo")
  - **NUNCA** "Imposto devido"
  - Representa um evento de pagamento registrado no ledger
  - Não representa apuração fiscal (DARF, IRPF)
- **AMORTIZATION** → **"Amortização"** com subtítulo **"Devolução de capital"**
  - **NUNCA** classificado como dividendo ou rendimento
  - Representa devolução de principal (CAPITAL_RETURN)
- **DEPOSIT** → **"Depósito"**
  - **NUNCA** classificado como rendimento
  - Aporte externo de recursos
- **WITHDRAWAL** → **"Retirada"**
  - **NUNCA** classificado como prejuízo
  - Resgate externo de recursos
- **FEE** → **"Taxa"**
  - Encargo operacional avulso

### 2.3. Semântica de Resumo

Os cards de resumo de fluxos de caixa consomem exclusivamente o `cashFlowSummaries` fornecido pelo servidor (`GET /api/v1/portfolios/:portfolioId/state`).

### 2.4. Proibições Estritas

- **PROIBIDO** mostrar saldo de caixa ("Saldo disponível", "Saldo da corretora")
- **PROIBIDO** calcular fluxo líquido no cliente
- **PROIBIDO** somar depósitos e retiradas como "movimentação total"
- **PROIBIDO** inferir direção com matemática própria (se `direction` vem da API, use-o)
- **PROIBIDO** classificar `netExternalFlow` sem que venha do read model oficial

### 2.5. AMORTIZATION como CAPITAL_RETURN

A amortização é apresentada como devolução de capital, não como rendimento. Ela compõe `totalCapitalReturns` no `CashFlowSummary`, sem distorcer `netExternalFlow`.

## 3. Consequences

### 3.1. Para o Cliente Web

A rota `/portfolio/cash-flow` consome:

1. `GET /api/v1/portfolios/:portfolioId/state` para summaries
2. `GET /api/v1/portfolios/:portfolioId/history?type=cash-flow` para itens paginados

### 3.2. Para o Cliente Mobile

A rota `/(app)/portfolio/cash-flow` segue o mesmo padrão.

## 4. References

- ADR-053 (Fluxos externos não são performance)
- ADR-055 (Despesas avulsas e proibição de casamento heurístico)
- ADR-056 (Amortização possui dupla dimensão econômica)
- ADR-073 (Client View Model Boundary)
- ADR-077 (Zero Client Financial Math)
