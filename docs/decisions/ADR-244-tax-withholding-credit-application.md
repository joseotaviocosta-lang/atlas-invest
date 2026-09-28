# ADR-244: Aplicação de Crédito de Retenção na Fonte

## Status

Aceito (Fase 4B)

## Contexto

Retenções na fonte podem reduzir o imposto devido, mas apenas se originadas de
dado canônico. Estimar retenções introduziria valores fictícios.

## Decisão

1. `TaxWithholdingCredit` deriva exclusivamente de `FiscalEvent` ou campo fiscal
   importado canônico.
2. A identidade de categoria/moeda é preservada; não há agrupamento global sem
   regra verificada.
3. `withholdingApplied = min(disponível, taxBeforeWithholding)`.
4. `taxDue = max(0, taxBeforeWithholding − withholdingApplied)`; nunca negativo.
5. Excesso de crédito não gera carryforward inventado.
6. Se a regra exige retenção e não há crédito canônico → `PARTIAL`
   (`MISSING_REQUIRED_WITHHOLDING`).
7. O livro-razão atual não contém retenção canônica de corretora; portanto
   `withholdingSupported = false` e nada é estimado.

## Consequências

- Nenhuma retenção fictícia.
- Cálculo honesto mesmo com dados ausentes (falha fechada).
