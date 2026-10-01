# Annual IRPF Legal Foundation — 2026

> Phase 4H.1. Research cutoff: **2026-10-01**. Scope: individual (pessoa física)
> resident in Brazil, capital-market investments already supported by Atlas
> (Brazilian listed equities, FII, day trade). This document is foundational:
> it maps legal reporting obligations to data. It does **not** implement annual
> tax calculation, declaration generation, or Receita submission.

Every rule below is classified as **CONFIRMED**, **PARTIAL**, **UNRESOLVED**, or
**NOT_APPLICABLE**. No production annual rule may be declared READY while PARTIAL
or UNRESOLVED (Phase 4H §7).

Primary sources are Receita Federal (RFB) and Planalto/legislation. Secondary
sources were used only for navigation and are explicitly flagged.

---

## 1. Temporal model (mandatory distinction)

| Concept                          | Definition                                                    | 2026 example |
| -------------------------------- | ------------------------------------------------------------- | ------------ |
| Calendar year (ano-calendário)   | The year the facts occurred                                   | 2025         |
| Declaration exercise (exercício) | The year the declaration is filed for the prior calendar year | 2026         |
| Taxable event date               | The economic date of the transaction/event (civil date)       | 2025-09-15   |
| Rule effective date              | When a legal rule applies                                     | varies       |

**CONFIRMED** — DIRPF 2026 covers the **ano-calendário 2025** (IN RFB nº 2.312,
de 13/03/2026). Atlas must never conflate calendar year, exercise and rule
effective date.

- Source: IN RFB nº 2.312/2026 (RFB); RFB IRPF 2026 schedule.
- Atlas implication: `CalendarYear`, `DeclarationExercise` and `AnnualTaxPeriod`
  are distinct typed concepts; rules resolve by calendar year, not "current".
- Open question: none.

---

## 2. Legal rule matrix

