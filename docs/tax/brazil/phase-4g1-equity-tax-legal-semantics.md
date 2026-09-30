# Phase 4G.1 — Brazilian Equities & Day-Trade Tax — Legal Semantics Research

Research date: **2026-09-29** · Research-only (no production code).

Scope: close the legal/operational semantics required before activating Brazilian
listed-equity tax rules (normal + day trade). Evidence classes:
`VERIFIED_FULL_TEXT`, `VERIFIED_OFFICIAL_MANUAL`, `OFFICIAL_EXCERPT`,
`SECONDARY_CORROBORATION`, `UNRESOLVED`.

---

## 1. Rates

| Item                      | Value   | Authority                       | Class              |
| ------------------------- | ------- | ------------------------------- | ------------------ |
| Normal listed-equity gain | **15%** | Lei nº 11.033/2004, art. 2º, II | VERIFIED_FULL_TEXT |
| Day-trade gain            | **20%** | Lei nº 11.033/2004, art. 2º, I  | VERIFIED_FULL_TEXT |

Lei nº 11.033/2004, art. 2º (full text):

> O disposto no art. 1º desta Lei não se aplica aos ganhos líquidos auferidos em
> operações realizadas em bolsas de valores, de mercadorias, de futuros, e
> assemelhadas, inclusive **day trade**, que permanecem sujeitos à legislação
> vigente e serão tributados às seguintes alíquotas:
> I - 20% (vinte por cento), no caso de operação **day trade**;
> II - 15% (quinze por cento), nas demais hipóteses.

Base: "ganhos líquidos" (net gains) per monthly apuração. Lei nº 8.981/1995,
art. 72º remete à legislação vigente (rate now set by Lei 11.033/2004).

---

## 2. Monthly exemption (normal operations only)

| Item        | Value                                                    | Authority                      | Class              |
| ----------- | -------------------------------------------------------- | ------------------------------ | ------------------ |
| Threshold   | **R$ 20.000,00 / month**                                 | Lei nº 11.033/2004, art. 3º, I | VERIFIED_FULL_TEXT |
| Comparison  | "igual ou inferior" → equality is **exempt**             | idem                           | VERIFIED_FULL_TEXT |
| Basis       | total **gross sale proceeds** ("valor das alienações")   | idem + RFB Isenções page       | VERIFIED_FULL_TEXT |
| Scope       | **pessoa física**, per month                             | idem                           | VERIFIED_FULL_TEXT |
| Assets      | **ações** and **ouro ativo financeiro**, each separately | idem                           | VERIFIED_FULL_TEXT |
| Day trade   | **not exempt**                                           | RFB "Isenções" + art. 2º       | VERIFIED_FULL_TEXT |
| ETFs / FIIs | **not exempt** and not part of the equity threshold      | RFB "Isenções"                 | VERIFIED_FULL_TEXT |

Lei nº 11.033/2004, art. 3º, I (full text):

> os ganhos líquidos auferidos por pessoa física em operações no mercado à vista
> de ações nas bolsas de valores e em operações com ouro ativo financeiro cujo
> valor das alienações, realizadas em cada mês, seja igual ou inferior a
> R$ 20.000,00 (vinte mil reais), para o conjunto de ações e para o ouro ativo
> financeiro respectivamente;

RFB "Isenções" (gov.br, atualizado 04/06/2024):

> Não São Isentos do Imposto: as operações de _day trade_; as negociações de
> cotas dos fundos de investimento em índice de ações; os resgates de cotas de
> fundos ou clubes de investimento em ações.
> São Isentos: Os ganhos líquidos em operações efetuadas com ações e com ouro
> (ativo financeiro), se o total das vendas de cada ativo, realizadas no mês,
> for menor ou igual a R$ 20.000,00.

> **RESOLVED:** threshold, basis, scope, equality, asset scope, day-trade/ETF/FII
> exclusion.

---

## 3. Day-trade definition

| Item       | Value                                                                              | Authority                        | Class              |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------- | ------------------ |
| Definition | same day + same asset + **same institution** + quantity settled (total or partial) | IN RFB nº 1.585/2015, art. 65, I | VERIFIED_FULL_TEXT |

IN RFB nº 1.585/2015, art. 65, I (full text):

> **day-trade**, a operação ou a conjugação de operações iniciadas e encerradas
> em um mesmo dia, com o mesmo ativo, em uma mesma instituição intermediadora,
> em que a quantidade negociada tenha sido liquidada, total ou parcialmente;

Consequences:

- **Same broker required**: cross-broker same-day buy/sell is **not** day trade
  (fixture I → NOT day trade at the day-trade level).
- **Taxpayer-wide**: the day-trade _classification_ is per institution; the
  monthly apuração is per taxpayer (aggregating accounts/brokers for the monthly
  tax). This interaction is **PARTIAL** (see blockers).

### Day-trade matching algorithm — **UNRESOLVED**

