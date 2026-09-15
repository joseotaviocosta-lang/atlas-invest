# ADR-008: Separação de Datas Econômicas (LocalDate) de Timestamps Técnicos

## Status

Accepted

## Context

A data de realização de uma compra de ações na B3 (`tradeDate`) e a sua liquidação financeira (`settlementDate`, ex.: D+2) são fatos econômicos civis que ocorrem em um dia de pregão específico no calendário local de mercado.
Tratar datas de pregão como instâncias da classe `Date` do JavaScript ou timestamps UTC com horário (`2026-09-15T00:00:00.000Z`) frequentemente acarreta bugs graves de "deslocamento de data":

- Ao serializar ou desserializar em fusos horários a oeste de Greenwich (como `America/Sao_Paulo`, UTC-3), uma data de pregão pode se transformar em `2026-09-14 21:00:00`, alterando o dia da operação, a apuração mensal do IRPF ou o cálculo de proventos.

## Decision

Separar rigorosamente os conceitos temporais em duas classes distintas:

1. **Datas Econômicas e de Negociação:**
   - Representadas pelo Value Object **`LocalDate`**.
   - Formato canônico ISO: **`YYYY-MM-DD`** (ex.: `"2026-09-15"`).
   - Não contém horas, minutos, segundos ou fuso horário.
   - Aplica-se a: `tradeDate`, `settlementDate`, datas de corte/com de proventos.
   - Trata calendários civis e anos bissextos (ex.: `2024-02-29` é válido, `2025-02-29` é rejeitado).
2. **Timestamps Técnicos de Auditoria:**
   - Representados por `Date` padrão ou ISO 8601 com precisão de milissegundos e fuso UTC.
   - Aplica-se estritamente a: `createdAt`, `updatedAt` (quando o registro foi gravado/auditado no sistema).

## Consequences

- **Positivas:**
  - Imunidade completa a anomalias de fuso horário e horário de verão em apurações contábeis e fiscais.
  - Testes determinísticos e portabilidade perfeita entre clientes mobile, frontend web e servidores em diferentes datacenters.
- **Negativas:**
  - Exige a criação de um Value Object customizado `LocalDate` com validação de calendário gregoriano.
