# Phase 4E — Minimum DARF & same-revenue-code carry-forward (official sources)

Research date: **2026-09-29** · Activated bucket: **FII_SALE** · revenue code **6015**.

Full text inspected: **YES** (controlling rule) · 2026 applicability: **VERIFIED** ·
6015 applicability: **VERIFIED**.

## 1. Controlling rule (minimum payment threshold)

A federal tax/contribution administered by the RFB, collected under a given
revenue code, that in an apuração period results in an amount **strictly below
R$ 10,00** must **not** be paid/collected through a DARF. It must be added to the
tax of the **same revenue code** in the **subsequent period(s)** until the total
is **equal to or greater than R$ 10,00**, at which point it is paid/collected by
the deadline established in law **for that last apuração period**.

### Lei nº 9.430/1996, art. 68 (full text)

> **Art. 68.** É vedada a utilização de Documento de Arrecadação de Receitas
> Federais para o pagamento de tributos e contribuições de valor inferior a
> R$ 10,00 (dez reais).
>
> **§ 1º** O imposto ou contribuição administrado pela Secretaria da Receita
> Federal, arrecadado sob um determinado código de receita, que, no período de
> apuração, resultar inferior a R$ 10,00 (dez reais), deverá ser adicionado ao
> imposto ou contribuição **de mesmo código**, correspondente aos **períodos
> subsequentes**, até que o total seja **igual ou superior** a R$ 10,00 (dez
> reais), quando, então, será pago ou recolhido **no prazo estabelecido na
> legislação para este último período de apuração**.

Source: https://www.planalto.gov.br/ccivil_03/leis/l9430.htm#art68

### IN SRF nº 82/1996 (DOU 31/12/1996) — full text

> **Art. 1º** Fica vedada a utilização de Documento de Arrecadação de Receitas
> Federais para pagamento de tributos e contribuições de valor inferior a
> R$ 10,00 (dez reais).
>
> **Art. 2º** Quando da apuração de qualquer tributo ou contribuição,
> administrados pela Secretaria da Receita Federal, resultar valor a recolher
> inferior ao limite mínimo mencionado no artigo 1º, este deverá ser adicionado
> ao valor correspondente ao **mesmo código de receita**, referente ao período de
> apuração subsequente, quando, então, será pago ou recolhido **no prazo
> estabelecido na legislação para este último período de apuração**.

Source: IN SRF nº 82/1996 (LegisWeb, AnvisaLegis; published DOU 31/12/1996).

### Decreto nº 9.580/2018 (RIR/2018), art. 757, §§ 4º-5º — full text

> **§ 4º** É vedada a utilização de DARF para o pagamento de imposto sobre a
> renda de valor inferior a R$ 10,00 (dez reais) (Lei nº 9.430, de 1996, art.
> 68, **caput**).
>
> **§ 5º** O imposto sobre a renda arrecadado sob determinado código de receita,
> que, no período de apuração, resultar em valor inferior a R$ 10,00 (dez
> reais), deverá ser adicionado ao imposto sobre a renda **do mesmo código**,
> correspondente aos **períodos subsequentes**, até que o total seja igual ou
> superior a R$ 10,00 (dez reais), quando, então, será pago ou recolhido no prazo
> estabelecido na legislação para esse último período de apuração (Lei nº 9.430,
> de 1996, art. 68, § 1º).

Source: Decreto nº 9.580/2018, art. 757, §§ 4º-5º (RIR/2018).

### IN RFB nº 1.500/2014, art. 100, §§ 2º-3º (IRPF — restates the rule)

> **§ 2º** É vedada a utilização de Documento de Arrecadação de Receitas
> Federais (Darf) para o pagamento de tributos de valor inferior a R$ 10,00
> (dez reais).
>
> **§ 3º** O imposto devido que, no período de apuração, resultar em valor
> inferior a R$ 10,00 (dez reais) deve ser adicionado ao imposto de mesmo código,
> correspondente aos períodos subsequentes, até que o total seja igual ou
> superior a R$ 10,00 (dez reais), quando, então, deve ser pago ou recolhido no
> prazo estabelecido na legislação para este último período de apuração.

## 2. Current (2026) applicability

- `art. 68` is **not repealed**: it remains in the compiled Lei nº 9.430/1996 and
  is restated by the current RIR/2018 (art. 757, §§ 4º-5º) and IN RFB
  nº 1.500/2014 (art. 100, §§ 2º-3º).
- The RFB official page "Darf — Cálculo e impressão — Programa Sicalc"
  (updated **29/09/2026**) still states the rule and links IN SRF nº 82/1996.
- **Verdict: VERIFIED for 2026** (no repeal / amendment / replacement found).

## 3. Revenue code 6015 applicability

