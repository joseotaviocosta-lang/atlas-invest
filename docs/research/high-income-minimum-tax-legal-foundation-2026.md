# High-Income Minimum Tax — Legal & Data Foundation (Phase 4I.1)

- **Phase:** 4I.1 — High-Income Minimum Tax — Legal & Data Foundation
- **Research cutoff / retrieval date:** 2026-10-04
- **Baseline:** Phase 4H final (`be4e15745ac9ed59be4065e1cc49efc4ebba59c7`)
- **Status:** FOUNDATION ONLY — no final minimum tax, no DARF, no DIRPF transmission, no Tax AI.

> This document is the canonical legal research artifact for Phase 4I. Secondary sources
> (accounting articles, brokerage content, news portals) were used only for discovery and are
> **not** canonical authority. Every canonical rule below is anchored to a primary source
> (Planalto/enacted law, DOU, or Receita Federal material). Where the law is not yet operationally
> regulated, this is recorded explicitly as an open question and the engine fails closed.

---

## 1. Primary sources audited

| #   | Source                                                                                     | Official reference                                                               | Article / section                                        | Retrieval date | Effective date               | Applicability                          |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------- | ---------------------------- | -------------------------------------- |
| S1  | Lei nº 15.270/2025 (Planalto, texto compilado)                                             | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15270.htm          | Art. 2º (art. 16-A e 16-B da Lei 9.250/1995)             | 2026-10-04     | 2026-01-01 (art. 8º)         | CY ≥ 2026, exercise ≥ 2027             |
| S2  | Lei nº 15.270/2025 (DOU)                                                                   | https://www.in.gov.br/web/dou/-/lei-n-15.270-de-26-de-novembro-de-2025-671614220 | Publicação 27/11/2025; art. 8º                           | 2026-10-04     | 2026-01-01                   | CY ≥ 2026                              |
| S3  | Lei nº 9.249/1995 (alterada pela Lei 15.270/2025)                                          | Planalto                                                                         | Art. 10, §§ 4º e 5º; Art. 10-A                           | 2026-10-04     | 2026-01-01                   | Não residentes / crédito               |
| S4  | Instrução Normativa RFB nº 2.299/2025                                                      | DOU de 18/12/2025                                                                | Altera IN RFB 1.500/2014 (art. 6º-A; art. 65-A; Anexo X) | 2026-10-04     | 2026-01-01 (fatos geradores) | Retenção mensal de dividendos          |
| S5  | Receita Federal — Perguntas e Respostas “Tributação de Altas Rendas (Lucros e Dividendos)” | gov.br/receitafederal (16/12/2025)                                               | Itens 2, 3, 4, 7, 8, 11, 12                              | 2026-10-04     | 2026-01-01                   | Interpretação da retenção mensal       |
| S6  | Receita Federal — Perguntas e Respostas DIRPF 2026 (ano-calendário 2025)                   | gov.br/receitafederal (v1.0, 23/04/2026)                                         | Obrigatoriedade; redução mensal                          | 2026-10-04     | Exercise 2026                | Contexto do ajuste anual               |
| S7  | Ministério da Fazenda — FAQ “Ampliação da Isenção e Tributação Mínima das Altas Rendas”    | gov.br/fazenda                                                                   | Tributação mínima / exemplos                             | 2026-10-04     | 2026-01-01                   | Interpretação oficial (não vinculante) |

Amended/related statutes audited for material relevance: **Lei nº 9.250/1995**, **Lei nº 9.249/1995**,
**Lei nº 7.713/1988** (art. 6º, XIV e XXI; art. 12-A), **Lei nº 11.033/2004** (FII need not be
reopened), **Lei nº 14.754/2023** (art. 16-A §3 III deduction; art. 16-A §1 II). No other statute
materially changed the minimum-tax base as of the cutoff.

---

## 2. Core legal questions (A–T)

**A. Who is subject to the minimum-tax regime?**
The individual (_pessoa física_) — resident in Brazil for the ordinary regime — whose **sum of all
income received in the calendar year exceeds R$ 600.000,00**. Source: Lei 9.250/1995, art. 16-A
(caput), added by Lei 15.270/2025, art. 2º. Confidence: **HIGH**.

