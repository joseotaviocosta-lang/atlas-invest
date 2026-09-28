# ADR-239: Qualidade de Dados Fiscal com Falha Fechada

## Status

Aceito (Fase 4A)

## Contexto

Dados fiscais incompletos (custo de aquisição desconhecido, categoria de ativo não
classificada, moeda não suportada, conjunto de regras ausente) não podem ser tratados como
zero. Tratar desconhecido como zero fabrica resultado tributário incorreto — o modo de
falha mais perigoso para o investidor.

## Decisão

1.  **Issue Explícita:** Problemas de completude são explícitos por enum:
    `UNKNOWN_COST_BASIS`, `UNKNOWN_ASSET_TAX_CATEGORY`, `UNSUPPORTED_CURRENCY`,
    `MISSING_RULE_SET`, `INCOMPLETE_HISTORY`, `MISSING_PROCEEDS`. Apenas issues
    efetivamente aplicáveis são emitidas.

2.  **Status:** O estado mensal pode ser `EMPTY`, `COMPLETE`, `PARTIAL` ou `BLOCKED`.
    `EMPTY` (sem eventos) é distinto de desconhecido/bloqueado. `EMPTY` pode ser um zero
    válido; desconhecido nunca é zero.

3.  **Desconhecido ≠ Zero:** Custo de aquisição desconhecido nunca vira zero. Venda sem base
    de custo canônica não produz ganho fabricado. A categoria `UNKNOWN` nunca recebe
    tratamento de equity.

4.  **Falha Fechada:** Ausência de conjunto de regras vigente bloqueia a apuração
    (`BLOCKED`). Uma categoria indisponível não invalida categorias independentes, mas o
    status total é explicitamente `PARTIAL`.

5.  **Sem Total Parcial Enganoso:** Quando a base é parcial, totais derivados (p.ex.
    ganho realizado) são omitidos (`null`) em vez de somados parcialmente.

6.  **Moedas Não Mescladas:** Moedas distintas não são somadas implicitamente (sem FX).
    `USD` é marcado `UNSUPPORTED_CURRENCY` na fundação 4A.

## Consequências

- O usuário entende por que um cálculo não pode prosseguir.
- Nenhum valor fiscal enganoso é exibido.
- A Fase 4B herda as mesmas garantias de falha fechada.
