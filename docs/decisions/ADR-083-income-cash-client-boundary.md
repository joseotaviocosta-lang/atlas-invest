# ADR-083: Income & Cash Flow Client Boundary

**Status:** Accepted  
**Date:** 2026-09-18  
**Phase:** Fase 2D — Income & Cash Flow Views  
**Related:** ADR-062, ADR-073, ADR-077, ADR-080

---

## 1. Context

As visões de rendimentos e fluxos de caixa implementadas na Fase 2D precisam definir com precisão a fronteira entre o servidor (API/Engine) e o cliente (Web/Mobile). Esta ADR estabelece essa fronteira.

## 2. Decision

### 2.1. Servidor = Fonte de Todos os Dados Financeiros

O servidor (`Portfolio Read API v1`) é responsável por:

- Fornecer `incomeSummaries` (`Map<Currency, IncomeSummary>`)
- Fornecer `cashFlowSummaries` (`Map<Currency, CashFlowSummary>`)
- Fornecer `incomeEvents` e `cashFlowEvents` paginados via `GET /history`
- Agregar, filtrar e calcular todos os valores financeiros
- Fornecer direção (`direction`) para eventos de caixa
- Fornecer totais por moeda segregados

### 2.2. Cliente = Apresentação Pura

O cliente (Web/Mobile) é responsável por:

- Formatar valores usando `formatCurrency`, `formatQuantity`, `formatDate`
- Agrupar itens por data civil para exibição
- Mapear labels canônicos para exibição
- Preparar seções de apresentação
- Gerenciar paginação via cursor opaco
- Aplicar filtros e encaminhar para a API
- Gerenciar estados visuais (loading, error, empty)

### 2.3. Proibições no Cliente

O cliente **NUNCA** pode:

- Somar, subtrair ou agregar valores monetários
- Calcular totais de rendimentos ou fluxos de caixa
- Calcular `netExternalFlow`
- Calcular médias ou percentuais financeiros
- Converter moedas
- Inferir direção de fluxo sem o campo `direction` da API
- Reconstruir summaries a partir de itens brutos
- Calcular `totalIncome`, `totalOutflows`, ou qualquer subtotal

### 2.4. Proteção Arquitetural

View models de rendimentos e fluxos de caixa:

1. Recebem `historyItems` e `summaryCards` do servidor
2. Mapeiam para apresentação sem cálculos financeiros
3. São testados para garantir zero cálculo financeiro client-side

## 3. Consequences

### 3.1. Para Testes

Testes unitários verificam:

- View models não realizam cálculos financeiros
- Summaries são consumidas do servidor
- Multi-currency segregation é preservada
- TAX sempre é "Tributo pago" nunca "Imposto devido"
- AMORTIZATION nunca é classificado como rendimento

### 3.2. Para o Portfolio Engine

Nenhuma alteração. O contrato do Portfolio Engine 1.0.0-rc.1 permanece congelado.

### 3.3. Para o Portfolio Read API v1

Nenhuma alteração. Os contratos congelados permanecem válidos.

## 4. References

- ADR-062 (Fronteira Estrita e Não-Vazamento de Domínio)
- ADR-073 (Client View Model Boundary)
- ADR-077 (Zero Client Financial Math)
- ADR-080 (Terminologia Canônica e Conformidade Fiscal)
- Portfolio Read API v1 Contract Freeze
