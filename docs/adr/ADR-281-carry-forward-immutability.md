# ADR-281: Imutabilidade do Carry-Forward

## Status

Aceito (Fase 4E)

## Contexto

Valores adiados são fatos econômicos passados. Permitir sobrescrita, deleção ou
consumo duplicado corromperia a trilha de auditoria e poderia extinguir
obrigações indevidamente.

## Decisão

1. **Fato Imutável:** `TaxCarryForwardEntry` nunca é reescrito nem apagado.
   Correções geram nova versão marcando a anterior `SUPERSEDED`.

2. **Identidade Idempotente:** unicidade por
   `(sourceObligationId, ruleId, ruleVersion)`; re-materialização é _duplicate_
   idempotente, sem duplicar linhas.

3. **Consumo Exatamente-Uma-Vez:** apenas entradas `OPEN` participam; o consumo
   é atômico e all-or-nothing, marcando `CONSUMED` +
   `consumedByAggregationId` + `consumedAt`. Entrada consumida jamais é
   consumida de novo.

4. **Concorrência Segura:** a atualização condicionada ao status `OPEN` garante
   que requisições simultâneas não consumam a mesma entrada duas vezes; um
   segundo consumo é reconhecido como `ALREADY_CONSUMED`.

5. **Sem Deleção:** não existe operação de delete para entradas de carry-forward
   ou agregações.

## Consequências

- Reprocessamento e re-materialização são seguros e determinísticos.
- A trilha de auditoria é preservada integralmente.
