# ADR-084: Accounts Overview & Account Detail Presentation Boundary

**Status:** Accepted  
**Date:** 2026-09-19  
**Phase:** Fase 2E — Multi-Account UX (Accounts Overview & Account Detail)  
**Related:** ADR-062, ADR-073, ADR-077, ADR-078, ADR-080

---

## 1. Context

A Fase 2E introduz as visões de contas de custódia (overview de contas e detalhe por conta) na Web e no Mobile, consumindo exclusivamente o Portfolio Engine 1.0 Release Candidate (`1.0.0-rc.1`) e a Portfolio Read API v1 congelada. É preciso fixar a identidade canônica da conta, a fronteira cliente/servidor e as garantias de segurança da navegação.

## 2. Decision

### 2.1. Identidade Canônica: `accountId`

A identidade canônica de uma conta de custódia é **sempre** o `accountId`:

- Listas, filtros (`accountId`), deep-links e chaves de cache usam `accountId`.
- A instituição é **metadado de exibição apenas** (`GET /api/v1/institutions`): nome para rótulos, nunca identidade, nunca lógica.
- Conta ausente do diretório da carteira (`found: false`) renderiza estado "não encontrada" sem vazar dados — nunca inventa conta fantasma.

### 2.2. Visões de Conta São Projeções Derivadas

Overview e detalhe são projeções derivadas do read model congelado (`GET /state`: `positions` + `accounts[]`) combinado com metadados de diretório (`GET /accounts`, `GET /institutions`, catálogo de ativos para tickers):

- Nenhum endpoint novo de conta. Nenhum ledger independente de conta.
- Filtros por conta (`accountId` em `/history`) continuam server-side; o cliente só encaminha o parâmetro.
- Navegação para detalhe de ativo só quando o ativo tem posição aberta no estado (`quantity > 0`, ADR-078).

### 2.3. Cliente = Apresentação Pura

O cliente (Web/Mobile) pode:

- Formatar valores com `formatCurrency`, `formatQuantity`, `formatDate`.
- Contar posições abertas estruturalmente (`openPositionsCount`) — contagem, nunca soma monetária.
- Agrupar/ordenar deterministicamente (contas por nome, posições por ticker).
- Rotular status (`ACTIVE` → "Ativa", `INACTIVE` → "Inativa", `CLOSED` → "Encerrada").
- Renderizar custo incompleto como `—` com badge não alarmista.

O cliente **NUNCA** pode:

- Somar, dividir ou agregar valores monetários por conta.
- Calcular percentuais de alocação ou participação por conta.
- Calcular preço médio, custo total, rentabilidade ou saldos de caixa.
- Converter moedas ou totalizar entre moedas (segregação `BRL`/`USD` preservada).
- Agregar proventos ou fluxos no cliente (summaries são do servidor).

### 2.4. Anti-Escopo Estatuário

Mantidas as proibições: cotações, valor de mercado, P&L não realizado, TWR/XIRR, DARF/IRPF, FX, saldo de caixa e sincronização com corretoras.

## 3. Consequences

### 3.1. Para Testes

Cobertura em `tests/ui/portfolio-accounts-view-model.test.ts`, `tests/web/accounts.test.ts` e `tests/mobile/accounts.test.ts`: identidade por `accountId`, metadado de instituição degradando para `null`, `—` para custo incompleto, `found: false` para contas estranhas, isolamento de cache por carteira.

### 3.2. Para o Portfolio Engine

Nenhuma alteração. O contrato do Portfolio Engine 1.0.0-rc.1 permanece congelado.

### 3.3. Para o Portfolio Read API v1

Nenhuma alteração. Os contratos congelados permanecem válidos.

## 4. References

- ADR-062 (Fronteira Estrita e Não-Vazamento de Domínio)
- ADR-073 (Client View Model Boundary)
- ADR-077 (Zero Client Financial Math)
- ADR-078 (Closed Position Safety / Navegação Segura)
- ADR-080 (Terminologia Canônica e Conformidade Fiscal)
- Portfolio Read API v1 Contract Freeze
