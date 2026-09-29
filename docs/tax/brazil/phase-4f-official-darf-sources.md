# Phase 4F — Official DARF generation & Sicalc integration (official sources)

Research date: **2026-09-29** · Target: `FII_SALE` / revenue code **6015**.

## 1. Official DARF generator

- The official generator of federal DARFs is the **Sicalc / SicalcWeb**
  (Sistema de Cálculo de Acréscimos Legais), developed by **SERPRO** under the
  RFB, © 2026 Receita Federal, version 3.17.
  - `FULL_TEXT_INSPECTED`: https://sicalc.receita.fazenda.gov.br/sicalc/ajuda and
    https://sicalc.receita.fazenda.gov.br/sicalc/principal
  - RFB page: https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/darf-calculo-e-impressao-programa-sicalc-1
- Flows: **Preenchimento rápido**, **Preenchimento de IRPF Quotas**, and
  **arquivo de trabalho** (browser Local Storage + export/import). All are
  browser-interactive.

## 2. Public / supported API

- **No officially documented, supported programmatic API exists to generate a
  DARF for IRPF/ganhos líquidos (6015).**
- The RFB announced new official APIs (Oct–Nov 2026) for **CBS** —
  "Consultar débitos/créditos/pagamentos", "Emitir DARF para recolhimento como
  adquirente (RAD)" and "Emitir DARF para pagamento do contribuinte (PCONT)" —
  in **production-restricted / beta**, and **not** covering 6015.
  - `OFFICIAL_EXCERPT_INSPECTED`:
    https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/setembro/receita-federal-publica-nova-documentacao-tecnica-das-apis-de-apuracao-de-cbs
- Internal browser endpoints (e.g. `/sicalc/api/multa/calcula/...`) are **not**
  a supported integration API; they are not used as a generation API.

## 3. Authentication, captcha, identity

- **Preenchimento rápido** requires: tipo de contribuinte (PF/PJ/Estrangeiro),
  **CPF + data de nascimento** (PF) or **CNPJ** (PJ).
  `OFFICIAL_UI_INSPECTED` (help + `/sicalc/rapido/calculo`).
- **Captcha**: the IRPF Quotas flow explicitly requires the user to "preencha
  corretamente o captcha". Captcha/interaction is a first-class requirement; it
  is **never** bypassed.
- **gov.br auth**: not required for SicalcWeb Preenchimento rápido (only CPF +
  birth date). e-CAC/DCTFWeb flows do require gov.br, but are out of scope.

## 4. Required fields (código 6015)

`OFFICIAL_UI_INSPECTED`: código de receita, **período de apuração (PA)**,
**valor principal**. Sicalc computes multa/juros when the payment is late and
then emits the DARF (PDF). Municipality is not requested in the general rápido
flow.

## 5. Code 6015 support

Sicalc's "Consulta de Códigos de Receita" covers 6015; 4C already verified
6015 = "Ganhos líquidos em operações em bolsa". The 4F production target remains
`FII_SALE` / 6015 only.

## 6. Overdue handling (multa/juros)

- Sicalc recomputes multa (0,33%/dia, cap 20%) and juros (SELIC) itself. The
  4D engine already mirrors this (official Sicalc snapshot + SELIC snapshots).
- Fixture B: principal 199,90, due 2026-09-30, pay 2026-10-01 → multa 0,66,
  juros 2,00, total **202,56** (verified 4D result). For handoff, Atlas shows
  these prepared values and Sicalc recalculates on emission.

## 7. Document provenance

- The official DARF (PDF with barcode/document number) is produced **only** by
  Sicalc. Atlas never renders it, never fabricates barcode/PIX/QR, and does not
  persist official PDF bytes in this phase.
- Atlas stores only a **handoff provenance record** (prepared values + source
  system), not an official document.

## 8. Decision

**Mode: `OFFICIAL_INTERACTIVE_HANDOFF`** (Approval Path B). Atlas prepares exact
structured values and directs the user to the official Sicalc service; it does
not claim generation.

| Source                                     | Classification                                  |
| ------------------------------------------ | ----------------------------------------------- |
| Sicalc help / principal / rapido           | OFFICIAL_UI_INSPECTED / FULL_TEXT_INSPECTED     |
| RFB Sicalc page                            | FULL_TEXT_INSPECTED                             |
| RFB CBS APIs news                          | OFFICIAL_EXCERPT_INSPECTED (out of scope)       |
| Third-party Sicalc APIs (e.g. Infosimples) | SEARCH_SNIPPET_ONLY (not authoritative; unused) |

## 9. Known limitations

- No programmatic official generation for 6015; only interactive handoff.
- No official prefill parameters are documented → no URL prefill.
- Overdue official parity for an aggregated amount is not machine-verifiable in
  this phase (no official recomputation call); Atlas shows 4D values and Sicalc
  recomputes.
- No official PDF/barcode storage, no auto-payment, no bank integration, no
  annual IRPF, no tax AI (provider 0).
