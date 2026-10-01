import { Currency, Money } from '@atlas/domain';
import { CalendarYear, DeclarationExercise } from './annual-period';

export interface AnnualMonthlyCategorySnapshot {
  readonly grossSaleAmount: Money;
  readonly isExempt: boolean;
  readonly profitOrLoss: Money;
  readonly lossCompensated: Money;
  readonly taxableBase: Money;
  readonly irrfDeducted: Money;
  readonly taxDue: Money;
}

export interface AnnualMonthlyDarf6015Snapshot {
  readonly obligationId: string | null;
  readonly status: string;
  readonly principalAmount: Money;
  readonly paidAmount: Money;
}

export interface AnnualMonthlyFiscalSnapshot {
  readonly competence: string;
  readonly month: number;
  readonly normalEquities: AnnualMonthlyCategorySnapshot;
  readonly dayTrade: AnnualMonthlyCategorySnapshot;
  readonly fii: AnnualMonthlyCategorySnapshot;
  readonly totalTaxDue: Money;
  readonly darf6015: AnnualMonthlyDarf6015Snapshot;
}

export interface AnnualNormalEquitySummary {
  readonly totalGrossSales: Money;
  readonly totalExemptProfits: Money;
  readonly totalTaxableProfits: Money;
  readonly totalLossesIncurred: Money;
  readonly totalLossesCompensated: Money;
  readonly totalNetTaxableBase: Money;
  readonly totalTaxDue: Money;
  readonly totalIrrfDeducted: Money;
  readonly uncompensatedIrrf: Money;
  readonly uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT';
}

export interface AnnualDayTradeSummary {
  readonly totalGrossProfits: Money;
  readonly totalLossesIncurred: Money;
  readonly totalLossesCompensated: Money;
  readonly totalNetTaxableBase: Money;
  readonly totalTaxDue: Money;
  readonly totalIrrfDeducted: Money;
  readonly uncompensatedIrrf: Money;
  readonly uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_RESTITUTION';
}

export interface AnnualFiiSummary {
  readonly totalGrossProfits: Money;
  readonly totalLossesIncurred: Money;
  readonly totalLossesCompensated: Money;
  readonly totalNetTaxableBase: Money;
  readonly totalTaxDue: Money;
  readonly totalIrrfDeducted: Money;
}

export interface AnnualCategoryLossContinuity {
  readonly category: 'NORMAL_EQUITIES' | 'DAY_TRADE' | 'FII';
  readonly openingLossJanuary1: Money;
  readonly lossesAdded: Money;
  readonly lossesConsumed: Money;
  readonly closingLossDecember31: Money;
}

export interface AnnualLossCarrySummary {
  readonly normalEquities: AnnualCategoryLossContinuity;
  readonly dayTrade: AnnualCategoryLossContinuity;
  readonly fii: AnnualCategoryLossContinuity;
  readonly isConsistent: boolean;
}

export interface Annual6015Summary {
  readonly totalPrincipalDue: Money;
  readonly totalPaid: Money;
  readonly totalOverdue: Money;
  readonly monthsWithLiabilityCount: number;
  readonly monthsSettledCount: number;
}

export interface AnnualCapitalMarketFiscalSummary {
  readonly calendarYear: CalendarYear;
  readonly declarationExercise: DeclarationExercise;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly isComplete: boolean;
  readonly qualityIssues: readonly string[];
  readonly months: readonly AnnualMonthlyFiscalSnapshot[];
  readonly normalEquities: AnnualNormalEquitySummary;
  readonly dayTrade: AnnualDayTradeSummary;
  readonly fii: AnnualFiiSummary;
  readonly lossCarry: AnnualLossCarrySummary;
  readonly obligations6015: Annual6015Summary;
  readonly calculatedAt: string;
  readonly fingerprint: string;
}
