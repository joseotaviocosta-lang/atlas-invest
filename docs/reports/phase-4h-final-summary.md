# Project Atlas — Phase 4H Final Program Summary

## Annual IRPF Reporting & Declaration Support Program

---

## 1. Executive Program Overview

Phase **4H** establishes the comprehensive, pure, deterministic, and legally compliant **Annual IRPF Reporting & Declaration Support Pipeline** for Project Atlas.

Atlas supports the investor in preparing and checking their annual Brazilian income tax declaration (DIRPF / Ajuste Anual) without ever compromising security, data integrity, or regulatory boundaries.

---

## 2. Canonical Checkpoint Ancestry

```text
Phase 4G Approved:
  f622d94b1a9cd6c940697f2af6565b29ead72ce8
  ↓
Phase 4H.1 Approved:
  07dbea129b1743795145cecadb4955726f42cb67
  ↓
Phase 4H.2 Approved:
  2b26d36
  ↓
Phase 4H.3 Approved:
  4f87c81699acdffa0f6064410385e5b61130006f
  ↓
Phase 4H.4 Approved:
  1fd4c7f34fd387dae0512002581044e7552fa8ca
  ↓
Phase 4H.5 Approved:
  4d703178a71dadf85e710b7ae4ee48689e8a2bac
  ↓
Phase 4H.6 Approved:
  b189c5e455a627ed0b78e51fa8d6853e07a56c5e
  ↓
Phase 4H.7 Approved:
  5637749d810ab14a9aa786140ae378744618c130
  ↓
Phase 4H.7A Approved (Final Closure):
  [Current HEAD]
```

---

## 3. Supported & Unsupported Domains

### Supported Domains:

1. **Year-End Positions (Bens e Direitos)**:
   - Brazilian Equities (Code `03-01`)
   - Real Estate Funds / FII (Code `07-03`)
   - Fiagros (Code `07-02`)
   - BDRs (Code `04-04`)
   - ETFs (Code `07-09`)
   - Fully sold positions (`closingQuantity = 0`, `closingTotalCost = 0.00`)
2. **Exempt & Non-Taxable Income (Rendimentos Isentos e Não Tributáveis)**:
   - Equity Dividends (Code `09`)
   - 2026 Transition Dividends (Code `09`)
   - FII Monthly Earnings (Code `26`)
   - Fiagro Monthly Earnings (Code `26`)
   - Exempt Capital Gains under R$ 20k threshold (Code `20`)
3. **Exclusive / Definitive Withholding Income (Rendimentos Sujeitos à Tributação Exclusiva/Definitiva)**:
   - Juros sobre Capital Próprio / JCP (Code `10`, 15% IRRF)
   - 2026 Ordinary Dividends > R$ 50k threshold (Provisional Code `TRIB_EXCL_DIV_2026`, 10% IRRF under Lei 15.270/2025)
4. **Variable Income Monthly Grid (Renda Variável — Operações Comuns / Day Trade / FII)**:
   - Monthly net gain/loss consolidation
   - Accumulated loss carry-forwards
   - IRRF withholding credits and terminal balances (restitution vs compensation)
   - DARF 6015 payments and open liabilities
5. **Annual Tax Readiness Assessment**:
   - 9-section completeness and verification audit
   - Evidence requirements (FII compliance, dividend transition proof, opening cost basis confirmation)
   - Taxpayer confirmation persistence with deterministic source fingerprinting and stale invalidation
6. **Conference Package & CSV Export**:
   - Structured JSON API endpoints and pure human-readable semicolon-delimited CSV export
   - Formula injection defense for spreadsheet programs (`=`, `+`, `-`, `@`, `\t`, `\r` escaping)

### Explicit Non-Scope / Boundaries:

- **NO Receita Federal Submission / DIRPF Transmission**: Atlas is purely auxiliary and conference-oriented.
- **NO GOV.BR / e-CAC Automation / CAPTCHA Automation / Credential Storage**.
- **NO Final Global Annual IRPF Engine / Refund Calculation / High-Income Minimum Tax**.
- **NO Tax AI**: 0 external AI / LLM provider calls for tax calculations.
- **NO Float Conversions (Zero Floats)**: All monetary and quantity calculations are exact arbitrary-precision decimals.

---

## 4. Verification Matrix Summary

- `pnpm test:tax-engine`: 42 files, 424 tests (100% PASS)
- `pnpm test:fiscal-api`: 37 files, 237 tests (100% PASS)
- `pnpm test` (root monorepo): 178 files, 897 tests (100% PASS)
- `pnpm typecheck`: 21/21 packages (100% PASS)
- `pnpm format:check`: 100% PASS
- `pnpm lint`: 0 errors / 0 warnings (100% PASS)
- `pnpm validate:foundation`: 117 E2E tests + Next.js build (100% PASS)
- `pnpm validate:portfolio-engine-rc`: 100% PASS

---

## 5. Final Program Status

**PHASE 4H: APROVADA DEFINITIVAMENTE.**
