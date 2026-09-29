# Phase 4D.2 — Late Payment Authority & Overdue Adjustment Engine

Research date: **2026-09-29** · Activated: overdue adjustment for **FII_SALE** (6015).

## Official authority

- **Multa**: Lei nº 9.430/1996, art. 61, caput + §1º + §2º — 0,33%/dia, teto 20%.
- **Juros**: Lei nº 9.430/1996, art. 61, §3º — SELIC mensal (soma simples) do mês
  seguinte ao vencimento até o mês anterior ao pagamento, + 1% no mês do
  pagamento; sem juros no mesmo mês.
- **Sicalc** (oficial): `GET /sicalc/api/multa/calcula/{municipio}/{due}/{pay}/{principal}`
  → `{valor, percentual, inicioUtil, fimUtil}`; `GET /sicalc/api/selic/acumulada/{yyyy-mm-01}/{yyyy-mm-01}`.

## Evidence (official Sicalc results, retrieved 2026-09-29)

| Input                           | Result                               | Inference                   |
| ------------------------------- | ------------------------------------ | --------------------------- |
| principal 199.90, 1 day late    | valor 0.66 (raw 0.65967)             | rounds (not truncate)       |
| raw 0.165                       | 0.16                                 | **half-even** (not half-up) |
| raw 0.825                       | 0.82                                 | **half-even**               |
| raw 0.495                       | 0.50                                 | rounds up                   |
| raw 1.155                       | 1.16                                 | half-even                   |
| due 2026-09-30 → pay 2026-10-05 | 1.65% = 5 calendar days              | calendar count              |
| due 2026-10-30 → pay 2026-11-03 | 0.33% = 1 day (2026-11-02 = Finados) | **business-day start**      |
| principal 1000, long delay      | 200.00 (20%)                         | cap 20%                     |

## Architecture

**HYBRID** (ADR-270): local deterministic engine (formula, cap, SELIC simple
sum, half-even rounding, composition) + **official Sicalc late-fee snapshot**
(authority for the business-day-sensitive start) + **official SELIC snapshots**.
No generic holiday calendar (ADR-275). Fail closed on missing authority/rates
(ADR-271/272).

## Verified production examples

- **A**: principal 199.90, due 2026-09-30, pay 2026-10-01 → multa 0.66, juros 2.00,
  **updated 202.56** (late fee from official Sicalc snapshot; parity PASS).
- **B**: principal 1000.00, due 2025-01-15, pay 2025-04-10 → multa 200.00,
  juros 29.50 (SELIC 2025-02 = 0.99, 2025-03 = 0.96), **updated 1229.50**.

## Known limitations

- Municipality is fixed to a default (`7107`, São Paulo) until a canonical
  taxpayer-municipality source exists; other municipalities fail closed without
  a snapshot.
- Only the SELIC months needed for the verified examples are seeded.
- Minimum-DARF rule (R$ 10,00; IN SRF 82/1996) is **deferred** (DARF-only).
- No official DARF generation, no auto-payment, no bank integration, no IRPF.