**B. Annual income threshold.**
Strictly **superior a R$ 600.000,00** (strictly greater — equality is NOT subject). Source: art.
16-A caput. Confidence: **HIGH** (boundary wording “superior a”).

**C. Statutory base used for the threshold.**
Textually, art. 16-A, § 1º defines, “para fins do caput”, the _base de cálculo_ as the rural result
plus the income received in the year (including exclusive/definitive and exempt/zero-reduced
income), **deducting the legal exclusions I–XII**. § 2º computes the rate on the “rendimentos
apurados nos termos do § 1º”. The literal reading therefore applies the R$ 600.000,00 threshold to
the § 1º base. The Ministério da Fazenda FAQ (S7) describes summing _all_ income for the threshold
and applying exclusions “na hora de calcular o valor do imposto”, suggesting a gross-total reading.
→ **OPEN QUESTION OQ-1** (see §5). Confidence: **MEDIUM**. Implementation: the engine exposes
both `totalAnnualIncome` and `minimumTaxBase` and evaluates the threshold against the gross total
by default (matching the official FAQ), while documenting the alternate reading.

**D. Progressive transition band.**
Yes. For income **strictly above R$ 600.000,00 and below R$ 1.200.000,00**, the rate grows
**linearly from 0% to 10%** by the statutory formula: `Alíquota % = (REND / 60.000) − 10`.
Source: art. 16-A, § 2º, II. Confidence: **HIGH**.

**E. Maximum minimum effective rate.**
**10%** for income **equal to or greater than R$ 1.200.000,00**. Source: art. 16-A, § 2º, I.
Confidence: **HIGH**.

**F. Income categories entering the base.**
Rural result and all income received in the year, explicitly **including exclusive/definitive and
exempt/zero-reduced income**, subject to the exclusions in G. Equity- and FII-exchange net-gain
operations are included because § 1º, I excludes only _non-exchange_ capital gains. Dividends from
shares (“rendimentos de ações”) and JCP are included (the § 1º, XI exclusion carves out shares and
corporate participations). Source: art. 16-A, § 1º, caput, I, XI. Confidence: **HIGH**.

**G. Income categories excluded from the base (art. 16-A, § 1º).**
I — capital gains, **except** exchange/organized-OTC net-gain operations in Brazil;
II — cumulative income taxed exclusively at source (art. 12-A Lei 7.713/88) if no annual-adjustment option;
III — advance-legacy/inheritance donations;
IV — savings deposits;
V — specified bonds/funds, incl. LCI, CRI, LIG, LCD, infrastructure debentures/funds, **listed FIIs (≥ 100 quotaholders)**, Fiagro (≥ 100 quotaholders);
VI — agribusiness securities (CDA, WA, CDCA, LCA, CRA);
VII — CPR with financial settlement;
VIII — exempt rural IRPF portion;
IX — work-accident / material / moral damages indemnities (except lucros cessantes);
X — exempt income art. 6º, XIV and XXI of Lei 7.713/88;
XI — exempt/zero-rate securities income, **except** income from shares and other corporate participations;
XII — profits/dividends from results through CY2025, distribution approved by 31/12/2025, paid 2026–2028 on original terms.
Source: art. 16-A, § 1º, I–XII. Confidence: **HIGH**.

**H. Taxes already paid that reduce/credit the minimum tax (§ 3º).**
I — IRPF due in the annual adjustment (art. 12);
II — IRPF withheld **exclusively** at source on income included in the base;
III — IRPF under arts. 1º–13 of Lei 14.754/2023 (foreign/offshore);
IV — IRPF **definitively paid** on income in the base not covered by I–III;
V — the art. 16-B corporate redutor.
Additionally, § 5º deducts the art. 6º-A **anticipated** monthly withholding; § 4º floors a negative
result at zero. Confidence: **HIGH**.

**I. Treatment of dividends.** Ordinary (non-transition) dividends are **included** in the base
(art. 16-A §1 caput; §1 XI exception for shares). Confidence: **HIGH**.

**J. Transitional pre-2026 dividends.** Excluded from the base when **all** hold: (i) results
through CY2025; (ii) distribution approved by 31/12/2025 by the competent corporate body; (iii)
payment/credit/employment/delivery in 2026–2028 per the original approval. Source: art. 16-A,
§ 1º, XII; art. 6º-A, § 3º; RFB P&R S5 item 8. Missing evidence **fails closed** (ordinary rule).
Confidence: **HIGH**.

