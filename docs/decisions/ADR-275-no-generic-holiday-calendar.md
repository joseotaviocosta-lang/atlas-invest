# ADR-275: Sem Calendário Genérico de Feriados

## Status

Aceito (Fase 4D.2)

## Contexto

O início da multa depende de dias úteis, incluindo feriados municipais. A Fase
4C.1 não certificou esse calendário.

## Decisão

1. O Atlas **não** implementa `isBusinessDay`, feriados nacionais/municipais/
   estaduais, Carnaval ou Corpus Christi.
2. O dia útil de início vem exclusivamente do snapshot oficial (ou falha
   fechada).
3. O motor puro não faz I/O de rede; o adaptador oficial vive na camada de
   aplicação.

## Consequências

- Zero inferência de calendário; resultado ancorado em fonte oficial.