- The rule applies to "qualquer tributo ou contribuição **administrados pela
  Secretaria da Receita Federal**", collected under a revenue code.
- Revenue code **6015** ("Ganhos líquidos em operações em bolsa") is IRPF
  administered by the RFB.
- The RFB **Manual de utilização do ReVar — Renda Variável** (official, gov.br)
  explicitly documents the rule for bolsa:
  - "**Abaixo de R$ 10,00**: quando o valor a pagar é menor do que R$ 10,00 (dez
    reais), que é o mínimo passível de recolhimento por DARF pela legislação."
  - "Pagamento: imposto de meses anteriores que sejam inferiores a R$ 10,00
    (dez reais) e que serão somados aos próximos meses até completar o valor
    mínimo para geração de DARF."
  - "Caso o imposto apurado pelo ReVar seja inferior ao valor mínimo permitido
    para recolhimento, equivalente a R$ 10,00 (dez reais), este será adicionado
    ao montante a ser recolhido nos meses subsequentes até completar o referido
    valor."
- **Verdict: VERIFIED for 6015** (explicit source chain:
  `6015 → IR ganhos líquidos em bolsa → tributo administrado pela RFB →
Lei 9.430/96 art. 68 + ReVar/Renda Variável`).

## 4. Threshold comparison semantics

From the full text: below-minimum is `amount < R$ 10,00` ("inferior a") and
payable is `amount >= R$ 10,00` ("igual ou superior"). **Equality is payable.**

## 5. Carry-forward semantics

1. A sub-minimum amount is **not payable** and is **not discarded**; it is added
   to the **same revenue code** of the **subsequent apuração period(s)**.
2. It accumulates over multiple periods until the total is `>= R$ 10,00`.
3. **Same revenue code is mandatory** ("de mesmo código"); no cross-code netting.
4. The original competence identity is preserved (the deferred amount is a
   historical fact, auditable to its source obligation).

## 6. Due-date semantics (officially resolved)

The full text states the accumulated amount is paid/collected
"**no prazo estabelecido na legislação para este último período de apuração**"
(IN SRF 82/1996, art. 2º) / "para esse último período de apuração" (RIR/2018,
art. 757, § 5º). Therefore:

- The aggregated payment's due date is the deadline of the **last (target)
  competence** — i.e. the period in which the running total reaches the
  minimum — sourced from the 4C direct official deadline registry.

## 7. Late-charge interaction (officially resolved)

- Because the payment deadline is the **last period's** deadline, a validly
  deferred amount does **not** accrue multa/juros while it remains below the
  minimum: the collection obligation only matures at that last deadline
  (ADR-282). The RFB's own ReVar manual simply accumulates the prior months'
  amounts without adding late charges.
- If the **aggregated** payment is late (payment after the last competence's
  deadline), ordinary 4D adjustment would apply from that deadline. Phase 4E
  **fails closed** for late settlement of an aggregated amount because the 4D
  late-fee authority (Sicalc snapshot) is keyed to a principal amount and no
  snapshot exists for the aggregated amount yet
  (`TAX_PAYMENT_AGGREGATION.LATE_ADJUSTMENT_UNAVAILABLE`).
- Ordering: the current competence's amount is combined **gross** (before any
  adjustment) because validly deferred amounts are not late; adjustment, when
  applicable, applies to the aggregated total from the last competence deadline.

## 8. Known limitations

- Only `FII_SALE` / **6015** is production-supported. Other revenue codes fail
  closed (`MISSING_MINIMUM_RULE`).
- The minimum is encoded as an exact decimal string (`"10"`, BRL); the rule is
  effective-dated (`1997-01-01`, open-ended).
- A carry-only total can never reach the minimum under the verified semantics
  (the running total only reaches it when a current period contributes); the
  eligibility model still supports a null-current payable for robustness.
- Late settlement of an aggregated amount is blocked pending official
  snapshots (see §7).
- No official DARF generation, no barcode/QR/PIX, no auto-payment, no bank
  integration, no annual IRPF, no tax AI (provider 0), no tax optimization.

## 9. Source list

| Source                       | Reference                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Lei nº 9.430/1996, art. 68   | https://www.planalto.gov.br/ccivil_03/leis/l9430.htm#art68                                                                                   |
| IN SRF nº 82/1996, arts. 1-2 | DOU 31/12/1996                                                                                                                               |
| Decreto nº 9.580/2018 (RIR)  | art. 757, §§ 4º-5º                                                                                                                           |
| IN RFB nº 1.500/2014         | art. 100, §§ 2º-3º                                                                                                                           |
| RFB Sicalc (page 29/09/2026) | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/darf-calculo-e-impressao-programa-sicalc-1 |
| RFB ReVar — Renda Variável   | https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/manual                                        |