The full text defines day trade conceptually ("quantidade negociada tenha sido
liquidada, total ou parcialmente") but does **not** prescribe a code-ready
pairing algorithm for partial cases. Not resolved by full text:

- fixture H (inventory 100, buy 50, sell 120) — exact day-trade vs normal split;
- fixture B (buy 100, sell 40, buy 50, sell 90);
- sale-before-buy same day;
- whether same-day purchases take priority over prior inventory.

> **BLOCKER A: day-trade matching algorithm is UNRESOLVED.** No production
> classifier may be implemented.

---

## 4. Loss segregation & carryforward

| Item             | Value                                                  | Authority                                       | Class              |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------- | ------------------ |
| Normal losses    | offset normal gains, same/subsequent months and years  | IN 1.585/2015, art. 64                          | VERIFIED_FULL_TEXT |
| Day-trade losses | offset **only day-trade** gains (same species)         | IN 1.585/2015, art. 64, § único + art. 65, § 10 | VERIFIED_FULL_TEXT |
| Cross-offset     | **forbidden** (normal ↛ day trade; day trade ↛ normal) | idem                                            | VERIFIED_FULL_TEXT |
| Carry horizon    | subsequent months, inclusive following calendar years  | IN 1.585/2015, art. 64                          | VERIFIED_FULL_TEXT |

IN RFB nº 1.585/2015, art. 64 (full text):

> ... as perdas incorridas nas operações de que tratam os arts. 27, 58 e 60 a 62
> poderão ser compensadas com os ganhos líquidos auferidos, no próprio mês ou
> nos meses subsequentes, inclusive nos anos-calendário seguintes, em outras
> operações realizadas em qualquer das modalidades operacionais previstas
> naqueles artigos, **exceto no caso de perdas em operações de day-trade, que
> somente serão compensadas com ganhos auferidos em operações da mesma
> espécie.**
> Parágrafo único. As perdas a que se refere este artigo **não poderão ser
> compensadas com ganhos em operações day-trade**.

IN RFB nº 1.585/2015, art. 65, § 10:

> As perdas incorridas em operações de day-trade somente poderão ser
> compensadas com os rendimentos auferidos em operações da mesma espécie,
> realizadas no mês...

> **RESOLVED:** segregation + carryforward direction/horizon.

### Exemption ↔ loss ordering — **UNRESOLVED**

Whether an **exempt** month consumes prior normal losses (fixture A/K) is not
resolved by the inspected full text. Nor is the exempt-month treatment of the
0,005% IRRF (fixture K).

> **BLOCKER B: exemption/loss ordering and exempt-month loss treatment are
> UNRESOLVED.**

---

## 5. IRRF (withholding)

| Item              | Value                                                                         | Authority                                                 | Class              |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| Normal operations | **0,005%** on the sale value (mercado à vista: "valor da alienação")          | Lei 11.033/2004, art. 2º, §1º, IV; IN 1.585/2015, art. 63 | VERIFIED_FULL_TEXT |
| De minimis        | retention waived when ≤ R$ 1,00 (monthly sum per person)                      | Lei 11.033/2004, art. 2º, §§ 4º-5º                        | VERIFIED_FULL_TEXT |
| Day trade         | **1%** on the day-trade result                                                | IN 1.585/2015, art. 65, caput                             | VERIFIED_FULL_TEXT |
| Credit use        | deducted in month; offset subsequent months; annual adjustment; capital gains | Lei 11.033/2004, art. 2º, §7º                             | VERIFIED_FULL_TEXT |
| Responsible       | intermediary/broker/exchange                                                  | Lei 11.033/2004, art. 2º, §6º                             | VERIFIED_FULL_TEXT |

IN RFB nº 1.585/2015, art. 65, caput:

> Os rendimentos auferidos em operações de day-trade ... sujeitam-se à
> incidência do imposto sobre a renda na fonte à alíquota de 1% (um por cento).

Lei nº 11.033/2004, art. 2º, §7º:

> O valor do imposto retido na fonte ... poderá ser: I - deduzido do imposto
> sobre ganhos líquidos apurados no mês; II - compensado com o imposto incidente
> sobre ganhos líquidos apurados nos meses subsequentes; III - compensado na
> declaração de ajuste se ... houver saldo de imposto retido; IV - compensado
> com o imposto devido sobre o ganho de capital na alienação de ações.

### IRRF in exempt month / credit segregation — **PARTIAL/UNRESOLVED**

- Whether normal IRRF can offset **day-trade** tax (and vice versa) is **not**
  explicitly resolved by the inspected text (loss segregation exists, but IRRF
  credit segregation is a distinct question).
- Exempt-month IRRF treatment (carry vs annual adjustment vs refund) is **not**
  fully resolved for the exempt scenario.

> **BLOCKER C: IRRF credit segregation and exempt-month treatment are
> PARTIAL/UNRESOLVED.**

---

## 6. Revenue code & payment composition — **UNRESOLVED**

Not yet confirmed from full official text:

- whether normal equity, day trade and FII sale all use revenue code **6015**;
- whether same-code liabilities compose **one combined DARF** or separate ones;
- how the R$ 10 minimum and 4E carry-forward apply across categories sharing a
  code.

> **BLOCKER D: revenue code and payment composition are UNRESOLVED.** (4C already
> verified 6015 for FII_SALE via ADE CORAT, but the equity/day-trade mapping and
> aggregation were not confirmed.)

---

## 7. Deadline / overdue / Sicalc

- Payment deadline for ganhos líquidos: last business day of the month following
  the apuração (consistent with the existing 4C direct deadline registry for
  6015). Exact statutory article not re-inspected in 4G.1 → **PARTIAL**.
- Overdue adjustment (4D) and official Sicalc handoff (4F) are generic and
  reusable, subject to the revenue-code/payment-composition blocker.

---

## 8. 2026 applicability

- Lei 11.033/2004, art. 2º annotations reference MP nº 1.184/2023, LC nº
  214/2025 and MP nº 1.303/2025 — the latter with "**Vigência encerrada**"
  (rejected), so the 15%/20% rates remain.
- Full audit of LC nº 214/2025 (reforma tributária) impacts on renda variável was
  **not** completed → **PARTIAL**.

---

## 9. Source matrix

| Rule                        | Source                     | Section                          | Class                                                | 2026       |
| --------------------------- | -------------------------- | -------------------------------- | ---------------------------------------------------- | ---------- |
| Normal rate 15%             | Lei 11.033/2004            | art. 2º, II                      | VERIFIED_FULL_TEXT                                   | applicable |
| Day-trade rate 20%          | Lei 11.033/2004            | art. 2º, I                       | VERIFIED_FULL_TEXT                                   | applicable |
| Exemption R$ 20.000         | Lei 11.033/2004            | art. 3º, I                       | VERIFIED_FULL_TEXT                                   | applicable |
| Threshold equality          | Lei 11.033/2004            | art. 3º, I ("igual ou inferior") | VERIFIED_FULL_TEXT                                   | applicable |
| Day-trade exclusion         | RFB Isenções + Lei 11.033  | page + art. 2º                   | VERIFIED_FULL_TEXT                                   | applicable |
| Day-trade definition        | IN RFB 1.585/2015          | art. 65, I                       | VERIFIED_FULL_TEXT                                   | applicable |
| Day-trade matching          | —                          | —                                | UNRESOLVED                                           | —          |
| Multi-broker boundary       | IN RFB 1.585/2015          | art. 65, I ("mesma instituição") | VERIFIED_FULL_TEXT (definition); aggregation PARTIAL | applicable |
| Loss segregation            | IN RFB 1.585/2015          | art. 64 + § único; art. 65, §10  | VERIFIED_FULL_TEXT                                   | applicable |
| Loss carry                  | IN RFB 1.585/2015          | art. 64                          | VERIFIED_FULL_TEXT                                   | applicable |
| IRRF normal 0,005%          | Lei 11.033/2004 + IN 1.585 | art. 2º, §1º, IV; art. 63        | VERIFIED_FULL_TEXT                                   | applicable |
| IRRF day trade 1%           | IN RFB 1.585/2015          | art. 65, caput                   | VERIFIED_FULL_TEXT                                   | applicable |
| IRRF exempt-month treatment | —                          | —                                | UNRESOLVED                                           | —          |
| Revenue code                | —                          | —                                | UNRESOLVED                                           | —          |
| Payment composition         | —                          | —                                | UNRESOLVED                                           | —          |
| Minimum-DARF interaction    | —                          | —                                | UNRESOLVED                                           | —          |
| Deadline                    | 4C registry (ADE CORAT)    | —                                | PARTIAL                                              | applicable |

---

## 10. Fixtures — status

| Fixture               | Status                                                     |
| --------------------- | ---------------------------------------------------------- |
| A normal exempt       | BLOCKED (exemption/loss ordering unresolved)               |
| B normal taxable      | Derivable once ordering resolved                           |
| C normal loss         | Derivable (art. 64)                                        |
| D loss offset         | Derivable (art. 64)                                        |
| E day-trade profit    | Derivable (20% + 1% IRRF)                                  |
| F day-trade loss      | Derivable (art. 65 §10)                                    |
| G cross-loss          | RESOLVED: prohibited (art. 64 § único)                     |
| H partial day trade   | BLOCKED (matching algorithm unresolved)                    |
| I multi-broker        | RESOLVED at definition level: NOT day trade across brokers |
| J exemption boundary  | RESOLVED: ≤ 20.000 exempt; 20.000,01 taxable               |
| K exempt + IRRF       | BLOCKED (IRRF exempt-month treatment unresolved)           |
| L payment composition | BLOCKED (revenue code/composition unresolved)              |

---

## 11. Unresolved items (mandatory blockers)

1. Day-trade partial matching algorithm (fixtures B/H, sale-before-buy).
2. Exemption ↔ loss ordering; exempt-month loss treatment.
3. Exempt-month IRRF treatment; IRRF credit segregation normal↔day trade.
4. Revenue code and payment composition (normal/day trade/FII; one DARF?).
5. Minimum-DARF/carry-forward interaction across same-code categories.
6. Full 2026 amendment audit (LC 214/2025) and exact deadline article.

---

## 12. Decision

Production activation is **not** authorized. Several mandatory semantics remain
`UNRESOLVED`/`PARTIAL`. No production code, schema, rule or UI change was made.

**PHASE 4G.1: NÃO APROVADA** — PHASE 4G IMPLEMENTATION MAY PROCEED: **NO**.

### Next research steps (for a follow-up)

- Full-text inspection of the operational day-trade matching guidance (RFB
  Perguntas e Respostas / ReVar manual sections on day trade and partial matches).
- RFB guidance on exemption vs loss ordering and exempt-month IRRF.
- Official revenue-code list (Sicalc/Sief) and DARF composition guidance for
  ganhos líquidos (normal + day trade) and FII.
- LC nº 214/2025 amendment audit.

---

# PHASE 4G.1A — Remaining Blockers Closure

Research date: **2026-09-30**. Continuation of the artifact above. Newly inspected
full texts: **IN RFB nº 1.585/2015** (arts. 56-65), **Lei nº 11.033/2004**
(arts. 2-3), **RFB "Bolsa de Valores"** and **"Cálculo e Pagamento do Imposto"**
pages, **RFB ReVar manual**.

## A. Day-trade partial matching — RESOLVED (VERIFIED_FULL_TEXT)

Controlling text: **IN RFB nº 1.585/2015, art. 65, §§ 1º-3º**.

> § 1º ... I - **day-trade**, a operação ou a conjugação de operações iniciadas e
> encerradas em um mesmo dia, com o mesmo ativo, em uma mesma instituição
> intermediadora, em que a quantidade negociada tenha sido liquidada, total ou
> parcialmente;
> II - **rendimento**, o resultado positivo apurado no encerramento das operações
> de day-trade.
> **§ 2º** Para efeitos do disposto neste artigo **não será considerado o valor
> ou a quantidade de estoque do ativo existente em data anterior** à da operação
> de day-trade.
> **§ 3º** Na apuração do resultado da operação de day-trade serão considerados,
> **pela ordem, o 1º negócio de compra com o 1º de venda ou o 1º negócio de venda
> com o 1º de compra, sucessivamente.**

Code-ready algorithm (deterministic):

1. Group by `(assetId, institution, tradeDate)` (same day, same asset, same
   institution).
2. Within the group, order executions chronologically (stable by timestamp/id).
3. Match buys and sells **FIFO** in chronological order (buy-vs-sell or
   sell-vs-buy, whichever occurs first) → matched quantity = day trade.
4. **Pre-existing inventory is excluded** (§2º): it does not participate in day
   trade.
5. Unmatched sells (sells exceeding same-day buys) are **normal** sales and reduce
   inventory; unmatched same-day buys (buys exceeding sells) are added to
   inventory at their acquisition cost.

LEGAL RULE: FIFO chronological same-day matching within institution/asset.
INPUTS: same-day buy/sell executions (asset, institution, timestamp, quantity,
price, costs). OUTPUT: day-trade legs + normal residual + inventory delta.
ORDERING: chronological. BOUNDARY: same asset + same institution + same day.
FAIL-CLOSED: unknown timestamp/ordering or missing institution → BLOCKED.

### Fixtures

- **Partial A** (inventory 100; same day buy 50, sell 120): day trade **50**,
  normal sale **70**, remaining inventory **30**. Reason: FIFO match of buy 50
  against the first 50 of the sell; residual 70 is a normal sale (inventory
  excluded from day trade per §2º).
- **Partial B** (buy 100, sell 40, buy 50, sell 90): day trade **130**, normal
  **0**, same-day buy leftover **20** added to inventory. Reason: b1↔s1 = 40; b1
  residual 60 ↔ s2 = 60; b2 30 ↔ s2 = 30 → 130 matched; b2 residual 20 stays.
- **Sale before buy** (inventory 100; sell 50 then buy 50 same day): **day trade
  50** — §3º explicitly matches "1º negócio de venda com o 1º de compra".
- **Multi-broker** (Broker A buy 100; Broker B sell 100, same day): **NOT day
  trade** (requires "mesma instituição intermediadora", §1º I).
- **Same broker / different accounts**: the unit is the **institution**
  (§1º I); accounts are not mentioned → treated as the same institution.
- **Same-day buy + sell with physical settlement via custody movement** → not day
  trade (art. 65, §6º).

**Day-trade matching: READY.**

## B. Exemption ↔ loss ordering — PARTIAL

- Exemption: **IN 1.585/2015, art. 59** ("se o total das alienações desse ativo,
  realizadas no mês, não exceder a R$ 20.000,00"); day trade excluded (art. 59,
  §2º, I).
- Art. 59, §1º: the PF is dispensed from filling the "Resumo de Apuração de
  Ganhos" for exempt alienações, **"exceto no caso de pretender compensar as
  perdas apuradas com ganhos auferidos em operações realizadas em bolsa sujeitas
  à incidência do imposto."**
- Interpretation supported by the text: exempt-month gains are exempt; loss
  compensation is a **taxpayer election** (the form is only required when the
  taxpayer intends to compensate losses). The text does **not** explicitly state
  whether an exempt-month positive result is mandatorily netted against prior
  losses, nor whether an exempt-month loss enters carryforward.
- **Remains PARTIAL.** Default model (documented, pending explicit rule): exempt
  gains do not consume prior losses; exempt-month losses are compensable only if
  declared (art. 59, §1º).

## C. IRRF credit & exempt month — RESOLVED (VERIFIED_FULL_TEXT / OFFICIAL_MANUAL)

- **Normal (0,005%)**: Lei 11.033/2004, art. 2º, §7º — may be (I) deducted from
  the month's gains tax; (II) offset against gains tax in subsequent months;
  (III) offset in the annual adjustment if a balance remains; (IV) offset against
  capital-gains tax on share alienation. RFB "Cálculo e Pagamento" example
  confirms `imposto − IRRF = imposto a pagar`.
- **Day trade (1%)**: IN 1.585/2015, art. 65, §8º (deduct from month; offset
  subsequent months) and §9º (year-end balance may be restituted). Withholding
  code **8468** (art. 65, §7º).
- **Exempt month**: with no tax due, the IRRF cannot be deducted in the month; it
  offsets subsequent months and, at year-end, the annual adjustment/restitution
  (normal: §7º III; day trade: §9º).
- **Segregation normal↔day trade**: normal and day-trade IRRF are tracked
  separately; whether normal IRRF may offset day-trade tax (and vice versa) is
  **not** explicitly stated → **PARTIAL**.

## D. Loss segregation & carry — RESOLVED (VERIFIED_FULL_TEXT)

- IN 1.585/2015, art. 64 + parágrafo único: normal losses offset normal gains in
  the same/subsequent months and following years; day-trade losses only offset
  day-trade gains; normal losses **cannot** offset day-trade gains.
- Art. 65, §§10-11: day-trade losses offset day-trade gains in the month;
  positive monthly result taxed at 20%; negative carries to subsequent months.

## E. Revenue code — RESOLVED (VERIFIED_OFFICIAL_MANUAL / FULL_TEXT)

- RFB "Cálculo e Pagamento do Imposto" (updated 19/11/2025): "O código a ser
  utilizado no DARF para pagamento desse imposto é **6015**" (equity gains,
  normal). 6015 = "Ganhos líquidos em operações em bolsa".
