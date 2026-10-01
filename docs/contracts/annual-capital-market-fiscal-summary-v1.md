# Contract: Annual Capital Market Fiscal Summary v1

**Phase:** 4H.3  
**Resource:** `/api/v1/fiscal/annual/:calendarYear/capital-market`  
**Purpose:** Provide the authoritative, deterministic annual aggregation of monthly capital-market fiscal results (normal equities, day trade, FII, loss continuity, 6015 obligations) for DIRPF filing.

---

## 1. Domain Principles & Tax Invariants

1. **Zero Monthly Recomputation:**
   - The annual summary consumes approved monthly fiscal results and aggregates them chronologically across 12 calendar months (`January` to `December`).
   - Rates (15% normal, 20% day trade / FII) and the R$ 20,000 equity exemption threshold are applied exclusively at monthly granularity.
2. **Loss Carry Continuity:**
   - Opening loss on January 1st + Losses Incurred - Losses Compensated = Closing loss on December 31st.
   - Closing loss on December 31st of Year N is the exact opening loss on January 1st of Year N+1.
   - Losses never cross categories (Equities Normal, Day Trade, and FII remain strictly segregated).
3. **IRRF Terminal Year-End States:**
   - Uncompensated IRRF for Normal Equities terminates as `AVAILABLE_FOR_ANNUAL_ADJUSTMENT` (deductible on DIRPF).
   - Uncompensated IRRF for Day Trade terminates as `AVAILABLE_FOR_RESTITUTION` (restitution / PER/DCOMP).
   - Monthly IRRF pools reset to zero at the calendar year boundary.
4. **Exact Decimal Arithmetic:**
   - All financial amounts are arbitrary precision decimals (`Money` with `decimal.js`).
   - Strings in JSON representations (`"1234.56"`).
5. **Deterministic Replay & Security:**
   - Output contains SHA-256 fingerprint of the canonical summary.
   - Anti-enumeration: returns 404 for resources belonging to another user.

---

## 2. API Specifications

### `GET /api/v1/fiscal/annual/:calendarYear/capital-market`

**Path Parameters:**

- `calendarYear`: integer between 1900 and 2100.

**Response `200 OK`:**

```json
{
  "data": {
    "calendarYear": 2025,
    "declarationExercise": 2026,
    "taxSubjectId": "usr_123",
    "currency": "BRL",
    "isComplete": true,
    "qualityIssues": [],
    "months": [
      {
        "competence": "2025-01",
        "month": 1,
        "normalEquities": {
          "grossSaleAmount": "15000.00",
          "isExempt": true,
          "profitOrLoss": "2500.00",
          "lossCompensated": "0.00",
          "taxableBase": "0.00",
          "irrfDeducted": "0.00",
          "taxDue": "0.00"
        },
        "dayTrade": {
          "grossSaleAmount": "0.00",
          "isExempt": false,
          "profitOrLoss": "0.00",
          "lossCompensated": "0.00",
          "taxableBase": "0.00",
          "irrfDeducted": "0.00",
          "taxDue": "0.00"
        },
        "fii": {
          "grossSaleAmount": "0.00",
          "isExempt": false,
          "profitOrLoss": "0.00",
          "lossCompensated": "0.00",
          "taxableBase": "0.00",
          "irrfDeducted": "0.00",
          "taxDue": "0.00"
        },
        "totalTaxDue": "0.00",
        "darf6015": {
          "obligationId": null,
          "status": "EXEMPT",
          "principalAmount": "0.00",
          "paidAmount": "0.00"
        }
      }
    ],
    "normalEquities": {
      "totalGrossSales": "180000.00",
      "totalExemptProfits": "25000.00",
      "totalTaxableProfits": "15000.00",
      "totalLossesIncurred": "3000.00",
      "totalLossesCompensated": "3000.00",
      "totalNetTaxableBase": "12000.00",
      "totalTaxDue": "1800.00",
      "totalIrrfDeducted": "9.00",
      "uncompensatedIrrf": "0.00",
      "uncompensatedIrrfTerminalState": "AVAILABLE_FOR_ANNUAL_ADJUSTMENT"
    },
    "dayTrade": {
      "totalGrossProfits": "5000.00",
      "totalLossesIncurred": "1000.00",
      "totalLossesCompensated": "1000.00",
      "totalNetTaxableBase": "4000.00",
      "totalTaxDue": "800.00",
      "totalIrrfDeducted": "50.00",
      "uncompensatedIrrf": "0.00",
      "uncompensatedIrrfTerminalState": "AVAILABLE_FOR_RESTITUTION"
    },
    "fii": {
      "totalGrossProfits": "4000.00",
      "totalLossesIncurred": "0.00",
      "totalLossesCompensated": "0.00",
      "totalNetTaxableBase": "4000.00",
      "totalTaxDue": "800.00",
      "totalIrrfDeducted": "0.00"
    },
    "lossCarry": {
      "normalEquities": {
        "category": "NORMAL_EQUITIES",
        "openingLossJanuary1": "0.00",
        "lossesAdded": "3000.00",
        "lossesConsumed": "3000.00",
        "closingLossDecember31": "0.00"
      },
      "dayTrade": {
        "category": "DAY_TRADE",
        "openingLossJanuary1": "0.00",
        "lossesAdded": "1000.00",
        "lossesConsumed": "1000.00",
        "closingLossDecember31": "0.00"
      },
      "fii": {
        "category": "FII",
        "openingLossJanuary1": "0.00",
        "lossesAdded": "0.00",
        "lossesConsumed": "0.00",
        "closingLossDecember31": "0.00"
      },
      "isConsistent": true
    },
    "obligations6015": {
      "totalPrincipalDue": "3400.00",
      "totalPaid": "3400.00",
      "totalOverdue": "0.00",
      "monthsWithLiabilityCount": 4,
      "monthsSettledCount": 4
    },
    "calculatedAt": "2026-10-01T19:00:00.000Z",
    "fingerprint": "a1b2c3..."
  }
}
```
