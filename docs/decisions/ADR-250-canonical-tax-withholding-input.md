# ADR-250: Input Canônico de Retenção/IRRF

## Status

Aceito (Fase 4B.2)

## Contexto

Regras fiscais podem usar retenção/IRRF como crédito. Estimar retenção
introduziria valores fictícios.

## Decisão

1. `TaxWithholdingInput` representa retenção com valor decimal exato, moeda
   explícita e proveniência.
2. Nunca estimado; `UNKNOWN` não carrega valor.
3. Somente `CONFIRMED` poderá ser consumido por regra de produção (fase futura).
4. Entrada manual exige proveniência e não sobrescreve importado silenciosamente.
5. Mesma origem importada não duplica crédito (unicidade por origem).
6. Adicionar input **não** ativa regra tributária.

## Consequências

- Nenhuma retenção fictícia.
- Crédito rastreável e auditável.
