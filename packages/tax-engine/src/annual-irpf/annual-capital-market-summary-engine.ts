import { createHash } from 'crypto';
import { Currency, Money } from '@atlas/domain';
import {
  CalendarYear,
  DeclarationExercise,
  createCalendarYear,
  resolveOrdinaryDeclarationExercise,
} from './annual-period';
import {
  Annual6015Summary,
  AnnualCapitalMarketFiscalSummary,
  AnnualCategoryLossContinuity,
  AnnualDayTradeSummary,
  AnnualFiiSummary,
  AnnualLossCarrySummary,
  AnnualMonthlyCategorySnapshot,
  AnnualMonthlyDarf6015Snapshot,
  AnnualMonthlyFiscalSnapshot,
  AnnualNormalEquitySummary,
} from './annual-capital-market-summary';

export interface MonthlyCategoryInputData {
  readonly grossSaleAmount?: Money | string;
  readonly isExempt?: boolean;
  readonly profitOrLoss?: Money | string;
  readonly lossCompensated?: Money | string;
  readonly taxableBase?: Money | string;
  readonly irrfDeducted?: Money | string;
  readonly taxDue?: Money | string;
  readonly lossClosing?: Money | string;
}

export interface MonthlyDarf6015InputData {
  readonly obligationId?: string | null;
  readonly status?: string;
  readonly principalAmount?: Money | string;
  readonly paidAmount?: Money | string;
  readonly isOverdue?: boolean;
}

export interface MonthlyFiscalInputData {
  readonly competence: string;
  readonly normalEquities?: MonthlyCategoryInputData;
  readonly dayTrade?: MonthlyCategoryInputData;
  readonly fii?: MonthlyCategoryInputData;
  readonly darf6015?: MonthlyDarf6015InputData;
  readonly qualityIssues?: readonly string[];
}

export interface BuildAnnualCapitalMarketSummaryInput {
  readonly calendarYear: CalendarYear | number;
  readonly declarationExercise?: DeclarationExercise | number;
  readonly taxSubjectId: string;
  readonly currency?: Currency;
  readonly months: readonly MonthlyFiscalInputData[];
  readonly openingLosses?: {
    readonly normalEquities?: Money | string;
    readonly dayTrade?: Money | string;
    readonly fii?: Money | string;
  };
  readonly qualityIssues?: readonly string[];
}

function toMoney(value: Money | string | undefined, currency: Currency): Money {
  if (!value) return Money.zero(currency);
  if (typeof value === 'string') return Money.from(value, currency);
  return value;
}

function parseMonthCompetence(year: number, monthNum: number): string {
  const mm = monthNum.toString().padStart(2, '0');
  return `${year}-${mm}`;
}

