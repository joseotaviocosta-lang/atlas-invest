# ADR-268: Sem Fallback de Calendário Genérico na Fase 4C.2

## Status

Aceito (Fase 4C.2)

## Contexto

A Fase 4C.1 não certificou a semântica de "dia útil" para pagamento. Um fallback
para "último dia útil" reconstruído seria fail-open e não auditável.

## Decisão

1. A Fase 4C.2 **não** implementa calendário de negócios genérico.
2. O vencimento vem exclusivamente de `FederalTaxDeadlineEntry` `VERIFIED`.
3. Ausência de entrada oficial → `BLOCKED` / `MISSING_OFFICIAL_DEADLINE`.
4. Um calendário genérico só poderá ser introduzido em fase futura,
   separadamente verificada, e apenas como fallback explícito.

## Consequências

- Nenhuma inferência de feriados, fins de semana ou "dia útil".
- Vencimento sempre rastreável a fonte oficial.
