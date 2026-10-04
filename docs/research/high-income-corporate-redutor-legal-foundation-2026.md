# High-Income Corporate Effective-Tax Redutor — Legal Foundation (Phase 4I.3)

- **Phase:** 4I.3 — Corporate Effective Tax Redutor — Legal Foundation & Deterministic Calculation
- **Research cutoff / retrieval date:** 2026-10-04
- **Upstream baselines:** 4H final (`be4e157`), 4I.1 final (`ced2e3f`), 4I.2 final (`e75e7cc`)
- **Status:** LEGAL FOUNDATION + PURE CALCULATION where frozen. No API/UI/persistence/DIRPF/DARF/AI.

> Every canonical rule below is anchored to a primary source (enacted law via Planalto/Câmara,
> legislative history as interpretive support only). Where the law defers to future regulation
> ("na forma de regulamento") and no such regulation exists as of the cutoff, this is recorded
> explicitly and the engine fails closed.

---

## 1. Primary sources audited

| #   | Source                                                                         | Official reference                                                                                                | Article / section                                | Retrieval date | Effective date | Applicability                                   |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------- | -------------- | ----------------------------------------------- |
| R1  | Lei nº 9.250/1995, art. 16-B (as added by Lei 15.270/2025, art. 2º) — Planalto | https://www.planalto.gov.br/ccivil_03/leis/l9250.htm                                                              | art. 16-B caput, §§1º–8º                         | 2026-10-04     | 2026-01-01     | CY ≥ 2026, exercise ≥ 2027                      |
| R2  | Lei nº 15.270/2025 (Câmara, texto original DOU)                                | https://www2.camara.leg.br/legin/fed/lei/2025/lei-15270-26-novembro-2025-798354-publicacaooriginal-177117-pl.html | Art. 2º (16-A/16-B); Art. 3º (10/10-A Lei 9.249) | 2026-10-04     | 2026-01-01     | CY ≥ 2026                                       |
| R3  | PL 1087/2025 + quadro comparativo da comissão especial (Câmara)                | camara.leg.br / PL history                                                                                        | Art. 16-B evolution; "redutor" naming            | 2026-10-04     | —              | Interpretive support only                       |
| R4  | Lei nº 9.249/1995, art. 10-A (Lei 15.270/2025, art. 3º) — Planalto             | https://www.planalto.gov.br/ccivil_03/leis/l9249.htm                                                              | art. 10-A (non-resident credit)                  | 2026-10-04     | 2026-01-01     | Non-residents — OUT OF SCOPE                    |
| R5  | IN RFB nº 2.299/2025                                                           | DOU 18/12/2025                                                                                                    | Monthly regime; reduction tables                 | 2026-10-04     | 2026-01-01     | Confirms: no 16-B operational detail            |
| R6  | RFB “Perguntas e Respostas — Tributação de Altas Rendas”                       | gov.br/receitafederal                                                                                             | Dividend items                                   | 2026-10-04     | 2026-01-01     | Confirms: no 16-B worksheet published           |
| R7  | RFB DIRPF 2026 program / pre-filled guidance                                   | gov.br/receitafederal                                                                                             | Pre-filled mechanics                             | 2026-10-04     | Exercise 2026  | Pre-filled is data transport; taxpayer verifies |

**Negative finding (recorded):** as of 2026-10-04, no normative instruction published operationalizes
the "na forma de regulamento" references of art. 16-B §§4º–6º/§8º (financial-statement form,
consolidated-statement use, simplified-profit book form, Prouni computation). The grant therefore
**requires source documentation**; taxpayer confirmation alone is insufficient.

---

## 2. Legal questions A–Z (resolved)

**A. Trigger.** The redutor is granted when, and only when, the sum of (i) the effective corporate
profit-tax rate of the distributing legal entity and (ii) the effective PF minimum-tax rate of the
beneficiary **exceeds** the sum of the nominal IRPJ+CSLL rates (§1). Source: art. 16-B caput.
Confidence: **HIGH**.

**B/C. Payer scope.** The redutor is **payer-specific**: "calculado sobre os referidos lucros e
dividendos pagos, creditados, empregados ou entregues **por cada pessoa jurídica**". Each
distributing entity is computed independently. Source: caput. Confidence: **HIGH**.

**D. Numerator.** The corporate burden numerator is **IRPJ due + CSLL due** of the legal entity
("o valor devido do imposto de renda e da CSLL"). Source: §3, I, "a". Confidence: **HIGH**.

