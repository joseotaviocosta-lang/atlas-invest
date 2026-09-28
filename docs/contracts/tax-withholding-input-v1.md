# Contrato: TaxWithholdingInput v1 (Fase 4B.2)

Input canônico de retenção/IRRF. Exato, explícito e rastreável (ADR-250). Nunca
estimado.

## Estrutura

```
{
  id, taxSubjectId?, sourceReference, sourceType,
  economicDate, competence, category, currency,
  amount?, status, provenance
}
```

## Status

`CONFIRMED | UNVERIFIED | UNKNOWN`

Somente `CONFIRMED` poderá ser consumido por regra de produção (fase futura).

## Regras

1. `amount` é decimal exato (`Money`); obrigatório exceto quando `status = UNKNOWN`.
2. `UNKNOWN` **não** carrega valor (nunca fabricar).
3. `currency` é explícita; deve coincidir com a moeda do `amount`. Sem presunção de BRL.
4. `amount` nunca negativo.
5. Toda entrada carrega `provenance` (`source`, `sourceReference`).
6. Entrada manual exige `MANUAL` + confirmação; não sobrescreve valor importado silenciosamente.
7. Mesma origem importada duas vezes não duplica crédito (unicidade por `sourceReference` — persistência).
8. Adicionar input **não** ativa regra tributária nem produção.
