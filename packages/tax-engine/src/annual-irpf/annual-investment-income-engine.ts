import { createHash } from 'node:crypto';
import { Currency, LocalDate, Money } from '@atlas/domain';
import {
  AnnualIncomeCategorySummary,
  AnnualIncomeEvent,
  AnnualIncomePayerSummary,
  AnnualInvestmentIncomeSummary,
  AnnualMonthlyIncomeSnapshot,
  IncomeCompletenessStatus,
  IncomeTaxTreatment,
  IncomeType,
} from './annual-investment-income';
import { DeclarationExercise, resolveOrdinaryDeclarationExercise } from './annual-period';

export interface FiiEligibilityData {
  readonly isListed?: boolean;
  readonly investorCountAtLeast100?: boolean;
  readonly beneficiaryOwnershipLessThan10Percent?: boolean;
  readonly isVerified?: boolean;
}

/**
 * Structured evidence for the transitional exemption under Lei 15.270/2025.
 *
 * Profits/dividends accrued through 31/12/2025 whose distribution was formally
 * approved by the company's competent body by 31/12/2025 retain full exemption
 * when paid in calendar years 2026, 2027, or 2028.
 *
 * Missing evidence fails closed — the ordinary R-DIV-2026 rule applies.
 */
export type DividendTransitionEligibility =
  | 'ELIGIBLE' // All required evidence confirmed
  | 'INELIGIBLE' // Evidence explicitly disqualifies
  | 'REQUIRES_CONFIRMATION'; // Evidence missing or incomplete

export interface DividendTransitionEvidence {
  /** Period to which profits relate (must be <= 2025) */
  readonly profitAccrualPeriodEnd?: string; // YYYY-MM-DD or YYYY
  /** Date the distribution was formally approved by the corporate body */
  readonly distributionApprovalDate?: string; // YYYY-MM-DD
  /** Reference to the approval document (e.g., ata de assembleia) */
  readonly approvalDocumentReference?: string;
  /** The approved distribution amount (optional, for audit) */
  readonly approvedAmount?: string | Money;
  /** Eligibility status (ELIGIBLE, INELIGIBLE, REQUIRES_CONFIRMATION) */
  readonly eligibilityStatus: DividendTransitionEligibility;
  /** Source of the evidence */
  readonly evidenceSource?: string;
  /** When the evidence was confirmed */
  readonly confirmedAt?: string; // ISO 8601
}

export interface IncomeEventInputData {
  readonly incomeEventId: string;
  readonly incomeType: IncomeType;
  readonly assetId: string;
  readonly payerId?: string;
  readonly payerDisplayName?: string;
  readonly paymentDate: string; // YYYY-MM-DD
  readonly grossAmount: string | Money;
  readonly withheldTaxAmount?: string | Money | null;
  readonly monthlyPayerDividendTotal?: string | Money | null;
  readonly currency?: Currency;
  readonly fiiEligibility?: FiiEligibilityData;
  /** Transition evidence for dividends paid in 2026+ relating to pre-2026 profits */
  readonly dividendTransitionEvidence?: DividendTransitionEvidence;
  readonly source?: string;
  readonly sourceReference?: string;
}

export interface BuildAnnualInvestmentIncomeSummaryInput {
  readonly calendarYear: number;
  readonly declarationExercise?: DeclarationExercise;
  readonly taxSubjectId: string;
  readonly currency?: Currency;
  readonly events: readonly IncomeEventInputData[];
  readonly qualityIssues?: readonly string[];
}

function toMoney(val: string | Money | null | undefined, currency: Currency): Money {
  if (!val) return Money.zero(currency);
  if (typeof val === 'string') {
    return Money.from(val, currency);
  }
  return val;
}