**K. JCP.** **Included** in the base (exclusively/definitively taxed income; share income). The
IRRF exclusively withheld may be deducted under § 3º, II. Atlas must not recompute JCP withholding.
Confidence: **HIGH**.

**L. Exempt FII distributions.** **Excluded** when the FII is listed/exclusively traded on
exchange or organized OTC **and** has ≥ 100 quotaholders (art. 16-A, § 1º, V, “i”). When eligibility
is unverified, the item is **CONDITIONAL / REQUIRES_CONFIRMATION** and fails closed. Confidence:
**HIGH** for the rule; **MEDIUM** for the evidence chain (Atlas depends on 4H FII-eligibility data).

**M. Equity/FII capital gains.** Exchange/organized-OTC net-gain operations are **included**;
other capital gains are **excluded** (art. 16-A, § 1º, I). Confidence: **HIGH**.

**N. Exclusive/definitive withholding items.** Generally **included** (art. 16-A §1 caput), with
the corresponding exclusive withholding **deductible** (§ 3º, II) and the art. 6º-A anticipated
withholding deductible at § 5º. Confidence: **HIGH**.

**O. Foreign income.** Not excluded from the base by § 1º; the IRPF computed under Lei 14.754/2023
is deductible (§ 3º, III). Atlas has **no authoritative upstream support** for foreign income as of
4I.1 → mark `UNSUPPORTED_UPSTREAM_DATA` and fail closed. Confidence: **HIGH** (rule), **N/A**
(upstream data).

**P. Corporate effective-tax-rate mechanism.** Art. 16-B grants a **redutor** limited to the surplus
of (effective PJ rate + effective PF minimum rate) over the nominal IRPJ+CSLL cap — **34%** general,
**40%** for insurance/capitalization and LC 105 art. 1º §1º II–X entities, **45%** for LC 105 art.
1º §1º I (banks). It requires corporate financial statements (art. 16-B, § 4º) and may be computed
in the RFB pre-filled declaration (§ 7º). 4I.1 models only the **data requirements**. Confidence:
**HIGH** (structure), **MEDIUM/LOW** (operational evidence).

**Q. Documentary evidence.** For the transition exclusion: proof of profit accrual period,
distribution approval by the competent body by 31/12/2025, and payment on original terms. For the
redutor: financial statements / accounting profit and IRPJ+CSLL due. For withholding deductions:
proof of the withholding. Confidence: **MEDIUM**.

**R. Unavailable evidence.** Fails closed: transition → ordinary rule; FII eligibility → requires
confirmation; corporate evidence → redutor not applied; unknown categories → not silently included
or excluded. Confidence: **HIGH**.

**S. Rules starting in CY2026.** Art. 6º-A monthly 10% withholding on dividends > R$ 50.000,00/month
per same PJ→same resident PF (darf code 1841); art. 16-A annual minimum tax (first assessed in
exercise 2027); art. 16-B redutor. Confidence: **HIGH**.

**T. First declaration exercise reporting them.** **Exercise 2027 (CY2026)** for art. 16-A. The
monthly retention under art. 6º-A is a CY2026 payer obligation. Confidence: **HIGH**.

---

## 3. Explicit effective-date matrix

| Rule                                              | CY2025         | CY2026       | CY2027       | Notes                                                      |
| ------------------------------------------------- | -------------- | ------------ | ------------ | ---------------------------------------------------------- |
| Monthly dividend withholding > R$ 50k (art. 6º-A) | NOT_APPLICABLE | APPLICABLE   | APPLICABLE   | Payslips from Jan/2026; DARF 1841                          |
| Annual high-income minimum tax (art. 16-A)        | NOT_APPLICABLE | APPLICABLE   | APPLICABLE   | First assessed in exercise 2027                            |
| Transition exclusion (art. 16-A §1 XII)           | NOT_APPLICABLE | TRANSITIONAL | TRANSITIONAL | Applies to 2026–2028 payments of pre-2026 approved profits |
| Corporate redutor (art. 16-B)                     | NOT_APPLICABLE | APPLICABLE   | APPLICABLE   | Conditional on financial statements                        |
| Annual regime operational detail                  | UNSUPPORTED    | PROVISIONAL  | PROVISIONAL  | No annual-regime IN published as of 2026-10-04             |
| Foreign income (Lei 14.754) in base               | UNSUPPORTED    | UNSUPPORTED  | UNSUPPORTED  | No authoritative Atlas upstream                            |
| Fiagro distributions (§1 V “j”)                   | UNSUPPORTED    | UNSUPPORTED  | UNSUPPORTED  | Not modeled as a distinct 4H income type                   |

