# ADR-297: Estados Terminais de Fronteira de Ano para Crédito de IRRF

## Status

Aceito (Fase 4G.2B)

## Contexto

O crédito de IRRF não utilizado compensa meses subsequentes. Ao fim do ano
civil, o saldo residual não pode desaparecer silenciosamente nem ser transportado
automaticamente para janeiro.

## Decisão

1. Em **dezembro**, o saldo residual de cada categoria é **terminal**:
   - normal → `AVAILABLE_FOR_ANNUAL_ADJUSTMENT`;
   - day trade → `AVAILABLE_FOR_RESTITUTION`.
2. **Não há carry automático para janeiro**: `irrfOpening(janeiro) = 0`.
3. Ajuste anual e restituição **não** são implementados nesta fase; apenas o
   estado terminal é representado.
4. O replay reinicia os pools ao mudar o ano civil.

## Consequências

- Fronteira de ano explícita e testável.
- Nenhum crédito reaproveitado indevidamente no ano seguinte.