| #   | Rule                                                                                                                                                                 | Status                                              | Official source                                                            | Effective        | Affected data                            | Atlas implication                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| L1  | DIRPF obligation: alienações em bolsa soma > R$ 40.000, **or** ganhos líquidos sujeitos a imposto                                                                    | CONFIRMED                                           | IN RFB nº 2.312/2026, art. 2 (RFB)                                         | 2026 (AC 2025)   | annual operations volume, monthly gains  | compute year total of bolsa sales + whether any monthly gain was taxable |
| L2  | DIRPF obligation: bens e direitos > R$ 800.000 em 31/12                                                                                                              | CONFIRMED                                           | IN RFB nº 2.312/2026 (RFB)                                                 | 2026             | year-end positions/cost                  | year-end holdings total (acquisition cost)                               |
| L3  | Normal listed-equity gain 15%                                                                                                                                        | CONFIRMED                                           | Lei nº 11.033/2004, art. 2º, II; already in 4G                             | since 2004/2015  | monthly normal net tax                   | reuse 4G (no recompute)                                                  |
| L4  | Day-trade gain 20%                                                                                                                                                   | CONFIRMED                                           | Lei nº 11.033/2004, art. 2º, I                                             | since 2004/2015  | monthly day-trade net tax                | reuse 4G                                                                 |
| L5  | Normal IRRF 0,005% (código 5557)                                                                                                                                     | CONFIRMED                                           | Lei nº 11.033/2004, art. 2º, §1º, IV; IN RFB 1.585/2015, art. 63           | since 2015       | normal IRRF                              | reuse 4G                                                                 |
| L6  | Day-trade IRRF 1% (código 8468)                                                                                                                                      | CONFIRMED                                           | IN RFB 1.585/2015, art. 65; RFB retention table                            | since 2015       | day-trade IRRF                           | reuse 4G                                                                 |
| L7  | R$ 20k monthly exemption, ações e ouro, market à vista, applied separately per modality                                                                              | CONFIRMED                                           | Lei nº 11.033/2004, art. 3º; RFB "Isenções"                                | since 2004       | monthly normal sales                     | reuse 4G exemption result                                                |
| L8  | Loss offset: common only vs common; day trade only vs day trade; no retroactive offset; no expiry                                                                    | CONFIRMED                                           | RFB "Compensações"; IN RFB 1.585/2015, art. 64/65                          | since 2015       | loss buckets                             | reuse 4G; annual layer only references                                   |
| L9  | Normal (0,005%) residual IRRF may be offset in the **annual adjustment declaration** if unused after monthly offsets                                                 | CONFIRMED                                           | RFB "Retenções"                                                            | since 2015       | normal IRRF residual                     | maps to 4G `AVAILABLE_FOR_ANNUAL_ADJUSTMENT`                             |
| L10 | Day-trade (1%) IRRF may only be offset through **December of the same retention year**; residual → **restitution**                                                   | CONFIRMED                                           | RFB "Retenções"                                                            | since 2015       | day-trade IRRF residual                  | maps to 4G `AVAILABLE_FOR_RESTITUTION`                                   |
| L11 | Monthly results (common/day trade) informed per month in the Demonstrativo de Renda Variável; prior-year losses in the "resultado negativo até o mês anterior" field | CONFIRMED                                           | RFB DIRPF / ReVar; RFB "Compensações"                                      | 2026             | monthly normal/day-trade results, losses | monthly → annual bridge                                                  |
| L12 | DARF pago (6015) informed per month inside Renda Variável ("Imposto Pago")                                                                                           | CONFIRMED                                           | RFB; InfoMoney/ReVar walkthrough                                           | 2026             | monthly obligation payments              | reference 4C/4E obligation + payment evidence                            |
| L13 | Year-end holdings declared by **acquisition cost** (not market value)                                                                                                | CONFIRMED                                           | RFB "Perguntas frequentes DIRPF"; MIR manual                               | current          | year-end quantity + historical cost      | derive from ledger/replay; never market value                            |
| L14 | Ações → Bens e Direitos category "Participações Societárias"; declaration required when acquisition cost ≥ R$ 1.000,00                                               | CONFIRMED (category) / PARTIAL (numeric group/code) | RFB MIR "Bens Financeiros"                                                 | 2026             | per-asset year-end qty + cost            | group/code mapping deferred until numerically confirmed                  |
| L15 | FII quotas → Bens e Direitos category "Fundos"                                                                                                                       | PARTIAL                                             | RFB MIR "Bens Financeiros"                                                 | 2026             | FII year-end qty + cost                  | numeric code pending confirmation                                        |
| L16 | ETF/BDR → "Ativos Negociados em Bolsa no Brasil, exceto Ações e Fundos" (≥ R$ 1.000)                                                                                 | CONFIRMED (category) / PARTIAL (numeric code)       | RFB MIR "Bens Financeiros"                                                 | 2026             | ETF/BDR year-end qty + cost              | out of 4G scope; data gap noted                                          |
| L17 | Ações dividends: isentos até 31/12/2025 (código 09 – rendimentos isentos)                                                                                            | CONFIRMED                                           | RFB P&R IRPF 2026; Lei nº 9.249/1995                                       | through 2025     | dividend income events                   | requires dividend income support (data gap)                              |
| L18 | From Jan/2026: IRRF 10% on monthly profits/dividends > R$ 50.000 from the same PJ to the same PF                                                                     | CONFIRMED                                           | Lei nº 15.270/2025; RFB notícia 06/08/2026                                 | from 2026        | dividend income + retention              | new regime; affects AC 2026 (exercise 2027)                              |
| L19 | JCP: tributação exclusiva na fonte; rate 15% → **17,5%** from 2026 (código 5706)                                                                                     | CONFIRMED                                           | Lei nº 9.249/1995, art. 9º, §2º (red. LC nº 224/2025); RFB retention table | rate change 2026 | JCP income + retention                   | JCP must stay distinct from dividends; data gap                          |
| L20 | FII rendimento mensal: isento para PF **sob condições** (cotas em bolsa, nº mínimo de cotistas, cotista não relevante); senão retido (código 5232)                   | PARTIAL (conditional)                               | Lei nº 11.033/2004, art. 3º; RFB "Fundos de Investimento no Brasil"        | current          | FII income events + fund condition facts | depends on fund/eligibility facts; fail closed when unknown              |
| L21 | FII gain on sale: 20%, no R$20k exemption (bolsa)                                                                                                                    | CONFIRMED                                           | RFB "Fundos de Investimento no Brasil"; 4G                                 | current          | FII monthly gain                         | reuse 4G                                                                 |
| L22 | Split / reverse split: no taxable event; quantity changes, cost preserved                                                                                            | CONFIRMED                                           | RFB P&R / consolidated guidance; 4G ADR-048                                | current          | corporate action audit trail             | reuse 4G (never re-tax)                                                  |
| L23 | Subscription (subscrição): onerous acquisition; increases cost                                                                                                       | CONFIRMED                                           | 4G ADR-054; RFB guidance on subscription                                   | current          | subscription events                      | reuse 4G                                                                 |
| L24 | Bonificação (bonus shares): not taxed on receipt under the ordinary rule; gain only on later sale                                                                    | PARTIAL                                             | RFB guidance; conflict: STJ REsp 169.7606/PR (lucros cessantes)            | current          | bonus events                             | classify PARTIAL; never fabricate cost                                   |
| L25 | Incorporation/merger/spin-off: "mera troca de ações" generally no ganho de capital; case-by-case rules                                                               | PARTIAL/UNRESOLVED                                  | TRF decision (2026); Lei nº 9.249/1995, art. 23 context                    | current          | corporate action events                  | not supported; fail closed                                               |
| L26 | Prejuízos a compensar survive year boundary; reported historically; no expiry                                                                                        | CONFIRMED                                           | RFB "Compensações"                                                         | since 2015       | loss buckets (normal/day/FII)            | annual layer references 4G closing loss                                  |
| L27 | Minimum annual taxation for total income > R$ 600.000 (two brackets up to 10%), adjusted base includes exempt income/dividends/capital gains                         | CONFIRMED                                           | Lei nº 15.270/2025                                                         | from 2026        | total income across sources              | depends on non-Atlas income; requires user input                         |
| L28 | DeCripto from July/2026; crypto custody/foreign regimes changed                                                                                                      | NOT_APPLICABLE (Atlas scope)                        | RFB; Lei nº 14.754/2023                                                    | 2026             | crypto                                   | out of scope                                                             |

