# Contrato: TaxPaymentAdjustmentTrace v1 (Fase 4D.2)

Trilha determinística que torna cada componente reproduzível e auditável.

## Estrutura

```
trace: [
  { stage, detail, values?: Record<string,string> }
]
```

Estágios: `INPUT`, `TIMELINESS`, `LATE_FEE`, `INTEREST`, `TOTAL`.

## Regras

1. `LATE_FEE` expõe início (dia útil oficial), dias, percentual, valor bruto,
   valor arredondado, valor/percentual oficial.
2. `INTEREST` expõe meses SELIC, taxas, percentual, bruto e arredondado.
3. `TOTAL` expõe principal, multa, juros e valor atualizado.
4. Sem PII (nenhum CPF). Sem valores em ponto flutuante.