- FII sale: 6015 (already verified in 4C via ADE CORAT).
- Day-trade **tax** payment uses the same 6015 (the day-trade 1% **withholding**
  uses code 8468, art. 65, §7º — a withholding code, not the DARF payment code).

## F. Payment composition & minimum DARF — RESOLVED (VERIFIED_OFFICIAL_MANUAL)

RFB ReVar manual, "Pagamento" tab:

> os valores do imposto calculado para o mês de referência; **imposto de meses
> anteriores que sejam inferiores a R$ 10,00 ... somados aos próximos meses até
> completar o valor mínimo para geração de DARF**; ... imposto devido; juros;
> multa ...; valor a pagar. ... botão "Gerar DARF" ... com código de barras e
> QR-Code para pagamento via PIX.

- **One DARF per month** (per revenue code 6015), combining the tax groups
  (Geral, FII/Fiagro, ...), with the per-group breakdown preserved in the
  "Detalhamento" tab.
- **Minimum DARF applies to the monthly DARF total** (per code), not per
  category; below-R$10 monthly totals are added to subsequent months.
- Therefore **Phase 4E's same-revenue-code carry-forward rule is sufficient**:
  categories under code 6015 combine for the minimum/payment while internal
  category breakdown and category-level liability/loss segregation are preserved.