export function classifyIncomeEvent(
  input: IncomeEventInputData,
  defaultCurrency: Currency = 'BRL',
): AnnualIncomeEvent {
  const currency = input.currency ?? defaultCurrency;
  const gross = toMoney(input.grossAmount, currency);
  const paymentDate = input.paymentDate;

  let paymentLocalDate: LocalDate;
  try {
    paymentLocalDate = LocalDate.from(paymentDate);
  } catch {
    const payerId = input.payerId ?? input.assetId;
    const payerDisplayName = input.payerDisplayName ?? payerId;
    return Object.freeze({
      incomeEventId: input.incomeEventId,
      incomeType: input.incomeType,
      assetId: input.assetId,
      payerId,
      payerDisplayName,
      paymentDate,
      competence: '0000-00',
      calendarYear: 0,
      grossAmount: gross,
      withheldTaxAmount: null,
      netAmount: gross,
      currency,
      taxTreatment: 'BLOCKED',
      ruleId: 'INVALID_PAYMENT_DATE',
      ruleVersion: 'INVALID',
      completenessStatus: 'BLOCKED',
      blockingReasons: Object.freeze(['INVALID_PAYMENT_DATE']),
      source: input.source ?? 'LEDGER_INCOME_TRANSACTION',
      sourceFingerprint: createHash('sha256')
        .update(`${input.incomeEventId}:${gross.amount}:${currency}:invalid-date`)
        .digest('hex'),
    });
  }

  const competence = `${paymentLocalDate.year}-${paymentLocalDate.month.toString().padStart(2, '0')}`;
  const calendarYear = paymentLocalDate.year;

  const payerId = input.payerId ?? input.assetId;
  const payerDisplayName = input.payerDisplayName ?? payerId;
  const source = input.source ?? 'LEDGER_INCOME_TRANSACTION';

  // Currency Validation (Atlas supports BRL domestic income currently)
  if (currency !== 'BRL') {
    return Object.freeze({
      incomeEventId: input.incomeEventId,
      incomeType: input.incomeType,
      assetId: input.assetId,
      payerId,
      payerDisplayName,
      paymentDate,
      competence,
      calendarYear,
      grossAmount: gross,
      withheldTaxAmount: null,
      netAmount: gross,
      currency,
      taxTreatment: 'BLOCKED',
      ruleId: 'R-FOREIGN-INCOME',
      ruleVersion: 'UNSUPPORTED',
      completenessStatus: 'BLOCKED',
      blockingReasons: Object.freeze(['UNSUPPORTED_FOREIGN_CURRENCY_INCOME']),
      source,
      sourceFingerprint: createHash('sha256')
        .update(`${input.incomeEventId}:${gross.amount}:${currency}`)
        .digest('hex'),
    });
  }

  let taxTreatment: IncomeTaxTreatment = 'EXEMPT';
  let ruleId = 'R-DIV-2025';
  let ruleVersion = '1995-12-26-LEI-9249';
  let completenessStatus: IncomeCompletenessStatus = 'COMPLETE';
  const blockingReasons: string[] = [];

  let withheld: Money | null = null;
  let net = gross;

  switch (input.incomeType) {
    case 'DIVIDEND': {
      if (paymentDate < '2026-01-01') {
        // Calendar year 2025 or earlier: full exemption under Lei 9.249/1995
        ruleId = 'R-DIV-2025';
        ruleVersion = '1995-12-26-LEI-9249';
        taxTreatment = 'EXEMPT';
        withheld = toMoney(input.withheldTaxAmount, currency);
        net = gross.subtract(withheld);
      } else {
        // Calendar year 2026+: check transition eligibility first
        const transition = input.dividendTransitionEvidence;
        if (transition && transition.eligibilityStatus === 'ELIGIBLE') {
          // Transitional exemption: pre-2026 profits distributed in 2026-2028
          // per Lei 15.270/2025 transitional provisions (Art. 6º-A, § 3º da Lei 9.250/1995)
          ruleId = 'R-DIV-TRANSITION';
          ruleVersion = '2025-LEI-15270-TRANSITION';
          taxTreatment = 'EXEMPT';
          withheld = toMoney(input.withheldTaxAmount, currency);
          net = gross.subtract(withheld);
        } else if (transition && transition.eligibilityStatus === 'REQUIRES_CONFIRMATION') {
          // Unconfirmed transition evidence: fail closed to REQUIRES_CONFIRMATION
          ruleId = 'R-DIV-TRANSITION-UNVERIFIED';
          ruleVersion = '2025-LEI-15270-TRANSITION';
          taxTreatment = 'REQUIRES_CONFIRMATION';
          completenessStatus = 'REQUIRES_CONFIRMATION';
          blockingReasons.push('TRANSITION_ELIGIBILITY_UNCONFIRMED');
          withheld =
            input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null
              ? toMoney(input.withheldTaxAmount, currency)
              : null;
          net = withheld ? gross.subtract(withheld) : gross;
        } else {
          // Ordinary 2026+ rule: Lei 15.270/2025, Art. 6º-A of Lei 9.250/1995
          // Applies when transition is explicitly INELIGIBLE or when no transition is claimed.
          ruleId = 'R-DIV-2026';
          ruleVersion = '2025-LEI-15270';
          if (input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null) {
            // Explicit withholding evidence from source — use as-is
            withheld = toMoney(input.withheldTaxAmount, currency);
            net = gross.subtract(withheld);
            taxTreatment = withheld.isPositive() ? 'WITHHOLDING_EXCLUSIVE' : 'EXEMPT';
          } else {
            // Compute withholding per Art. 6º-A: threshold is strictly "superior a"
            const threshold = Money.from('50000', currency);
            const totalContext = input.monthlyPayerDividendTotal
              ? toMoney(input.monthlyPayerDividendTotal, currency)
              : gross;

            if (totalContext.compare(threshold) <= 0) {
              // Monthly total <= R$ 50.000,00: fully exempt
              taxTreatment = 'EXEMPT';
              withheld = Money.zero(currency);
              net = gross;
            } else {
              // Monthly total > R$ 50.000,00: 10% IRRF on the TOTAL (not the excess)
              // § 1º: No deductions permitted from the base
              // § 2º: Multiple payments recalculated over accumulated total
              taxTreatment = 'WITHHOLDING_EXCLUSIVE';
              if (
                input.monthlyPayerDividendTotal &&
                toMoney(input.monthlyPayerDividendTotal, currency).isPositive()
              ) {
                // Pro-rata allocation: this event's share of total monthly withholding
                const totalM = toMoney(input.monthlyPayerDividendTotal, currency);
                const totalWithholding = totalM.multiply('0.10');
                const fraction = gross.divide(totalM.amount);
                withheld = totalWithholding.multiply(fraction.amount);
              } else {
                // Single event is the entire monthly total
                withheld = totalContext.multiply('0.10');
              }
              net = gross.subtract(withheld);
            }
          }
        }
      }
      break;
    }

    case 'JCP': {
      if (paymentDate < '2026-01-01') {
        ruleId = 'R-JCP-2025';
        ruleVersion = '1995-12-26-LEI-9249';
        taxTreatment = 'WITHHOLDING_EXCLUSIVE';
        if (input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null) {
          withheld = toMoney(input.withheldTaxAmount, currency);
          net = gross.subtract(withheld);
        } else {
          // Authoritative statutory 15% rate on JCP for 2025
          withheld = gross.multiply('0.15');
          net = gross.subtract(withheld);
        }
      } else {
        ruleId = 'R-JCP-2026';
        ruleVersion = '2025-12-30-LEI-JCP-2026';
        taxTreatment = 'WITHHOLDING_EXCLUSIVE';
        if (input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null) {
          withheld = toMoney(input.withheldTaxAmount, currency);
          net = gross.subtract(withheld);
        } else {
          // Authoritative statutory 17.5% rate on JCP for 2026
          withheld = gross.multiply('0.175');
          net = gross.subtract(withheld);
        }
      }
      break;
    }

    case 'FII_INCOME': {
      const elig = input.fiiEligibility;
      const hasFailedCondition =
        elig?.isListed === false ||
        elig?.investorCountAtLeast100 === false ||
        elig?.beneficiaryOwnershipLessThan10Percent === false;

      const isEligible =
        !hasFailedCondition &&
        (elig?.isVerified === true ||
          (elig?.isListed === true &&
            elig?.investorCountAtLeast100 === true &&
            elig?.beneficiaryOwnershipLessThan10Percent === true));

      if (isEligible) {
        ruleId = 'R-FII-EXEMPT';
        ruleVersion = '2023-12-29-LEI-14754';
        taxTreatment = 'EXEMPT';
        withheld = toMoney(input.withheldTaxAmount, currency);
        net = gross.subtract(withheld);
      } else if (hasFailedCondition) {
        ruleId = 'R-FII-TAXABLE';
        ruleVersion = '2023-12-29-LEI-14754';
        taxTreatment = 'WITHHOLDING_EXCLUSIVE';
        withheld = toMoney(input.withheldTaxAmount, currency);
        net = gross.subtract(withheld);
      } else {
        ruleId = 'R-FII-UNVERIFIED';
        ruleVersion = '2023-12-29-LEI-14754';
        taxTreatment = 'REQUIRES_CONFIRMATION';
        completenessStatus = 'REQUIRES_CONFIRMATION';
        blockingReasons.push('FII_ELIGIBILITY_UNVERIFIED');
        withheld =
          input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null
            ? toMoney(input.withheldTaxAmount, currency)
            : null;
        net = withheld ? gross.subtract(withheld) : gross;
      }
      break;
    }
  }

  const sourceFingerprint = createHash('sha256')
    .update(
      `${input.incomeEventId}:${input.incomeType}:${payerId}:${paymentDate}:${gross.amount}:${withheld?.amount ?? 'NULL'}:${taxTreatment}`,
    )
    .digest('hex');

  return Object.freeze({
    incomeEventId: input.incomeEventId,
    incomeType: input.incomeType,
    assetId: input.assetId,
    payerId,
    payerDisplayName,
    paymentDate,
    competence,
    calendarYear,
    grossAmount: gross,
    withheldTaxAmount: withheld,
    netAmount: net,
    currency,
    taxTreatment,
    ruleId,
    ruleVersion,
    completenessStatus,
    blockingReasons: Object.freeze(blockingReasons),
    source,
    sourceFingerprint,
  });
}

