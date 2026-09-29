# ADR-265: DARF Readiness vs Geração de DARF

## Status

Aceito (Fase 4C.2)

## Contexto

Gerar um documento oficial de arrecadação (DARF) é responsabilidade da Receita
Federal. O Atlas pode preparar dados, mas não emitir o documento.

## Decisão

1. `DarfReadiness` indica apenas se os **dados** estão prontos
   (`READY | PARTIAL | BLOCKED | NOT_REQUIRED`).
2. `READY` exige responsabilidade `COMPLETE` positiva + `revenueCode` verificado
   - `dueDate` oficial `VERIFIED`.
3. A UI pode exibir "Dados para pagamento prontos"; **nunca** "DARF oficial
   gerado".
4. Nenhum código de barras, QR, PIX, linha digitável ou número de documento é
   produzido.
5. `DarfPreparationV1` contém apenas dados estruturados de preparação.

## Consequências

- Honestidade visual; nenhuma simulação de documento oficial.
- Geração oficial de DARF permanece fora do escopo.
