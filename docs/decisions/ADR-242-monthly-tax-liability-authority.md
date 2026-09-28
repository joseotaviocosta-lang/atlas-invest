# ADR-242: Autoridade da Responsabilidade Tributária Mensal

## Status

Aceito (Fase 4B)

## Contexto

A Fase 4A estabeleceu fatos fiscais normalizados e estado mensal, sem calcular
imposto. A Fase 4B introduz cálculo de responsabilidade mensal. É preciso manter
uma autoridade única e determinística.

## Decisão

1. `MonthlyTaxLiability` é calculada exclusivamente por `@atlas/tax-engine`.
2. A cadeia de autoridade é: Livro-razão imutável → fatos canônicos do Portfolio
   Engine → projeção de eventos fiscais (4A) → estado mensal (4A) → resolução de
   regra efetiva (4B) → cálculo (4B) → `MonthlyTaxLiability`.
3. Web, mobile, controllers, IA, renderer, market intelligence e analytics
   **nunca** calculam imposto.
4. A camada de aplicação apenas carrega insumos e serializa o resultado.

## Consequências

- Uma única implementação auditável e determinística.
- Nenhuma aritmética fiscal fora do motor.
