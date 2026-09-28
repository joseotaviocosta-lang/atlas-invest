# Phase 4B.5 — Verified Production Tax Rules (FII_SALE)

Research date: **2026-09-28**
Activated bucket: **FII_SALE** (alienação/resgate de cotas de Fundo de Investimento Imobiliário).

## Official sources

| Topic                            | Authority              | Document                                            | Provision                                                                         | Effective    | Current 2026? |
| -------------------------------- | ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- | ------------ | ------------- |
| FII quota gain rate 20%          | Presidência (Planalto) | Lei nº 8.668/1993, art. 18 (red. Lei nº 9.779/1999) | gains on FII quota alienação/resgate taxed at 20%                                 | 1999 →       | YES           |
| FII gain rate / base (normative) | Receita Federal        | IN RFB nº 1.585/2015, art. 37                       | gains/rendimentos on FII quota alienação/resgate at 20%                           | 2015-09-01 → | YES           |
| FII loss bucket isolation        | Receita Federal        | IN RFB nº 1.585/2015, art. 37, § 2º                 | FII losses may only be offset against gains of FII quotas (same espécie)          | 2015-09-01 → | YES           |
| No FII exemption                 | Receita Federal        | Mafon (IRRF) / IN 1.585 arts. 35–40                 | the R$ 20.000 monthly exemption applies only to mercado à vista de ações, not FII | —            | YES           |
| 0,005% IRRF (mercado à vista)    | Presidência (Planalto) | Lei nº 11.033/2004, art. 2º, § 1º                   | 0,005% IRRF on alienação value, creditable against the monthly tax                | 2005 →       | YES           |

Retrieved via Planalto (official consolidated legislation), Receita Federal official
search results and the official gov.br Mafon publication. IN RFB 1.585/2015 full text
was corroborated through official Receita excerpts; the provisions above are the
controlling ones for the activated bucket.

## 2025→2026 transition

- **MP nº 1.303/2025**: lapsed (Planalto marks "Vigência encerrada"); no lasting effect on IR on renda variável/FII.
- **LC nº 214/2025** (tax-reform regulation): Planalto shows it only as a "Vide" cross-reference on Lei 11.033/2004, **not** as an amending act ("Redação dada"); the IR provisions of Lei 11.033/2004 remain as last amended by Lei 14.754/2023 / Lei 14.130/2021. Conclusion: LC 214/2025 does not change the monthly income-tax treatment of FII quota gains.

## Encoded interpretation (rule `BR-FII-SALE-20-2015`)

- Rate: **20%** of the taxable realized gain.
- Loss compensation: **bucket-isolated** (FII losses only offset FII gains).
- Exemption: **none**.
- Withholding: the canonical 0,005% IRRF (mercado à vista) is applied **only from the canonical persisted input**; if absent, the result is **PARTIAL** (never estimated, never overstated).
- Effective from: **2015-09-01** (IN RFB 1.585/2015).

## Known limitations

- Day trade is not a distinct FII bucket (no separate FII day-trade rule in the verified sources).
- No exemption threshold is modeled for FII (correctly, per official sources).
- Withholding carryforward of excess credit is not modeled (excess is simply not applied).
- BRAZILIAN_EQUITY, ETF, BDR, FIXED_INCOME and FII income remain **unsupported** (fail closed).