### Confidence summary

- CONFIRMED: L1–L13, L16 (category), L17–L19, L21–L23, L26, L27.
- PARTIAL: L14/L15/L16 numeric form codes; L20 (FII conditional exemption);
  L24 (bonificação).
- UNRESOLVED: L25 (merger/spin-off details).
- NOT_APPLICABLE (Atlas 4G scope): L28.

---

## 3. Monthly → annual alignment (foundation)

The monthly capital-market regime (4G) is production-ready. The annual layer is a
**reporting/organization** layer over that state; it must not recompute matching,
losses, IRRF or 6015 (Phase 4H §16).

| Monthly 4G fact                          | Annual use                                          | Status                             |
| ---------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Normal monthly result                    | Demonstrativo Renda Variável → Operações Comuns     | CONFIRMED                          |
| Day-trade monthly result                 | Demonstrativo Renda Variável → Day-Trade            | CONFIRMED                          |
| FII monthly result                       | Demonstrativo Renda Variável → FII/Fiagro           | CONFIRMED                          |
| Exemption status                         | isento gains (R$20k) reporting (código 20)          | CONFIRMED                          |
| Opening/closing loss                     | "prejuízo a compensar" (per category)               | CONFIRMED                          |
| Normal IRRF opening/current/used/closing | IRRF retido fields + annual offset                  | CONFIRMED                          |
| Day-trade IRRF                           | IRRF fields + restitution state                     | CONFIRMED                          |
| Terminal year-end IRRF states            | normal → annual adjustment; day trade → restitution | CONFIRMED                          |
| 6015 obligation + payments               | "Imposto Pago" per month                            | CONFIRMED                          |
| Carry-forward (4E)                       | deferred sub-minimum amounts                        | PARTIAL (annual display semantics) |

---

## 4. Official identifiers with provenance

