# ADR-262: Autoridade Direta de Vencimento Tributário Federal

## Status

Aceito (Fase 4C.2)

## Contexto

A Fase 4C.1 não conseguiu certificar a semântica genérica de "dia útil" para
pagamento de tributos federais (sábado, feriados, ponto facultativo, feriados
locais, calendário bancário). Reconstruir um calendário de negócios a partir de
regras não verificadas seria arriscado e fail-open.

A Receita Federal publica diretamente a data de vencimento já resolvida por
competência e código de receita na Agenda Tributária (Ato Declaratório Executivo
CORAT).

## Decisão

1. A autoridade primária de prazo da Fase 4C é a **Agenda Tributária da RFB +
   ADE CORAT**, endereçada por `(revenueCode, competence)`.
2. `FederalTaxDeadlineEntry` é imutável e versionado; apenas entradas `VERIFIED`
   resolvem.
3. Ausência de entrada oficial → falha fechada (`MISSING_OFFICIAL_DEADLINE`);
   ambiguidade (mais de uma `VERIFIED`) → falha fechada.
4. Nenhum calendário genérico de negócios é reconstruído na Fase 4C.2.

## Consequências

- Vencimento determinístico e auditável com proveniência oficial.
- Independência de interpretações frágeis de "dia útil".
- Correções da Receita exigem nova versão (ADR-263).
