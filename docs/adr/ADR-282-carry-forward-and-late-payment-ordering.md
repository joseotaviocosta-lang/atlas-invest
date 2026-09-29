# ADR-282: Ordenação entre Carry-Forward e Atraso

## Status

Aceito (Fase 4E)

## Contexto

Era preciso resolver oficialmente se um valor abaixo do mínimo, validamente
adiado, sofre multa/juros e qual vencimento rege o montante acumulado.

## Decisão

1. **Vencimento do Último Período:** o texto legal determina que o acumulado é
   pago "no prazo estabelecido na legislação para este último período de
   apuração". Logo, o vencimento do montante agregado é o vencimento da
   competência-alvo (a última).

2. **Sem Acréscimo Durante o Adiamento:** enquanto validamente abaixo do mínimo,
   o valor adiado **não** acumula multa/juros; a obrigação de recolhimento só se
   vence no último prazo. Não há dupla penalização.

3. **Combinação pelo Valor Bruto:** o valor da competência corrente é combinado
   **bruto** (sem ajuste de atraso), pois valores validamente adiados não são
   atrasados.

4. **Atraso do Conjunto Falha Fechado:** se o pagamento do montante agregado
   ocorrer após o vencimento da última competência, seria necessário acréscimo
   legal (4D) sobre o total agregado. Como a autoridade oficial de multa do
   Sicalc é indexada ao valor principal e não existe snapshot para o montante
   agregado, a fase falha fechado
   (`TAX_PAYMENT_AGGREGATION.LATE_ADJUSTMENT_UNAVAILABLE`).

5. **Sem Calendário Genérico:** nenhuma reconstrução de dia útil é feita; o
   vencimento vem do registro oficial direto (4C).

## Consequências

- A interação é determinística e auditável para o caso não-atrasado.
- O caso atrasado é explicitamente indisponível, nunca estimado.
