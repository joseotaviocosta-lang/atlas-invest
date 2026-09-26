# ADR-218: Temporal Scope Semantics and Economic Dates

## Status

Aceito (Fase 3X)

## Contexto

Dúvidas temporais dos investidores ("O que comprei em setembro?", "Qual foi meu último dividendo?") dependem de uma delimitação de datas econômica estrita. Modelos de IA são notórios por errar contas de calendário, confundir fusos horários e misturar eventos de anos distintos.

## Decisão

1. **Datas Econômicas Civis (`LocalDate`):**
   - Toda filtragem de eventos utiliza datas econômicas de negociação (`tradeDate`, `YYYY-MM-DD`). Timestamps técnicos (`createdAt`) nunca determinam o pertencimento temporal de uma operação.
2. **Escopo Explícito por Mensagem:**
   - O intervalo `[from, to]` é passado explicitamente pelo cliente a cada mensagem através do objeto de escopo (`TIMELINE` ou `ASSET_TIMELINE`).
   - A IA nunca infere ou expande o intervalo de datas silenciosamente.
3. **Validação Rigorosa de Calendário:**
   - Datas inexistentes no calendário gregoriano (ex: 29 de fevereiro em ano não-bissexto) falham imediatamente com 400 (`PORTFOLIO.INVALID_HISTORY_FILTER`).
   - Inversões onde `from > to` falham com 400 (`PORTFOLIO.INVALID_DATE_RANGE`).
   - O intervalo máximo permitido é de 366 dias civis (`MAX_TIMELINE_RANGE_DAYS = 366`).

## Consequências

- Imunidade a fusos horários e offsets de UTC.
- Delimitação exata e auditável das operações compreendidas em cada resposta.

