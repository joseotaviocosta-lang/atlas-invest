# Contrato: TaxLossBalance v1 (Fase 4B)

Saldo de prejuízo compensável, derivado e reconstruível (ADR-243).

## Identidade

`TaxSubjectId + TaxCategory + currency` (+ competência de fechamento).

## Estrutura

```
{ category, currency, amount: Money, competence, provenance: 'REPLAY' | 'MANUAL' | 'ZERO_AT_INCEPTION' }
```

## Regras

1. **Categoria isolada:** prejuízo de A nunca compensa B, salvo regra verificada
   explícita (`lossCompensation.crossCategoryAllowed`). Não implementado em 4B.
2. **Progressão determinística:** o saldo de abertura do mês N+1 é exatamente o
   saldo de fechamento do mês N (replay desde o início do histórico).
3. **Desconhecido ≠ zero:** se o histórico anterior não puder ser estabelecido
   (`openingLossState = UNKNOWN`), qualquer ganho positivo torna o resultado
   `PARTIAL` com `UNKNOWN_OPENING_LOSS_BALANCE`; nunca assume zero.
4. **Zero no início:** `amount = 0` é permitido quando o histórico é completo
   (início do livro-razão) ou há confirmação manual.
5. **Conservação:** `closing = opening - lossApplied + lossGenerated`, exato.
6. **Sem prejuízo negativo** e sem base negativa.