export function buildAnnualCapitalMarketSummary(
  input: BuildAnnualCapitalMarketSummaryInput,
): AnnualCapitalMarketFiscalSummary {
  const calendarYear =
    typeof input.calendarYear === 'number'
      ? createCalendarYear(input.calendarYear)
      : input.calendarYear;

  const declarationExercise =
    input.declarationExercise !== undefined
      ? typeof input.declarationExercise === 'number'
        ? (input.declarationExercise as DeclarationExercise)
        : input.declarationExercise
      : resolveOrdinaryDeclarationExercise(calendarYear);

  const currency = input.currency ?? ('BRL' as Currency);
  const zero = Money.zero(currency);

  const monthMap = new Map<string, MonthlyFiscalInputData>();
  for (const m of input.months) {
    monthMap.set(m.competence, m);
  }

  const collectedIssues = new Set<string>(input.qualityIssues ?? []);
  const monthlySnapshots: AnnualMonthlyFiscalSnapshot[] = [];

  let normalGrossSales = zero;
  let normalExemptProfits = zero;
  let normalTaxableProfits = zero;
  let normalLossesIncurred = zero;
  let normalLossesCompensated = zero;
  let normalTaxableBase = zero;
  let normalTaxDue = zero;
  let normalIrrfDeducted = zero;

  let dtGrossProfits = zero;
  let dtLossesIncurred = zero;
  let dtLossesCompensated = zero;
  let dtTaxableBase = zero;
  let dtTaxDue = zero;
  let dtIrrfDeducted = zero;

  let fiiGrossProfits = zero;
  let fiiLossesIncurred = zero;
  let fiiLossesCompensated = zero;
  let fiiTaxableBase = zero;
  let fiiTaxDue = zero;
  let fiiIrrfDeducted = zero;

  let darf6015TotalPrincipal = zero;
  let darf6015TotalPaid = zero;
  let darf6015TotalOverdue = zero;
  let monthsWithLiabilityCount = 0;
  let monthsSettledCount = 0;

  for (let m = 1; m <= 12; m++) {
    const competence = parseMonthCompetence(calendarYear as number, m);
    const mData = monthMap.get(competence);

    if (mData?.qualityIssues) {
      for (const issue of mData.qualityIssues) {
        collectedIssues.add(issue);
      }
    }

    // Normal Equities
    const normIn = mData?.normalEquities;
    const normSales = toMoney(normIn?.grossSaleAmount, currency);
    const normProfitLoss = toMoney(normIn?.profitOrLoss, currency);
    const normLossComp = toMoney(normIn?.lossCompensated, currency);
    const normBase = toMoney(normIn?.taxableBase, currency);
    const normIrrf = toMoney(normIn?.irrfDeducted, currency);
    const normDue = toMoney(normIn?.taxDue, currency);
    const isExempt = normIn?.isExempt ?? normSales.compare(Money.from('20000.00', currency)) <= 0;

    normalGrossSales = normalGrossSales.add(normSales);
    if (normProfitLoss.isPositive()) {
      if (isExempt) {
        normalExemptProfits = normalExemptProfits.add(normProfitLoss);
      } else {
        normalTaxableProfits = normalTaxableProfits.add(normProfitLoss);
      }
    } else if (normProfitLoss.isNegative()) {
      normalLossesIncurred = normalLossesIncurred.add(normProfitLoss.abs());
    }
    normalLossesCompensated = normalLossesCompensated.add(normLossComp);
    normalTaxableBase = normalTaxableBase.add(normBase);
    normalTaxDue = normalTaxDue.add(normDue);
    normalIrrfDeducted = normalIrrfDeducted.add(normIrrf);

    const normSnap: AnnualMonthlyCategorySnapshot = Object.freeze({
      grossSaleAmount: normSales,
      isExempt,
      profitOrLoss: normProfitLoss,
      lossCompensated: normLossComp,
      taxableBase: normBase,
      irrfDeducted: normIrrf,
      taxDue: normDue,
    });

    // Day Trade
    const dtIn = mData?.dayTrade;
    const dtProfitLoss = toMoney(dtIn?.profitOrLoss, currency);
    const dtLossComp = toMoney(dtIn?.lossCompensated, currency);
    const dtBase = toMoney(dtIn?.taxableBase, currency);
    const dtIrrf = toMoney(dtIn?.irrfDeducted, currency);
    const dtDue = toMoney(dtIn?.taxDue, currency);

    if (dtProfitLoss.isPositive()) {
      dtGrossProfits = dtGrossProfits.add(dtProfitLoss);
    } else if (dtProfitLoss.isNegative()) {
      dtLossesIncurred = dtLossesIncurred.add(dtProfitLoss.abs());
    }
    dtLossesCompensated = dtLossesCompensated.add(dtLossComp);
    dtTaxableBase = dtTaxableBase.add(dtBase);
    dtTaxDue = dtTaxDue.add(dtDue);
    dtIrrfDeducted = dtIrrfDeducted.add(dtIrrf);

    const dtSnap: AnnualMonthlyCategorySnapshot = Object.freeze({
      grossSaleAmount: toMoney(dtIn?.grossSaleAmount, currency),
      isExempt: false,
      profitOrLoss: dtProfitLoss,
      lossCompensated: dtLossComp,
      taxableBase: dtBase,
      irrfDeducted: dtIrrf,
      taxDue: dtDue,
    });

    // FII
    const fiiIn = mData?.fii;
    const fiiProfitLoss = toMoney(fiiIn?.profitOrLoss, currency);
    const fiiLossComp = toMoney(fiiIn?.lossCompensated, currency);
    const fiiBase = toMoney(fiiIn?.taxableBase, currency);
    const fiiIrrf = toMoney(fiiIn?.irrfDeducted, currency);
    const fiiDue = toMoney(fiiIn?.taxDue, currency);

    if (fiiProfitLoss.isPositive()) {
      fiiGrossProfits = fiiGrossProfits.add(fiiProfitLoss);
    } else if (fiiProfitLoss.isNegative()) {
      fiiLossesIncurred = fiiLossesIncurred.add(fiiProfitLoss.abs());
    }
    fiiLossesCompensated = fiiLossesCompensated.add(fiiLossComp);
    fiiTaxableBase = fiiTaxableBase.add(fiiBase);
    fiiTaxDue = fiiTaxDue.add(fiiDue);
    fiiIrrfDeducted = fiiIrrfDeducted.add(fiiIrrf);

    const fiiSnap: AnnualMonthlyCategorySnapshot = Object.freeze({
      grossSaleAmount: toMoney(fiiIn?.grossSaleAmount, currency),
      isExempt: false,
      profitOrLoss: fiiProfitLoss,
      lossCompensated: fiiLossComp,
      taxableBase: fiiBase,
      irrfDeducted: fiiIrrf,
      taxDue: fiiDue,
    });

    // Month Total Tax Due
    const totalMonthTaxDue = normDue.add(dtDue).add(fiiDue);

    // DARF 6015
    const darfIn = mData?.darf6015;
    const darfPrincipal = toMoney(darfIn?.principalAmount, currency);
    const darfPaid = toMoney(darfIn?.paidAmount, currency);
    const darfStatus = darfIn?.status ?? (totalMonthTaxDue.isPositive() ? 'PENDING' : 'EXEMPT');

    darf6015TotalPrincipal = darf6015TotalPrincipal.add(darfPrincipal);
    darf6015TotalPaid = darf6015TotalPaid.add(darfPaid);
    if (darfIn?.isOverdue) {
      darf6015TotalOverdue = darf6015TotalOverdue.add(darfPrincipal);
    }
    if (totalMonthTaxDue.isPositive() || darfPrincipal.isPositive()) {
      monthsWithLiabilityCount++;
    }
    if (darfStatus === 'SETTLED' || darfStatus === 'PAID') {
      monthsSettledCount++;
    }

    const darfSnap: AnnualMonthlyDarf6015Snapshot = Object.freeze({
      obligationId: darfIn?.obligationId ?? null,
      status: darfStatus,
      principalAmount: darfPrincipal,
      paidAmount: darfPaid,
    });

    monthlySnapshots.push(
      Object.freeze({
        competence,
        month: m,
        normalEquities: normSnap,
        dayTrade: dtSnap,
        fii: fiiSnap,
        totalTaxDue: totalMonthTaxDue,
        darf6015: darfSnap,
      }),
    );
  }

  // Loss Carry Continuity
  const normOpeningLoss = toMoney(input.openingLosses?.normalEquities, currency);
  const normClosingLoss = normOpeningLoss
    .add(normalLossesIncurred)
    .subtract(normalLossesCompensated);

  const dtOpeningLoss = toMoney(input.openingLosses?.dayTrade, currency);
  const dtClosingLoss = dtOpeningLoss.add(dtLossesIncurred).subtract(dtLossesCompensated);

  const fiiOpeningLoss = toMoney(input.openingLosses?.fii, currency);
  const fiiClosingLoss = fiiOpeningLoss.add(fiiLossesIncurred).subtract(fiiLossesCompensated);

  const normalLossCont: AnnualCategoryLossContinuity = Object.freeze({
    category: 'NORMAL_EQUITIES',
    openingLossJanuary1: normOpeningLoss,
    lossesAdded: normalLossesIncurred,
    lossesConsumed: normalLossesCompensated,
    closingLossDecember31: normClosingLoss.isNegative() ? zero : normClosingLoss,
  });

  const dtLossCont: AnnualCategoryLossContinuity = Object.freeze({
    category: 'DAY_TRADE',
    openingLossJanuary1: dtOpeningLoss,
    lossesAdded: dtLossesIncurred,
    lossesConsumed: dtLossesCompensated,
    closingLossDecember31: dtClosingLoss.isNegative() ? zero : dtClosingLoss,
  });

  const fiiLossCont: AnnualCategoryLossContinuity = Object.freeze({
    category: 'FII',
    openingLossJanuary1: fiiOpeningLoss,
    lossesAdded: fiiLossesIncurred,
    lossesConsumed: fiiLossesCompensated,
    closingLossDecember31: fiiClosingLoss.isNegative() ? zero : fiiClosingLoss,
  });

  const lossCarrySummary: AnnualLossCarrySummary = Object.freeze({
    normalEquities: normalLossCont,
    dayTrade: dtLossCont,
    fii: fiiLossCont,
    isConsistent:
      !normClosingLoss.isNegative() && !dtClosingLoss.isNegative() && !fiiClosingLoss.isNegative(),
  });

  // Category Summaries
  const normalSummary: AnnualNormalEquitySummary = Object.freeze({
    totalGrossSales: normalGrossSales,
    totalExemptProfits: normalExemptProfits,
    totalTaxableProfits: normalTaxableProfits,
    totalLossesIncurred: normalLossesIncurred,
    totalLossesCompensated: normalLossesCompensated,
    totalNetTaxableBase: normalTaxableBase,
    totalTaxDue: normalTaxDue,
    totalIrrfDeducted: normalIrrfDeducted,
    uncompensatedIrrf: zero,
    uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
  });

  const dtSummary: AnnualDayTradeSummary = Object.freeze({
    totalGrossProfits: dtGrossProfits,
    totalLossesIncurred: dtLossesIncurred,
    totalLossesCompensated: dtLossesCompensated,
    totalNetTaxableBase: dtTaxableBase,
    totalTaxDue: dtTaxDue,
    totalIrrfDeducted: dtIrrfDeducted,
    uncompensatedIrrf: zero,
    uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_RESTITUTION',
  });

  const fiiSummary: AnnualFiiSummary = Object.freeze({
    totalGrossProfits: fiiGrossProfits,
    totalLossesIncurred: fiiLossesIncurred,
    totalLossesCompensated: fiiLossesCompensated,
    totalNetTaxableBase: fiiTaxableBase,
    totalTaxDue: fiiTaxDue,
    totalIrrfDeducted: fiiIrrfDeducted,
  });

  const obligations6015Summary: Annual6015Summary = Object.freeze({
    totalPrincipalDue: darf6015TotalPrincipal,
    totalPaid: darf6015TotalPaid,
    totalOverdue: darf6015TotalOverdue,
    monthsWithLiabilityCount,
    monthsSettledCount,
  });

  const isComplete = collectedIssues.size === 0 && lossCarrySummary.isConsistent;
  const calculatedAt = new Date().toISOString();

  // Compute canonical fingerprint
  const fingerprintPayload = JSON.stringify({
    taxSubjectId: input.taxSubjectId,
    calendarYear: calendarYear as number,
    declarationExercise: declarationExercise as number,
    currency,
    normal: {
      sales: normalSummary.totalGrossSales.amount,
      exempt: normalSummary.totalExemptProfits.amount,
      taxable: normalSummary.totalTaxableProfits.amount,
      losses: normalSummary.totalLossesIncurred.amount,
      due: normalSummary.totalTaxDue.amount,
    },
    dayTrade: {
      profits: dtSummary.totalGrossProfits.amount,
      losses: dtSummary.totalLossesIncurred.amount,
      due: dtSummary.totalTaxDue.amount,
    },
    fii: {
      profits: fiiSummary.totalGrossProfits.amount,
      losses: fiiSummary.totalLossesIncurred.amount,
      due: fiiSummary.totalTaxDue.amount,
    },
    lossCarry: {
      normalClosing: normalLossCont.closingLossDecember31.amount,
      dtClosing: dtLossCont.closingLossDecember31.amount,
      fiiClosing: fiiLossCont.closingLossDecember31.amount,
    },
    darf6015: {
      principal: obligations6015Summary.totalPrincipalDue.amount,
      paid: obligations6015Summary.totalPaid.amount,
    },
  });

  const fingerprint = createHash('sha256').update(fingerprintPayload).digest('hex');

  return Object.freeze({
    calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    isComplete,
    qualityIssues: Object.freeze([...collectedIssues].sort()),
    months: Object.freeze(monthlySnapshots),
    normalEquities: normalSummary,
    dayTrade: dtSummary,
    fii: fiiSummary,
    lossCarry: lossCarrySummary,
    obligations6015: obligations6015Summary,
    calculatedAt,
    fingerprint,
  });
}
