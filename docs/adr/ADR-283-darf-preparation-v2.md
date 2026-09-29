# ADR-283: DarfPreparationV2

## Status

Aceito (Fase 4E)

## Contexto

O `DarfPreparationV1` (Fase 4C.2) é congelado e não representa valor acumulado
de períodos anteriores nem a elegibilidade de mínimo. Era necessário expor esses
dados sem quebrar o contrato existente.

## Decisão

1. **Aditivo, Não Destrutivo:** `DarfPreparationV2` é um novo read model; V1
   permanece intacto e congelado.

2. **Campos:** `revenueCode`, `targetCompetence`, `currentPrincipal`,
   `carryForwardAmount`, `totalPayable`, `minimumThreshold`, `dueDate`,
   `eligibilityStatus`, `lateFee`, `interest`, `officialUpdatedAmount`.

3. **Acréscimos Legais Nulos:** `lateFee`/`interest`/`officialUpdatedAmount`
   permanecem `null` na Fase 4E (exigem data de pagamento explícita e autoridade
   oficial — ver ADR-282).

4. **Sem Documento Oficial:** nenhum código de barras, QR, PIX, linha digitável
   ou número de documento; nenhuma geração de arquivo oficial.

5. **Sem Cálculo no Cliente:** apenas formatação de strings decimais exatas.

## Consequências

- A UI distingue "imposto apurado", "valor acumulado" e "valor a pagar" sem
  matemática financeira no cliente.
- O contrato V1 permanece estável para consumidores existentes.