- **4E refinement NOT required.**

## G. Deadline — RESOLVED (VERIFIED_FULL_TEXT)

IN 1.585/2015, art. 56, §5º: "apurado por períodos mensais e pago ... até o
último dia útil do mês subsequente ao da apuração." RFB page confirms. The 4C
direct deadline registry (ADE CORAT) for 6015 is reusable.

## H. 2026 applicability — PARTIAL

- Rates/exemption/IRRF/loss/day-trade rules remain applicable; MP 1.303/2025
  annotations show "Vigência encerrada" (rejected) → 15%/20% stand.
- **LC nº 214/2025 (reforma tributária)** impact on renda variável was **not**
  fully audited → PARTIAL.

## I. Source matrix update

| Rule                              | Source                             | Section          | Class                    |
| --------------------------------- | ---------------------------------- | ---------------- | ------------------------ |
| Partial day-trade matching        | IN RFB 1.585/2015                  | art. 65, §§2º-3º | VERIFIED_FULL_TEXT       |
| Sale-before-buy                   | IN RFB 1.585/2015                  | art. 65, §3º     | VERIFIED_FULL_TEXT       |
| Same-institution boundary         | IN RFB 1.585/2015                  | art. 65, §1º, I  | VERIFIED_FULL_TEXT       |
| Exempt profit/prior loss          | IN RFB 1.585/2015                  | art. 59, §1º     | PARTIAL                  |
| Normal IRRF exempt-month          | Lei 11.033/2004 + IN 1.585         | art. 2º, §7º     | VERIFIED_FULL_TEXT       |
| Day-trade IRRF                    | IN RFB 1.585/2015                  | art. 65, §§7º-9º | VERIFIED_FULL_TEXT       |
| IRRF segregation normal↔day trade | —                                  | —                | PARTIAL                  |
| Revenue code normal               | RFB Cálculo e Pagamento            | page             | VERIFIED_OFFICIAL_MANUAL |
| Revenue code day trade            | IN 1.585 (withholding 8468) + 6015 | art. 65, §7º     | VERIFIED_OFFICIAL_MANUAL |
| Payment composition               | RFB ReVar manual                   | Pagamento tab    | VERIFIED_OFFICIAL_MANUAL |
| Minimum-DARF scope                | RFB ReVar manual                   | Pagamento tab    | VERIFIED_OFFICIAL_MANUAL |
| Deadline                          | IN RFB 1.585/2015                  | art. 56, §5º     | VERIFIED_FULL_TEXT       |
| LC214/2025 applicability          | —                                  | —                | PARTIAL                  |