| Identifier                                | Value                                               | Source                                                       | Status    |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | --------- |
| Revenue code — gains on bolsa             | 6015                                                | RFB retention table; 4C registry                             | CONFIRMED |
| IRRF code — normal (0,005%)               | 5557                                                | RFB "Agenda Tributária" (13/08/2026); Lei 11.033/2004 art. 2 | CONFIRMED |
| IRRF code — day trade (1%)                | 8468                                                | RFB "Agenda Tributária"                                      | CONFIRMED |
| IRRF code — JCP                           | 5706                                                | RFB "Agenda Tributária"                                      | CONFIRMED |
| IRRF code — FII distribution/amortization | 5232                                                | RFB "Agenda Tributária"                                      | CONFIRMED |
| DIRPF 2026 rule                           | IN RFB nº 2.312/2026                                | RFB                                                          | CONFIRMED |
| Bens e Direitos group/code — ações        | Grupo 03 / Código 01 (pending numeric confirmation) | secondary (Contabilizei summarising official)                | PARTIAL   |

---

## 5. Explicitly out of scope (this phase and, unless separately approved, 4H)

- Annual IRPF declaration **generation** and **submission** to Receita.
- Receita/GCAP/ReVar/PGD automation, credentials, captcha or certificate handling.
- Tax AI (remains `UNSUPPORTED_TAX`).
- ETF/BDR/options/futures/crypto taxation (4G is equities + FII only).
- Foreign assets beyond what Atlas already stores; cross-border rules
  (Lei nº 14.754/2023) are not modelled here.
- Minimum-tax computation requiring non-Atlas income (needs user-confirmed data).

---

## 6. Open questions (must not be frozen as production rules)

1. Exact **numeric grupo/código** for ações, FII, ETF/BDR in Bens e Direitos
   (official P&R/manual confirmation needed before freezing form mapping).
2. Bonificação ordinary treatment vs. judicial exceptions (STJ REsp 169.7606/PR).
3. Incorporation/merger/spin-off cost/quantity rules for individuals.
4. FII conditional exemption facts (minimum cotistas, relevance threshold) — which
   facts Atlas can prove and which require the fund/administrator.
5. Whether the annual display of 4E 6015 carry interacts with the
   "prejuízo a compensar" fields or is purely informational.
6. Minimum-tax (Lei 15.270/2025) interaction with capital-market income for
   high-income users, pending official P&R detail.

---

## 7. Source index

| Source                                 | URL/reference                                                         | Used for                        |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| IN RFB nº 2.312/2026                   | RFB (13/03/2026)                                                      | DIRPF 2026 obligation, model    |
| RFB "Retenções" (renda variável)       | gov.br/receitafederal/.../renda-variavel/bolsa-de-valores-1/retencoes | L5, L6, L9, L10                 |
| RFB "Compensações"                     | gov.br/.../bolsa-de-valores-1/compensacoes                            | L8, L11, L26                    |
| RFB "Isenções"                         | gov.br/.../bolsa-de-valores-1/isencoes                                | L7                              |
| RFB MIR "Bens Financeiros"             | gov.br/.../manual-mir/patrimonio/bens-financeiros                     | L13, L14–L16                    |
| RFB "Fundos de Investimento no Brasil" | gov.br/.../renda-variavel/fundos-de-investimento-no-brasil            | L20, L21                        |
| RFB retention/revenue-code table       | gov.br/.../agenda-tributaria/2026/Agosto/dia-13-08-2026               | 5557, 8468, 5706, 5232, 6015    |
| Lei nº 11.033/2004                     | Planalto/Câmara                                                       | L3–L7                           |
| Lei nº 9.249/1995 (art. 9º)            | Planalto (red. LC 224/2025)                                           | L19                             |
| Lei nº 15.270/2025                     | Planalto; RFB notícia 06/08/2026                                      | L18, L27                        |
| RFB P&R IRPF 2026 (v1.00, 23/04/2026)  | gov.br/.../perguntas-e-respostas/dirpf                                | general positions               |
| ReVar (RFB calculator)                 | Folha/InfoMoney 2026                                                  | position/cost/prejuízo workflow |
