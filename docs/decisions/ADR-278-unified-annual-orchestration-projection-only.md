# ADR-278 (4J1-A): Unified Annual IRPF Orchestration is Projection-Only

## Status

Aceito (Fase 4J.1)

## Contexto

As Fases 4H (IRPF anual geral) e 4I (tributação mínima de alta renda, IRPFM)
já produzem resultados derivados autoritativos. A camada anual unificada precisa
responder quais módulos se aplicam, estão prontos ou bloqueados, quais evidências
faltam e se o pacote está pronto para revisão — sem reabrir semântica fiscal.

## Decisão

1. A camada anual unificada (`UnifiedAnnualIrpfState`) é uma **projeção de
   orquestração**, nunca um motor independente nem fonte da verdade.
2. O fluxo autoritativo é estritamente
   `ledger → motores fiscais canônicos → resultados derivados 4H/4I →
orquestração anual unificada → UX de revisão`; nunca `ledger → cálculo 4J`.
3. Não há cálculo tributário (ganho de capital, preço médio, imposto mensal,
   resultado anual de mercado, dividendos, JCP, FII, limiar/alíquota de alta
   renda, redutor corporativo, créditos), nenhum terceiro motor, nenhuma
   recomputação entre módulos e nenhuma persistência de resultado derivado.
4. Nenhuma migration nova é introduzida: a camada não persiste nada.

## Consequências

- A projeção é pura e exaustivamente testável; a semântica fiscal permanece
  congelada em 4H/4I.
- `READY_FOR_REVIEW` significa pronto para revisão por contador/usuário — nunca
  declarado, transmitido ou pago.