## J. Remaining unresolved/partial items

1. Exemption ↔ prior-loss ordering (mandatory netting?) — PARTIAL.
2. IRRF credit segregation normal ↔ day trade — PARTIAL.
3. LC nº 214/2025 amendment audit — PARTIAL.

## K. Decision

The material blockers (day-trade matching, sale-before-buy, institution boundary,
loss segregation, revenue code, payment composition, minimum-DARF scope,
deadline, IRRF normal/day-trade) are now resolved from full text or official
manuals. Three items remain PARTIAL (exemption/loss ordering, IRRF segregation,
LC 214/2025 audit), so per the phase's strict approval rule this phase is **not**
approved yet. No production code was changed.

---

# PHASE 4G.1B — Final Three Legal Blockers Closure

Research date: **2026-09-30**. Newly inspected official pages: RFB
**"Compensações"** (04/06/2024) and **"Retenções"** (19/11/2025), RFB **ReVar
manual** ("Análise de Isenção"), and LC nº 214/2025 scope (Planalto / RFB).

## A. Exemption ↔ prior-loss ordering — PARTIAL

RFB **"Compensações"** (official):

> As perdas nas operações comuns poderão ser compensadas com os ganhos líquidos
> obtidos em outras operações, no próprio mês ou nos meses posteriores.
> **ATENÇÃO!** É proibido compensar perdas de um mês com ganhos obtidos em meses
> anteriores.
> Caso você pretenda compensar as perdas de períodos anteriores, deverá
> informá-las no Demonstrativo de Renda Variável ... no mês em que elas ocorreram
> e nos períodos seguintes, até a sua completa compensação.

