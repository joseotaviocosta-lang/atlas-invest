# ADR-081: Income View Semantics

**Status:** Accepted  
**Date:** 2026-09-18  
**Phase:** Fase 2D — Income & Cash Flow Views  
**Related:** ADR-052, ADR-073, ADR-077

---

## 1. Context

A Fase 2D introduz uma visão dedicada a rendimentos dentro da área Carteira. É necessário definir semanticamente quais tipos de evento constituem "rendimentos" e como são apresentados ao usuário.

## 2. Decision

### 2.1. Definição de Investimento/Renda Operacional

Os seguintes tipos de transação do ledger são classificados como **rendimentos de investimento**:

| Tipo         | Label Canônico    | Categoria         |
| :----------- | :---------------- | :---------------- |
| `DIVIDEND`   | Dividendo         | Investment Income |
| `JCP`        | JCP               | Investment Income |
| `FII_INCOME` | Rendimento de FII | Investment Income |

Estes eventos são classificados no read model como `IncomeEvent` e aparecem no `incomeSummary` por moeda (`Map<Currency, IncomeSummary>`).

### 2.2. Semântica de Resumo

Os cards de resumo de rendimentos consomem exclusivamente o `incomeSummaries` fornecido pelo servidor (`GET /api/v1/portfolios/:portfolioId/state`). O cliente **nunca** soma ou agrega valores financeiros.

### 2.3. Segregação Multimoeda

Rendimentos em moedas distintas (BRL, USD) são apresentados em blocos separados. Não há conversão cambial implícita nem consolidação cruzada.

### 2.4. Classificação Fiscal Ausente

Esta visão **não** classifica rendimentos para fins fiscais. Não há cálculo de DARF, isenção de R$ 20.000, ou alíquotas. Toda classificação fiscal pertence ao futuro Tax Engine.

### 2.5. Proibições Estritas

- **PROIBIDO** classificar `DEPOSIT` como rendimento.
- **PROIBIDO** classificar `WITHDRAWAL` como prejuízo.
- **PROIBIDO** classificar `AMORTIZATION` como dividendo.
- **PROIBIDO** classificar `TAX` como imposto devido.
- **PROIBIDO** calcular totais de rendimentos no cliente.

## 3. Consequences

### 3.1. Para o Cliente Web

A rota `/portfolio/income` consome:

1. `GET /api/v1/portfolios/:portfolioId/state` para summaries
2. `GET /api/v1/portfolios/:portfolioId/history?type=income` para itens paginados

### 3.2. Para o Cliente Mobile

A rota `/(app)/portfolio/income` segue o mesmo padrão.

### 3.3. Para o Portfolio Engine

Nenhuma alteração. O Portfolio Engine permanece em `1.0.0-rc.1`.

## 4. References

- ADR-052 (Proventos não alteram custódia)
- ADR-073 (Client View Model Boundary)
- ADR-077 (Zero Client Financial Math)
- Portfolio Engine 1.0.0-rc.1 Contract Freeze
