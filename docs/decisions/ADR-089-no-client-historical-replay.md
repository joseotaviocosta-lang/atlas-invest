# ADR-089: No Client-Side Historical Replay

**Status:** Accepted  
**Date:** 2026-09-19  
**Phase:** Fase 2F — Historical As-Of UX & Portfolio Time Travel  
**Related:** ADR-004, ADR-036, ADR-062, ADR-077, ADR-087

---

## 1. Context

Com o modo histórico na interface, surge a tentação de "otimizar" filtrando transações localmente ou recomputando custos a partir do estado atual. Isso quebraria ordering canônico, corte inclusivo, semânticas cross-date de transferências e corporate actions.

## 2. Decision

O cliente **NUNCA** pode, para derivar estado histórico:

- Filtrar o ledger de transações por data (`tradeDate <= asOf` local).
- Reexecutar preço médio, quantidades, custos ou ganhos realizados.
- Reconstruir posições a partir do histórico de eventos (`/history` lista eventos; não é snapshot).
- Importar o replay do Portfolio Engine (`@atlas/portfolio-engine`) em código de UI.
- Somar/dividir valores para derivar totais, médias ou percentuais históricos.

O cliente **SOMENTE** pode:

- Enviar `asOf` (civil `YYYY-MM-DD` validado) a `GET /state` (e `GET /positions`).
- Apresentar o read model retornado com os mappers existentes.
- Fiscalizado por `tests/architecture/no-client-historical-replay.test.ts`, que varre os arquivos de apresentação da Fase 2F atrás de padrões proibidos (filtro de ledger por data, reduce de quantidades, divisão de custo, `replayPortfolio`, import de engine em UI).

## 3. Consequences

### 3.1. Para Testes

O guard arquitetural falha o CI se qualquer padrão proibido for introduzido nos arquivos escopados. Transferências cross-date, splits e vendas parciais/totais continuam cobertos pelo replay do servidor (suítes as-of do engine).

### 3.2. Para o Portfolio Engine

Nenhuma alteração. O contrato do Portfolio Engine 1.0.0-rc.1 permanece congelado.

### 3.3. Para o Portfolio Read API v1

Nenhuma alteração. Os contratos congelados permanecem válidos.

## 4. References

- ADR-004 (Ledger Source of Truth)
- ADR-036 (Portfolio Ledger Replay)
- ADR-062 (Read Model Boundary)
- ADR-077 (Zero Client Financial Math)
- ADR-087 (Historical As-Of UX)