- Confirms: loss carryforward to subsequent months; **no backward compensation**
  (a later loss cannot offset an earlier gain); compensation is elected by
  declaring it.
- The RFB pages/ReVar "Análise de Isenção" present the exemption decision
  ("Isento"/"Não Isento") but do **not** explicitly state whether an exempt-month
  positive result is netted against prior losses.
- **Remains PARTIAL.** Default model (documented): exempt gains do not consume
  prior losses; exempt-month losses are compensable only if declared.

## B. IRRF credit segregation — RESOLVED (VERIFIED_OFFICIAL_MANUAL)

RFB **"Retenções"** (updated 19/11/2025), full text:

> **Day trade**: retenção ... à alíquota de **1%** sobre o resultado líquido das
> operações desta modalidade realizadas no mesmo dia, podendo ser deduzido do
> imposto a ser pago sobre os ganhos líquidos apurados no mês **com operações day
> trade**.
> **Operações comuns**: retenção ... à alíquota de **0,005%** sobre o valor da
> venda, como antecipação, podendo ser deduzido do imposto a ser pago sobre os
> ganhos líquidos apurados no mês.

> **Imposto Retido nas Operações Comuns**: deduzido do imposto sobre os ganhos
> líquidos apurados no mês; compensado com o imposto sobre ganhos líquidos
> apurados nos meses posteriores; compensado na declaração de ajuste anual se
> ainda houver saldo.
> **Imposto Retido nas Operações Day Trade**: deduzido do imposto a ser pago
> sobre os ganhos líquidos apurados **com day trade** no mês; compensado com o
> imposto incidente sobre os ganhos líquidos apurados **com day trade** nos meses
> posteriores se, **até o mês de dezembro do mesmo ano da retenção**, ainda
> houver saldo; ... restituição. **O valor do imposto retido na fonte sobre
> operações day trade somente pode ser compensado até o mês de dezembro do mesmo
> ano da retenção.**

Code-ready matrix:

| Credit source        | normal equity                 | day trade              | FII             | carry horizon                                                            |
| -------------------- | ----------------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------ |
| Normal IRRF (0,005%) | YES                           | NO (category-isolated) | NO              | same month → subsequent months → annual adjustment                       |
| Day-trade IRRF (1%)  | NO (explicit "com day trade") | YES                    | NO              | same month → subsequent months → **December of same year** → restitution |
| FII withholding      | NO                            | NO                     | YES (FII group) | within FII group                                                         |

- Cross-category offset is **forbidden**: day-trade IRRF only offsets day-trade
  tax; normal IRRF offsets normal-operation tax (the explicit day-trade
  restriction makes the pools non-interchangeable).
- Basis: Lei 11.033/2004, art. 2º, §7º; IN 1.585/2015, art. 65, §§7º-9º; RFB
  "Retenções".
- **Blocker B: READY.**

## C. 2026 applicability / LC 214/2025 — PARTIAL

- **LC nº 214/2025** is the **consumption-tax reform** (IBS/CBS/IS); its scope is
  indirect taxation, not IR on ganhos líquidos. No article altering the 15%/20%
  rates, the R$20k exemption, day-trade matching, loss segregation, IRRF, code
  6015, payment composition, minimum DARF or deadline was identified.
