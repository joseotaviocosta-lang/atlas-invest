# Contrato: TaxInputManualEntry v1 (Fase 4B.4)

Fluxos manuais para registrar inputs tributários canônicos. A UX coleta **fatos**;
nunca decide lei tributária (ADR-258).

## Escopo permitido

- Classificação de operação (`NORMAL | DAY_TRADE | UNKNOWN`).
- Retenção/IRRF factual (decimal exato).
- Fatos de FII (contagem de cotistas, participação %, negociação em bolsa, asOf).

## Proibido na UX

- alíquota, isenção, imposto devido, regra de compensação, interpretação legal.
- default `NORMAL`, `0`, `false` para valores não informados.

## Regras

1. Estado inicial: `UNKNOWN` / não informado (sem pré-seleção).
2. Salvar registra proveniência (`MANUAL*` + `confirmedAt`).
3. Editar um valor diferente cria **conflito** (nunca sobrescreve silenciosamente).
4. Decimal exato via string; sem `parseFloat`/`Number()` em valores financeiros.
5. Comma decimal brasileiro normalizado deterministicamente para string canônica.
6. Campo vazio = não informado; `"0"` = zero confirmado.
7. Copy factual, sem aconselhamento tributário.