**E. Combination.** IRPJ + CSLL jointly (addition is statutory). Prouni scholarships adherent to
the program count **as tax paid** in the numerator (§8, "nos termos de regulamento").
Confidence: **HIGH** (numerator); **MEDIUM** for the Prouni computation detail (regulation form
pending — accepted only as an explicit, evidenced add-on).

**F. Denominator.** **Lucro contábil**: "o resultado do exercício antes dos tributos sobre a renda
e das respectivas provisões". Not taxable income, not distributed profit. Source: §3, I, "b" + III.
Confidence: **HIGH**.

**G/H. Period.** The corporate rate is observed "**no exercício a que se referem os lucros e
dividendos distribuídos**" — the profit-origin exercise, which may differ from the distribution
year. Source: §3, I. Confidence: **HIGH**. Implementation: evidence carries
`profitPeriodExercise`; multiple distinct profit periods for one payer in one year are
**UNSUPPORTED** (the statute provides no splitting rule) and fail closed.

**I. Nominal caps.** 34% general (I); 40% insurance/capitalization + LC 105 art. 1º §1º II–X (II);
45% LC 105 art. 1º §1º I financial institutions (III). Source: §1. Confidence: **HIGH**.

**J/K. Financial/insurers.** 45% for LC 105 art. 1º §1º I (banks and equivalents); 40% for private
insurance, capitalization and LC 105 §1º II–X. Source: §1, II–III. Confidence: **HIGH** (mapping);
taxpayer must supply the payer classification with evidence.

**L. Special regimes.** Companies not under lucro real **may opt** for the §6 simplified accounting
profit (revenue minus the six listed expense classes). Simples Nacional treatment is not separately
defined in art. 16-B; absent explicit rule, special-regime payers use the same three caps by entity
class and fail closed on unknown classification. Confidence: **MEDIUM**; Atlas consumes a certified
simplified profit rather than recomputing the six deductions (see §15).

**M. Missing evidence.** No authoritative redutor for that payer (`REQUIRES_EVIDENCE`); the grant is
expressly conditioned on financial statements (§4). Missing ≠ zero. Confidence: **HIGH**.

**N. Partial profit evidence.** The statute provides no partial-evidence rule. A payer with only part
of its distributed profit covered by verified evidence cannot receive a partial authoritative
reduction: the payer computation requires the full statutory inputs. Fail closed. Confidence:
**HIGH**.

**O. Multiple payers.** Each payer computed independently and summed (no statutory cross term).
Confidence: **HIGH**.

**P. Multiple distributions, same payer.** The formula uses annual amounts ("montante ... pagos,
creditados, empregados ou entregues ... no ano-calendário"; PF rate denominator is the annual
total). Same-payer distributions **aggregate** before the payer computation. Confidence: **HIGH**.

**Q/R. Transition dividends.** Transition-eligible dividends are **excluded from the 16-A base**
(art. 16-A §1º XII); the redutor applies to "os referidos lucros e dividendos" included in the base.
Transition-exempt dividends therefore attract **no redutor**. Transition-ineligible dividends
(classified INCLUDED) follow the ordinary path. Confidence: **HIGH**.

**S. Dividend cap.** The multiplicand is the per-payer dividend amount — the reduction is inherently
capped by that payer's eligible dividends. Confidence: **HIGH**.

**T. Cross-payer offset.** **Forbidden.** No statutory provision allows one payer's excess burden to
offset another payer's shortfall. Each payer's negative difference floors at zero independently.
Confidence: **HIGH**.

**U/V. Carryforward/refund.** The statute provides **neither**. The §3 V deduction participates in
the §4 zero floor (art. 16-A §4º: negative result → 0). No carryforward is invented; no refund is
computed. Confidence: **HIGH**.

**W. Documentary evidence.** Corporate financial statements per corporate law and accounting
standards (§4); consolidated statements of the paying source permitted (§5); PJ dividend
information feeds the RFB pre-filled return (§7). Confidence: **HIGH** (requirement);
**MEDIUM** (exact documentary form — "na forma de regulamento", pending).

**X. Provider.** The distributing legal entity (via its statements/information); RFB may supply and
pre-compute in the pre-filled return (§7). Confidence: **HIGH**.