- The 2025 IR changes for individuals (exemption up to R$ 5.000/month; high-income
  taxation) came from **Lei nº 15.270/2025** (converted from PL 1.087/2025), which
  targets income/dividends — **not** ganhos líquidos.
- RFB "Isenções"/"Cálculo e Pagamento"/"Retenções" pages remain current (2024/2025)
  and reflect the active treatment.
- **PARTIAL:** the LC 214/2025 full text could not be fully inspected (page exceeds
  fetch limits); the conclusion is scope-based (consumption reform), not an
  article-by-article audit.

## D. Updated source matrix

| Rule                        | Source                              | Section                 | Class                     |
| --------------------------- | ----------------------------------- | ----------------------- | ------------------------- |
| Exempt profit vs prior loss | RFB Compensações + IN 1.585 art. 59 | page / §1º              | PARTIAL                   |
| Exempt loss carryforward    | RFB Compensações                    | page                    | PARTIAL                   |
| Compensation election       | RFB Compensações                    | page                    | VERIFIED_OFFICIAL_MANUAL  |
| Normal IRRF credit scope    | RFB Retenções + Lei 11.033          | page / art. 2º, §7º     | VERIFIED_OFFICIAL_MANUAL  |
| Day-trade IRRF credit scope | RFB Retenções + IN 1.585            | page / art. 65, §§7º-9º | VERIFIED_OFFICIAL_MANUAL  |
| IRRF carry horizon          | RFB Retenções                       | page                    | VERIFIED_OFFICIAL_MANUAL  |
| LC 214/2025                 | Planalto / RFB                      | scope                   | PARTIAL                   |
| Post-2025 amendments        | Lei 15.270/2025                     | income/dividends        | VERIFIED_OFFICIAL_EXCERPT |

## E. Final fixtures

- A exempt profit + prior loss: exempt YES; loss consumed **NO (default)**;
  ending loss 5.000; normal IRRF offsets future normal tax. (PARTIAL)
- B exempt loss: new deductible loss 2.000 (PARTIAL).
- C normal IRRF 3 vs day-trade tax 100: offset **NO** (day-trade tax only offset
  by day-trade IRRF).
