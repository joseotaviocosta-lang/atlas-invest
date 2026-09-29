# ADR-264: TaxObligation vs MonthlyTaxLiability

## Status

Aceito (Fase 4C.2)

## Contexto

Misturar cálculo tributário com estado operacional (vencimento, pagamento)
criaria acoplamento e risco de recálculo.

## Decisão

1. `MonthlyTaxLiability` é a **verdade de cálculo** (produzida apenas por
   `@atlas/tax-engine`).
2. `FederalTaxDeadlineRegistry` é a **autoridade de vencimento**.
3. `TaxObligation` é **estado operacional derivado** de ambos; nunca recalcula
   imposto.
4. O fingerprint da responsabilidade (`liabilityFingerprint`) é determinístico
   sobre sujeito + competência + versão de regra + inputs canônicos + valores
   resultantes.
5. Um `TaxObligation` só se torna pagável a partir de `COMPLETE` positiva.

## Consequências

- Fronteira nítida: cálculo, prazo e operação são camadas separadas.
- Nenhuma matemática tributária na camada operacional ou na UI.
