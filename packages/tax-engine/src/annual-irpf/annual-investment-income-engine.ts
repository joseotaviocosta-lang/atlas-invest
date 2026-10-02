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

export interface IncomeEventInputData {
  readonly incomeEventId: string;
  readonly incomeType: IncomeType;
  readonly assetId: string;
  readonly payerId?: string;
  readonly payerDisplayName?: string;
  readonly paymentDate: string; // YYYY-MM-DD
  readonly grossAmount: string | Money;
  readonly withheldTaxAmount?: string | Money | null;
  readonly currency?: Currency;
  readonly fiiEligibility?: FiiEligibilityData;
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
        ruleId = 'R-DIV-2025';
        ruleVersion = '1995-12-26-LEI-9249';
        taxTreatment = 'EXEMPT';
        withheld = toMoney(input.withheldTaxAmount, currency);
        net = gross.subtract(withheld);
      } else {
        ruleId = 'R-DIV-2026';
        ruleVersion = '2023-12-20-EC-132';
        if (input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null) {
          withheld = toMoney(input.withheldTaxAmount, currency);
          net = gross.subtract(withheld);
          taxTreatment = withheld.isPositive() ? 'WITHHOLDING_EXCLUSIVE' : 'EXEMPT';
        } else {
          // If no explicit withholding evidence, treat as standard exempt
          withheld = Money.zero(currency);
          net = gross;
          taxTreatment = 'EXEMPT';
        }
      }
      break;
    }

    case 'JCP': {
      ruleId = 'R-JCP-ALL';
      ruleVersion = '1995-12-26-LEI-9249';
      taxTreatment = 'WITHHOLDING_EXCLUSIVE';
      if (input.withheldTaxAmount !== undefined && input.withheldTaxAmount !== null) {
        withheld = toMoney(input.withheldTaxAmount, currency);
        net = gross.subtract(withheld);
      } else {
        // Authoritative statutory 15% rate on JCP via exact decimal multiplication
        withheld = gross.multiply('0.15');
        net = gross.subtract(withheld);
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

  // Filter events belonging to target calendarYear and deduplicate by incomeEventId
  const eventMap = new Map<string, AnnualIncomeEvent>();
  for (const rawEvt of input.events) {
    const classified = classifyIncomeEvent(rawEvt, currency);
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
      jcpGross: Money;
      jcpWithheld: Money;
      fiiIncomeGross: Money;
      eventCount: number;
    }
  >();

  for (let m = 1; m <= 12; m++) {
    monthSnapshotsMap.set(m, {
      dividendsGross: Money.zero(currency),
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
        }
        divCount++;
        if (evt.completenessStatus !== 'COMPLETE') divComplete = false;

        pRecord.divGross = pRecord.divGross.add(evt.grossAmount);
        mSnap.dividendsGross = mSnap.dividendsGross.add(evt.grossAmount);
        break;
      }
      case 'JCP': {
        jcpGross = jcpGross.add(evt.grossAmount);
        if (evt.withheldTaxAmount) {
          jcpWithheld = jcpWithheld.add(evt.withheldTaxAmount);
          pRecord.jcpWithheld = pRecord.jcpWithheld.add(evt.withheldTaxAmount);
          mSnap.jcpWithheld = mSnap.jcpWithheld.add(evt.withheldTaxAmount);
        }
        jcpCount++;
        if (evt.completenessStatus !== 'COMPLETE') jcpComplete = false;

        pRecord.jcpGross = pRecord.jcpGross.add(evt.grossAmount);
        mSnap.jcpGross = mSnap.jcpGross.add(evt.grossAmount);
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

  // Build Payer Summaries sorted canonically by (payerDisplayName ASC, payerId ASC)
  const payers: AnnualIncomePayerSummary[] = Array.from(payerMap.values())
    .map((p) =>
      Object.freeze({
        payerId: p.payerId,
        payerDisplayName: p.payerDisplayName,
        dividendGross: p.divGross,
        jcpGross: p.jcpGross,
        jcpWithheld: p.jcpWithheld,
        fiiIncomeGross: p.fiiGross,
        totalGross: p.divGross.add(p.jcpGross).add(p.fiiGross),
        totalWithheld: p.jcpWithheld,
        isComplete: p.isComplete,
      }),
    )
    .sort((a, b) => {
      if (a.payerDisplayName !== b.payerDisplayName) {
        return a.payerDisplayName.localeCompare(b.payerDisplayName);
      }
      return a.payerId.localeCompare(b.payerId);
    });

  // Build Monthly Snapshots (1..12)
  const months: AnnualMonthlyIncomeSnapshot[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = m.toString().padStart(2, '0');
    const competence = `${calendarYear}-${mm}`;
    const snap = monthSnapshotsMap.get(m)!;
    const totalGross = snap.dividendsGross.add(snap.jcpGross).add(snap.fiiIncomeGross);
    const totalWithheld = snap.jcpWithheld;

    months.push(
      Object.freeze({
        competence,
        month: m,
        dividendsGross: snap.dividendsGross,
        jcpGross: snap.jcpGross,
        jcpWithheld: snap.jcpWithheld,
        fiiIncomeGross: snap.fiiIncomeGross,
        totalGross,
        totalWithheld,
        eventCount: snap.eventCount,
      }),
    );
  }

  // Categories
  const dividendsCategory: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'DIVIDEND',
    totalGrossAmount: divGross,
    totalWithheldTax: divWithheld,
    totalNetAmount: divGross.subtract(divWithheld),
    eventCount: divCount,
    taxTreatmentSummary: 'EXEMPT',
    isComplete: divComplete,
  });

  const jcpCategory: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'JCP',
    totalGrossAmount: jcpGross,
    totalWithheldTax: jcpWithheld,
    totalNetAmount: jcpGross.subtract(jcpWithheld),
    eventCount: jcpCount,
    taxTreatmentSummary: 'WITHHOLDING_EXCLUSIVE',
    isComplete: jcpComplete,
  });

  const fiiCategory: AnnualIncomeCategorySummary = Object.freeze({
    incomeType: 'FII_INCOME',
    totalGrossAmount: fiiGross,
    totalWithheldTax: fiiWithheld,
    totalNetAmount: fiiGross.subtract(fiiWithheld),
    eventCount: fiiCount,
    taxTreatmentSummary: fiiComplete ? 'EXEMPT' : 'REQUIRES_CONFIRMATION',
    isComplete: fiiComplete,
  });

  const totalGrossIncome = divGross.add(jcpGross).add(fiiGross);
  const totalWithheldTax = divWithheld.add(jcpWithheld).add(fiiWithheld);

  const isComplete =
    collectedIssues.size === 0 &&
    collectedBlockingReasons.size === 0 &&
    divComplete &&
    jcpComplete &&
    fiiComplete;

  let status: IncomeCompletenessStatus = 'COMPLETE';
  if (collectedBlockingReasons.has('UNSUPPORTED_FOREIGN_CURRENCY_INCOME')) {
    status = 'BLOCKED';
  } else if (collectedBlockingReasons.has('FII_ELIGIBILITY_UNVERIFIED')) {
    status = 'REQUIRES_CONFIRMATION';
  } else if (!isComplete) {
    status = 'PARTIAL';
  }

  const calculatedAt = new Date().toISOString();

  // Canonical fingerprint
  const fingerprintPayload = JSON.stringify({
    taxSubjectId: input.taxSubjectId,
    calendarYear,
    declarationExercise,
    currency,
    dividends: { gross: divGross.amount, withheld: divWithheld.amount, count: divCount },
    jcp: { gross: jcpGross.amount, withheld: jcpWithheld.amount, count: jcpCount },
    fii: { gross: fiiGross.amount, withheld: fiiWithheld.amount, count: fiiCount },
    totalGross: totalGrossIncome.amount,
    totalWithheld: totalWithheldTax.amount,
    payerCount: payers.length,
    status,
  });

  const fingerprint = createHash('sha256').update(fingerprintPayload).digest('hex');

  return Object.freeze({
    calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    isComplete,
    status,
    qualityIssues: Object.freeze([...collectedIssues].sort()),
    blockingReasons: Object.freeze([...collectedBlockingReasons].sort()),
    dividends: dividendsCategory,
    jcp: jcpCategory,
    fiiIncome: fiiCategory,
    totalGrossIncome,
    totalWithheldTax,
    payers: Object.freeze(payers),
    months: Object.freeze(months),
    events: Object.freeze(sortedEvents),
    calculatedAt,
    fingerprint,
  });
}