export function buildAnnualInvestmentIncomeSummary(
  input: BuildAnnualInvestmentIncomeSummaryInput,
): AnnualInvestmentIncomeSummary {
  const currency: Currency = input.currency ?? 'BRL';
  const calendarYear = input.calendarYear;
  const declarationExercise =
    input.declarationExercise ?? resolveOrdinaryDeclarationExercise(calendarYear);

  const collectedIssues = new Set<string>(input.qualityIssues ?? []);
  const collectedBlockingReasons = new Set<string>();

  // For 2026 dividends, pre-calculate monthly totals per payer to evaluate threshold correctly across multiple events
  const monthlyPayerDividendTotals = new Map<string, Money>();
  for (const rawEvt of input.events) {
    if (rawEvt.incomeType === 'DIVIDEND' && rawEvt.paymentDate >= '2026-01-01') {
      let comp = '0000-00';
      try {
        const d = LocalDate.from(rawEvt.paymentDate);
        comp = `${d.year}-${d.month.toString().padStart(2, '0')}`;
      } catch {
        comp = '0000-00';
      }
      const payerId = rawEvt.payerId ?? rawEvt.assetId;
      const key = `${payerId}:${comp}`;
      const currentGross = monthlyPayerDividendTotals.get(key) ?? Money.zero(currency);
      const evtGross = toMoney(rawEvt.grossAmount, currency);
      monthlyPayerDividendTotals.set(key, currentGross.add(evtGross));
    }
  }

  // Filter events belonging to target calendarYear and deduplicate by incomeEventId
  const eventMap = new Map<string, AnnualIncomeEvent>();
  for (const rawEvt of input.events) {
    let enriched = rawEvt;
    if (
      rawEvt.incomeType === 'DIVIDEND' &&
      rawEvt.paymentDate >= '2026-01-01' &&
      rawEvt.withheldTaxAmount === undefined
    ) {
      let comp = '0000-00';
      try {
        const d = LocalDate.from(rawEvt.paymentDate);
        comp = `${d.year}-${d.month.toString().padStart(2, '0')}`;
      } catch {
        comp = '0000-00';
      }
      const payerId = rawEvt.payerId ?? rawEvt.assetId;
      const key = `${payerId}:${comp}`;
      const mTotal = monthlyPayerDividendTotals.get(key);
      if (mTotal) {
        enriched = { ...rawEvt, monthlyPayerDividendTotal: mTotal };
      }
    }

    const classified = classifyIncomeEvent(enriched, currency);
    if (classified.calendarYear === calendarYear) {
      eventMap.set(classified.incomeEventId, classified);
    }
  }

  // Canonical ordering: (paymentDate ASC, incomeType ASC, incomeEventId ASC)
  const sortedEvents = Array.from(eventMap.values()).sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) return a.paymentDate.localeCompare(b.paymentDate);
    if (a.incomeType !== b.incomeType) return a.incomeType.localeCompare(b.incomeType);
    return a.incomeEventId.localeCompare(b.incomeEventId);
  });

  // Track Category Aggregates
  let divGross = Money.zero(currency);
  let divWithheld = Money.zero(currency);
  let divCount = 0;
  let divComplete = true;

  let jcpGross = Money.zero(currency);
  let jcpWithheld = Money.zero(currency);
  let jcpCount = 0;
  let jcpComplete = true;

  let fiiGross = Money.zero(currency);
  let fiiWithheld = Money.zero(currency);
  let fiiCount = 0;
  let fiiComplete = true;

  // Track Payer Aggregates
  const payerMap = new Map<
    string,
    {
      payerId: string;
      payerDisplayName: string;
      divGross: Money;
      divWithheld: Money;
      jcpGross: Money;
      jcpWithheld: Money;
      fiiGross: Money;
      isComplete: boolean;
    }
  >();

  // Track Monthly Snapshots (1..12)
  const monthSnapshotsMap = new Map<
    number,
    {
      dividendsGross: Money;
      divWithheld: Money;
      jcpGross: Money;
      jcpWithheld: Money;
      fiiIncomeGross: Money;
      eventCount: number;
    }
  >();

  for (let m = 1; m <= 12; m++) {
    monthSnapshotsMap.set(m, {
      dividendsGross: Money.zero(currency),
      divWithheld: Money.zero(currency),
      jcpGross: Money.zero(currency),
      jcpWithheld: Money.zero(currency),
      fiiIncomeGross: Money.zero(currency),
      eventCount: 0,
    });
  }

  for (const evt of sortedEvents) {
    let pMonth = 1;
    try {
      pMonth = LocalDate.from(evt.paymentDate).month;
    } catch {
      pMonth = 1;
    }
    const mSnap = monthSnapshotsMap.get(pMonth)!;
    mSnap.eventCount++;

    if (evt.completenessStatus !== 'COMPLETE') {
      for (const reason of evt.blockingReasons) {
        collectedBlockingReasons.add(reason);
      }
    }

    if (evt.currency !== currency) {
      collectedBlockingReasons.add(`UNSUPPORTED_FOREIGN_CURRENCY_${evt.currency}`);
      continue;
    }

    // Payer record lookup / initialization
    let pRecord = payerMap.get(evt.payerId);
    if (!pRecord) {
      pRecord = {
        payerId: evt.payerId,
        payerDisplayName: evt.payerDisplayName,
        divGross: Money.zero(currency),
        divWithheld: Money.zero(currency),
        jcpGross: Money.zero(currency),
        jcpWithheld: Money.zero(currency),
        fiiGross: Money.zero(currency),
        isComplete: true,
      };
      payerMap.set(evt.payerId, pRecord);
    }
    if (evt.completenessStatus !== 'COMPLETE') {
      pRecord.isComplete = false;
    }

    switch (evt.incomeType) {
      case 'DIVIDEND': {
        divGross = divGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          divWithheld = divWithheld.add(evt.withheldTaxAmount);
          pRecord.divWithheld = pRecord.divWithheld.add(evt.withheldTaxAmount);
        }
        divCount++;
        if (evt.completenessStatus !== 'COMPLETE') divComplete = false;

        pRecord.divGross = pRecord.divGross.add(evt.grossAmount);
        mSnap.dividendsGross = mSnap.dividendsGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          mSnap.divWithheld = mSnap.divWithheld.add(evt.withheldTaxAmount);
        }
        break;
      }
      case 'JCP': {
        jcpGross = jcpGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          jcpWithheld = jcpWithheld.add(evt.withheldTaxAmount);
          pRecord.jcpWithheld = pRecord.jcpWithheld.add(evt.withheldTaxAmount);
        }
        jcpCount++;
        if (evt.completenessStatus !== 'COMPLETE') jcpComplete = false;

        pRecord.jcpGross = pRecord.jcpGross.add(evt.grossAmount);
        mSnap.jcpGross = mSnap.jcpGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          mSnap.jcpWithheld = mSnap.jcpWithheld.add(evt.withheldTaxAmount);
        }
        break;
      }
      case 'FII_INCOME': {
        fiiGross = fiiGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          fiiWithheld = fiiWithheld.add(evt.withheldTaxAmount);
        }
        fiiCount++;
        if (evt.completenessStatus !== 'COMPLETE') fiiComplete = false;

        pRecord.fiiGross = pRecord.fiiGross.add(evt.grossAmount);
        mSnap.fiiIncomeGross = mSnap.fiiIncomeGross.add(evt.grossAmount);
        break;
      }
    }
  }

  const totalGrossIncome = divGross.add(jcpGross).add(fiiGross);
  const totalWithheldTax = divWithheld.add(jcpWithheld).add(fiiWithheld);

  // Format Payers Summary
  const payers: AnnualIncomePayerSummary[] = Array.from(payerMap.values())
    .sort((a, b) => a.payerDisplayName.localeCompare(b.payerDisplayName))
    .map((p) => {
      const totalGross = p.divGross.add(p.jcpGross).add(p.fiiGross);
      const totalWithheld = p.jcpWithheld.add(p.divWithheld);
      return Object.freeze({
        payerId: p.payerId,
        payerDisplayName: p.payerDisplayName,
        dividendGross: p.divGross,
        jcpGross: p.jcpGross,
        jcpWithheld: p.jcpWithheld,
        fiiIncomeGross: p.fiiGross,
        totalGross,
        totalWithheld,
        isComplete: p.isComplete,
      });
    });

  // Format 12 Monthly Snapshots
  const months: AnnualMonthlyIncomeSnapshot[] = [];
  for (let m = 1; m <= 12; m++) {
    const s = monthSnapshotsMap.get(m)!;
    const comp = `${calendarYear}-${m.toString().padStart(2, '0')}`;
    const mTotalGross = s.dividendsGross.add(s.jcpGross).add(s.fiiIncomeGross);
    const mTotalWithheld = s.jcpWithheld.add(s.divWithheld);
    months.push(
      Object.freeze({
        competence: comp,
        month: m,
        dividendsGross: s.dividendsGross,
        jcpGross: s.jcpGross,
        jcpWithheld: s.jcpWithheld,
        fiiIncomeGross: s.fiiIncomeGross,
        totalGross: mTotalGross,
        totalWithheld: mTotalWithheld,
        eventCount: s.eventCount,
      }),
    );
  }

  // Determine overall status
  let overallStatus: IncomeCompletenessStatus = 'COMPLETE';
  if (collectedBlockingReasons.size > 0) {
    overallStatus = 'BLOCKED';
  } else if (!divComplete || !jcpComplete || !fiiComplete || collectedIssues.size > 0) {
    overallStatus = 'REQUIRES_CONFIRMATION';
  }

  const isComplete = overallStatus === 'COMPLETE';

  // Category Summaries
  const divTreatmentSummary: IncomeTaxTreatment =
    calendarYear < 2026
      ? 'EXEMPT'
      : !divComplete
        ? 'REQUIRES_CONFIRMATION'
        : divWithheld.isPositive()
          ? 'WITHHOLDING_EXCLUSIVE'
          : 'EXEMPT';

  const jcpTreatmentSummary: IncomeTaxTreatment = 'WITHHOLDING_EXCLUSIVE';

  const fiiTreatmentSummary: IncomeTaxTreatment = fiiComplete ? 'EXEMPT' : 'REQUIRES_CONFIRMATION';

  const dividendsSummary: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'DIVIDEND',
    totalGrossAmount: divGross,
    totalWithheldTax: divWithheld,
    totalNetAmount: divGross.subtract(divWithheld),
    eventCount: divCount,
    taxTreatmentSummary: divTreatmentSummary,
    isComplete: divComplete,
  });

  const jcpSummary: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'JCP',
    totalGrossAmount: jcpGross,
    totalWithheldTax: jcpWithheld,
    totalNetAmount: jcpGross.subtract(jcpWithheld),
    eventCount: jcpCount,
    taxTreatmentSummary: jcpTreatmentSummary,
    isComplete: jcpComplete,
  });

  const fiiSummary: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'FII_INCOME',
    totalGrossAmount: fiiGross,
    totalWithheldTax: fiiWithheld,
    totalNetAmount: fiiGross.subtract(fiiWithheld),
    eventCount: fiiCount,
    taxTreatmentSummary: fiiTreatmentSummary,
    isComplete: fiiComplete,
  });

  // Cryptographic Fingerprint
  const fingerprint = createHash('sha256')
    .update(
      `${calendarYear}:${declarationExercise}:${totalGrossIncome.amount}:${totalWithheldTax.amount}:${divGross.amount}:${jcpGross.amount}:${jcpWithheld.amount}:${fiiGross.amount}:${overallStatus}:${sortedEvents.map((e) => e.sourceFingerprint).join('|')}`,
    )
    .digest('hex');

  return Object.freeze({
    calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    isComplete,
    status: overallStatus,
    qualityIssues: Object.freeze(Array.from(collectedIssues)),
    blockingReasons: Object.freeze(Array.from(collectedBlockingReasons)),
    dividends: dividendsSummary,
    jcp: jcpSummary,
    fiiIncome: fiiSummary,
    totalGrossIncome,
    totalWithheldTax,
    payers: Object.freeze(payers),
    months: Object.freeze(months),
    events: Object.freeze(sortedEvents),
    calculatedAt: new Date().toISOString(),
    fingerprint,
  });
}