| Declaration exercise | Calendar year | Reports minimum tax?          |
| -------------------- | ------------- | ----------------------------- |
| 2026                 | 2025          | NO — regime not yet effective |
| 2027                 | 2026          | YES — first assessment        |
| 2028                 | 2027          | YES                           |

---

## 4. Canonical terminology (glossary)

Mirrors statutory terminology; no informal names are introduced.

- `HighIncomeMinimumTax` — “tributação mínima do Imposto sobre a Renda das Pessoas Físicas” (IRPFM).
- `MinimumTaxBase` — “base de cálculo da tributação mínima” (art. 16-A, § 1º).
- `MinimumEffectiveRate` / rate band — “alíquota da tributação mínima” (art. 16-A, § 2º).
- `TaxCredit` / deductions — the § 3º deductions (annual adjustment IRPF, exclusive IRRF, Lei 14.754, definitive IRPF, redutor).
- `AnticipatedWithholding` — “retido na fonte antecipado” under art. 6º-A (§ 5º).
- `ExcludedIncome` — “deduções” of art. 16-A, § 1º, I–XII.
- `Reduction` / `CorporateEffectiveTaxAdjustment` — “redutor” of art. 16-B.
- `TransitionIncome` — pre-2026 profits under art. 16-A, § 1º, XII.

---

## 5. Open questions and confidence

| ID   | Question                                                                     | Reading adopted                           | Alternative                               | Impact                                               |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| OQ-1 | Threshold base: gross total vs §1 base                                       | Gross total (official FAQ S7)             | §1 base (literal §1 “para fins do caput”) | Only the eligibility comparison; engine exposes both |
| OQ-2 | Annual-regime operational detail (rounding, pre-filled redutor, form layout) | Fail closed; no final calculation in 4I.1 | Future IN/Manual                          | Blocks final calculator (4I.2), not 4I.1             |
| OQ-3 | Foreign income inclusion & credit mechanics                                  | `UNSUPPORTED_UPSTREAM_DATA`               | Requires Lei 14.754 upstream              | Future phase                                         |
| OQ-4 | Fiagro income as distinct category                                           | `UNSUPPORTED`                             | Map if 4H exposes it                      | Future phase                                         |
| OQ-5 | Multi-payer corporate redutor evidence granularity                           | Single requirement surfaced               | Per-payer evidence                        | Future calculator                                    |
| OQ-6 | Rural activity result split                                                  | `UNSUPPORTED_UPSTREAM_DATA`               | Requires rural upstream                   | Future phase                                         |

**Overall legal confidence:** HIGH for the statutory structure and boundaries; MEDIUM for the annual
operational/evidence detail (no annual-regime IN published as of the cutoff); the engine is
fail-closed everywhere confidence is not HIGH.

---

## 6. Atlas interpretation & implementation consequences

1. **Eligibility, not tax.** 4I.1 classifies income, selects the versioned rule set, evaluates the
   R$ 600.000,00 threshold and assesses required evidence — it **never** computes the payable tax.
2. **Unknown ≠ zero.** Unresolved classifications yield `minimumTaxBase = null`, never `"0"`.
3. **Fail-closed.** Missing transition/FII/corporate evidence downgrades applicability to
   `REQUIRES_CONFIRMATION`; unsupported categories are never silently included or excluded.
4. **Payer identity.** The canonical `payerId` is used; `payerDisplayName` is never an identity.
5. **Consumption of 4H.** The foundation consumes authoritative 4H.3/4H.4/4H.5 facts without
   reinterpreting or mutating them (ADR-305).

---

## 7. Legal golden matrix (Atlas upstream categories)