- D day-trade IRRF 10 vs normal tax 50: offset **NO**.
- E normal IRRF 3 vs FII tax 40: offset **NO**.
- F normal 25 + day-trade 40 + FII 30: category credits applied **before** 6015
  aggregation; final 6015 DARF = Σ(tax due after each category's own IRRF).

## F. Remaining unresolved/partial

1. Exemption ↔ prior-loss netting ordering — PARTIAL.
2. LC nº 214/2025 full-text article audit — PARTIAL.

## G. Decision

Blocker B (IRRF segregation) is now resolved. Blockers A (exemption/loss netting)
and C (LC 214/2025 full-text audit) remain PARTIAL. Per the strict approval rule,
Phase 4G.1B is **not** approved. No production code was changed.

---

# PHASE 4G.1C — Final Exemption/Loss & 2026 Applicability Closure

Research date: **2026-09-30**. Full-text audit of **LC nº 214/2025** (Planalto,
5,402,213 bytes fetched and searched in-runtime) plus RFB manual/guidance.

## A. Exemption ↔ prior loss — RESOLVED as ELECTION (VERIFIED_OFFICIAL_MANUAL)

Basis: **IN RFB nº 1.585/2015, art. 59, §1º** + RFB "Compensações"/"Isenções".

> Art. 59, §1º ... a pessoa física fica dispensada de preencher, no formulário
> "Resumo de Apuração de Ganhos - Renda Variável", informações sobre as
> alienações isentas realizadas no ano-calendário, **exceto no caso de pretender
> compensar as perdas apuradas com ganhos auferidos em operações realizadas em
> bolsa sujeitas à incidência do imposto.**

Code-ready semantics:

- The R$ 20.000 exemption applies to the **month's positive result** (gains) of
  normal operations. Day trade is never exempt (art. 59, §2º, I).
- **Exempt-month gain**: prior normal losses are **not consumed** by default
  (there is no taxable base to absorb them); the loss balance is preserved.
- **Exempt-month loss**: recognized as normal-operation carryforward **only when
  the taxpayer elects to declare** the exempt operations (art. 59, §1º); default
  preserves the loss for future declared/taxable periods.
- **Taxable-month** (> R$20.000): current-month netting, then prior-loss
  compensation (same category), then tax at 15%.
- **No backward compensation** (RFB "Compensações"): a later loss cannot offset an
  earlier gain.

Ordering (normal equities):

1. aggregate gross sales of ações (normal) in the month;
2. compute monthly normal gain/loss (net of deductible costs);
3. exemption evaluation: gross sales ≤ R$ 20.000 → gain exempt;
4. loss handling: exempt → no prior-loss consumption (default), exempt loss only
   if elected; taxable → apply prior normal losses;
5. tax = max(0, taxable base) × 15% (normal) or 20% (day trade);
6. subtract the category's own IRRF credit;
7. carry remaining loss and remaining IRRF forward.

**Blocker A: READY (ELECTION).** Production-safe default: preserve prior losses;
do not recognize/consume exempt-month amounts unless the taxpayer elects.

### Fixtures

- **A** prior loss 5.000; sales 18.000; profit 2.000 → exempt YES; prior loss
  consumed **NO**; ending loss **5.000**; tax **0**; election required for any
  loss use.
- **B** prior loss 5.000; sales 25.000; profit 2.000 → taxable; prior loss used
  **2.000**; ending loss **3.000**; tax base **0**; tax **0**.
- **C** sales 18.000; loss 2.000 → exempt month; new carryforward **only if
  elected**; default preserved (not recognized).
- **D** sales 25.000; loss 2.000 → taxable month; new carryforward **2.000**.

## B. 2026 applicability — RESOLVED (VERIFIED_FULL_TEXT for LC 214)

Full-text audit of **LC nº 214/2025** (searched the entire 5.4 MB text):

| Term                                         | Occurrences in LC 214/2025                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "renda variável"                             | none                                                                                                                                                                                |
| "ganhos líquidos"                            | none                                                                                                                                                                                |
| "day trade" / "day-trade"                    | none                                                                                                                                                                                |
| "mercado de capitais"                        | none                                                                                                                                                                                |
| "operações em bolsa"                         | none                                                                                                                                                                                |
| "IRPF" / "imposto de renda da pessoa física" | none                                                                                                                                                                                |
| "8.981" (Lei 8.981/1995)                     | none                                                                                                                                                                                |
| "mercado financeiro"                         | only IBS/CBS taxpayer scope (financial infrastructure entities)                                                                                                                     |
| "ganho de capital"                           | only real-estate IBS/CBS adjustment                                                                                                                                                 |
| "11.033" (Lei 11.033/2004)                   | **art. 511 amends art. 14 (REPORTO/IPI/PIS/COFINS)**; revocation list revokes **art. 14, §2º and art. 17** (REPORTO). **Arts. 2º (rates/IRRF) and 3º (exemption) are NOT touched.** |

- **LC 214/2025 affects Phase 4G: NO.** It is the consumption-tax reform
  (IBS/CBS/IS); its only Lei 11.033/2004 changes are REPORTO-related.
- **MP nº 1.303/2025**: lapsed/rejected ("Vigência encerrada"); no surviving
  provision affecting rates/exemption/IRRF/losses.
- **Lei nº 15.270/2025** (from PL 1.087/2025): individual IR exemption up to
  R$ 5.000/month and high-income/dividend taxation — **not** ganhos líquidos.
- RFB operational pages remain current (2024/2025) and corroborate the treatment.

**Blocker B: READY.**

## C. Updated source matrix

| Rule                              | Authority                                      | Class                     |
| --------------------------------- | ---------------------------------------------- | ------------------------- |
| Exempt gain vs prior loss         | IN 1.585/2015, art. 59, §1º + RFB Compensações | VERIFIED_OFFICIAL_MANUAL  |
| Exempt loss carryforward          | IN 1.585/2015, art. 59, §1º (election)         | VERIFIED_OFFICIAL_MANUAL  |
| Compensation election             | IN 1.585/2015, art. 59, §1º                    | VERIFIED_OFFICIAL_MANUAL  |
| LC 214/2025                       | full text (Planalto)                           | VERIFIED_FULL_TEXT        |
| MP 1.303/2025                     | Planalto (vigência encerrada)                  | VERIFIED_OFFICIAL_EXCERPT |
| Lei 15.270/2025                   | Planalto                                       | VERIFIED_OFFICIAL_EXCERPT |
| 2026 RFB operational confirmation | RFB Bolsa de Valores / Retenções               | VERIFIED_OFFICIAL_MANUAL  |

## D. Implementation impact (research only)

- `TaxCompensationElection` required: **YES** (to make exempt-month loss
  recognition/compensation deterministic).
- Persisted user decision required: **YES** (taxpayer election per exempt month).
- 4E change required: **NO**.
- 4F change required: **NO**.
- 4C change required: **NO**.

## E. Final implementation readiness

| Concern             | Ready            | Production rule                                              |
| ------------------- | ---------------- | ------------------------------------------------------------ |
| day-trade matching  | READY            | FIFO chronological, same day/asset/institution               |
| exemption           | READY            | gross sales ≤ R$ 20.000 → gain exempt                        |
| loss ordering       | READY            | exempt: no consumption (default); taxable: prior-loss offset |
| exempt-loss carry   | READY (ELECTION) | recognized only if declared                                  |
| normal IRRF         | READY            | 0,005%; offsets normal tax; carry + annual adjustment        |
| day-trade IRRF      | READY            | 1%; offsets day-trade tax; carry to December; restitution    |
| IRRF segregation    | READY            | no cross-category offset                                     |
| revenue code        | READY            | 6015                                                         |
| payment composition | READY            | one monthly DARF per code 6015                               |
| minimum DARF        | READY            | applied to monthly code total                                |
| deadline            | READY            | last business day of following month                         |
| 2026 applicability  | READY            | LC 214 does not alter target rules                           |

## F. Decision

Both final blockers are closed: exemption/loss interaction is resolved as an
explicit **election** (IN 1.585/2015, art. 59, §1º) with a production-safe
default, and LC nº 214/2025 is **full-text audited** with no impact on any Phase
4G target rule. Phase 4G legal semantics are READY for implementation. No
production code was changed.