**Y. Taxpayer confirmation.** **Insufficient alone.** The grant is conditioned on statements
(§4); a bare taxpayer assertion without source documentation yields at most
`REQUIRES_CONFIRMATION`, never an authoritative reduction. Confidence: **HIGH**.

**Z. Global net effect.** An unresolved required payer redutor keeps `netMinimumTax = null`
(fail-closed), while `grossMinimumTax` and the supported per-payer reductions remain exposed.
The statute gives no partial-authoritative rule. Confidence: **HIGH**.

---

## 3. §15 determination — derived vs provided

- **Corporate effective rate:** Atlas **computes the ratio** (IR+CSLL+Prouni ÷ accounting profit)
  from **explicitly provided, evidenced book figures**. The ratio is the statutory formula (§3, I);
  the book figures themselves are never fabricated — absent figures fail closed. → Option A for the
  ratio; Option B (provided/certified) for the inputs.
- **Simplified profit:** Atlas consumes a **certified simplified profit** plus revenue for audit;
  it does **not** recompute the six §6 deductions from fragments (absent expense ≠ 0).
  Evidence mode is recorded (`FULL` vs `SIMPLIFIED`).
- **PF-side effective rate:** Atlas computes the statutory increment exactly:
  `(Gross(Base) − Gross(Base − D)) / D`, where `D` = total eligible dividends in the base,
  evaluated with the frozen 4I.2 rate model **before any reduction** (§3, II, "a", "antes da
  redução"). → Option A, fully frozen.

## 4. Formula (frozen)

For each payer `p` with eligible dividends `D_p > 0`, corporate rate `e_p`, nominal cap `c_p`,
and the single beneficiary PF rate `e_pf`:

```
excess_p = e_p + e_pf − c_p
redutor_p = D_p × max(0, excess_p)
globalRedutor = Σ_p redutor_p          (exact; rounded once at the final boundary)
net = max(0, gross − supportedCredits − globalRedutor)
```

- JCP is **not** "lucros e dividendos": it never enters `D` (it remains base-included without
  redutor eligibility).
- Negative `excess_p` floors at zero **per payer** (no cross-payer offset).
- `e_p` requires strictly positive accounting profit (zero/negative profit → BLOCKED; the
  statutory ratio is undefined there).

## 5. Payer-type matrix

| Payer type                           | Reference rate | Legal source      | Required evidence                         | Supported | Formula supported | Open question                           |
| ------------------------------------ | -------------- | ----------------- | ----------------------------------------- | --------- | ----------------- | --------------------------------------- |
| `STANDARD_CORPORATE`                 | 34%            | art. 16-B §1º I   | statements + profit/IR/CSLL               | YES       | YES               | —                                       |
| `INSURANCE_CAPITALIZATION_REGULATED` | 40%            | art. 16-B §1º II  | statements + profit/IR/CSLL + class proof | YES       | YES               | class-proof form (regulation pending)   |
| `FINANCIAL_INSTITUTION`              | 45%            | art. 16-B §1º III | statements + profit/IR/CSLL + class proof | YES       | YES               | class-proof form (regulation pending)   |
| `UNKNOWN`                            | —              | —                 | payer classification                      | NO        | NO                | fails closed (`UNSUPPORTED_PAYER_TYPE`) |

## 6. Open questions remaining

| ID       | Question                                                          | Impact                                       |
| -------- | ----------------------------------------------------------------- | -------------------------------------------- |
| OQ-16B-1 | Exact documentary/regulatory form ("na forma de regulamento")     | Authority level only; computation unaffected |
| OQ-16B-2 | Multi-exercise profit-origin splitting for one payer              | UNSUPPORTED; fails closed                    |
| OQ-16B-3 | Prouni computation detail ("nos termos de regulamento")           | Accepted only as explicit evidenced add-on   |
| OQ-16B-4 | Special-regime (Simples) payer classification beyond entity class | Same caps by class; unknown fails closed     |

## 7. Implementation consequences

1. Redutor is **payer-scoped** (`payerId` canonical; display name never identity).
2. Same-payer distributions aggregate; different payers never offset.
3. Missing/conflicting/uncertified evidence fails closed; only `AUTHORITATIVE` source documentation
   (PJ statements or RFB pre-filled) computes.
4. Reduction never negative; net never negative; no carryforward; no refund.
5. Rounding once at the final boundary (exact per-payer arithmetic; sum-then-round).
6. Deterministic per-payer and global fingerprints; rule-version sensitive; order independent.