| Atlas upstream category                 | 4H source                          | 4I status             | Classification        | Legal source                       | Rule version                   | Required evidence                 | Open question |
| --------------------------------------- | ---------------------------------- | --------------------- | --------------------- | ---------------------------------- | ------------------------------ | --------------------------------- | ------------- |
| Ordinary dividend (CY ≥ 2026)           | 4H.4 `DIVIDEND` (R-DIV-2026)       | INCLUDED              | INCLUDED              | art. 16-A §1 XI (exceção de ações) | `2025-11-26-LEI-15270-ART-16A` | corporate effective-tax (redutor) | OQ-5          |
| Transition dividend (eligible)          | 4H.4 `DIVIDEND` (R-DIV-TRANSITION) | EXCLUDED              | EXCLUDED              | art. 16-A §1 XII                   | idem                           | approval/profit-period proof      | —             |
| Transition dividend (unverified)        | 4H.4                               | REQUIRES_CONFIRMATION | REQUIRES_CONFIRMATION | art. 16-A §1 XII                   | idem                           | `TRANSITION_ELIGIBILITY`          | —             |
| JCP                                     | 4H.4 `JCP`                         | INCLUDED              | INCLUDED              | art. 16-A §1 caput, II, XI         | idem                           | `WITHHOLDING_EVIDENCE`            | —             |
| FII income (listed, ≥100 cotistas)      | 4H.4 `FII_INCOME`                  | EXCLUDED              | EXCLUDED              | art. 16-A §1 V “i”                 | idem                           | `FII_ELIGIBILITY`                 | OQ-4          |
| FII income (unverified)                 | 4H.4                               | REQUIRES_CONFIRMATION | REQUIRES_CONFIRMATION | idem                               | idem                           | `FII_ELIGIBILITY`                 | —             |
| Equity capital gain (exchange net gain) | 4H.3                               | INCLUDED              | INCLUDED              | art. 16-A §1 I (exceção bolsa)     | idem                           | —                                 | —             |
| Day trade gain (equity)                 | 4H.3                               | INCLUDED              | INCLUDED              | art. 16-A §1 I                     | idem                           | —                                 | —             |
| FII capital gain (exchange net gain)    | 4H.3                               | INCLUDED              | INCLUDED              | art. 16-A §1 I                     | idem                           | —                                 | —             |
| Exclusive/definitive withholding income | 4H.3/4H.4                          | INCLUDED              | INCLUDED              | art. 16-A §1 caput; §3 II          | idem                           | `WITHHOLDING_EVIDENCE`            | —             |
| Savings income                          | not modeled upstream               | EXCLUDED              | EXCLUDED              | art. 16-A §1 IV                    | idem                           | —                                 | —             |
| Exempt bond/security income (non-share) | not modeled upstream               | EXCLUDED              | EXCLUDED              | art. 16-A §1 V–VII, XI             | idem                           | —                                 | —             |
| Exempt security of share nature         | not modeled upstream               | CONDITIONAL           | CONDITIONAL           | art. 16-A §1 XI (exceção)          | idem                           | `DIVIDEND_SOURCE_CLASSIFICATION`  | —             |
| Foreign income (Lei 14.754)             | no authoritative upstream          | UNSUPPORTED           | UNSUPPORTED           | art. 16-A §1; §3 III               | idem                           | `FOREIGN_TAX_CREDIT_EVIDENCE`     | OQ-3          |
| Rural activity result                   | no authoritative upstream          | UNSUPPORTED           | UNSUPPORTED           | art. 16-A §1 caput e VIII          | idem                           | —                                 | OQ-6          |
| Donation / inheritance advance          | not modeled upstream               | EXCLUDED              | EXCLUDED              | art. 16-A §1 III                   | idem                           | —                                 | —             |
| Indemnities (accident/damages)          | not modeled upstream               | EXCLUDED              | EXCLUDED              | art. 16-A §1 IX                    | idem                           | —                                 | —             |
| Fiagro distribution                     | not distinctly modeled             | UNSUPPORTED           | UNSUPPORTED           | art. 16-A §1 V “j”                 | idem                           | `FII_ELIGIBILITY`                 | OQ-4          |
| Unknown category                        | —                                  | UNSUPPORTED           | UNSUPPORTED           | fail-closed                        | —                              | —                                 | —             |

**No category is assumed included. Every CONDITIONAL entry declares its condition, source,
required evidence and fail-closed behaviour.**
