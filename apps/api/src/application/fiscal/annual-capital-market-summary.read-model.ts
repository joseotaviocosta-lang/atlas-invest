import { AnnualCapitalMarketFiscalSummary } from '@atlas/tax-engine';

export interface AnnualMonthlyCategorySnapshotReadModel {
  readonly grossSaleAmount: string;
  readonly isExempt: boolean;
  readonly profitOrLoss: string;
  readonly lossCompensated: string;
  readonly taxableBase: string;
  readonly irrfDeducted: string;
  readonly taxDue: string;
}

export interface AnnualMonthlyDarf6015SnapshotReadModel {
  readonly obligationId: string | null;
  readonly status: string;
  readonly principalAmount: string;
  readonly paidAmount: string;
}

export interface AnnualMonthlyFiscalSnapshotReadModel {
  readonly competence: string;
  readonly month: number;
  readonly normalEquities: AnnualMonthlyCategorySnapshotReadModel;
  readonly dayTrade: AnnualMonthlyCategorySnapshotReadModel;
  readonly fii: AnnualMonthlyCategorySnapshotReadModel;
  readonly totalTaxDue: string;
  readonly darf6015: AnnualMonthlyDarf6015SnapshotReadModel;
}

export interface AnnualNormalEquitySummaryReadModel {
  readonly totalGrossSales: string;
  readonly totalExemptProfits: string;
  readonly totalTaxableProfits: string;
  readonly totalLossesIncurred: string;
  readonly totalLossesCompensated: string;
  readonly totalNetTaxableBase: string;
  readonly totalTaxDue: string;
  readonly totalIrrfDeducted: string;
  readonly uncompensatedIrrf: string;
  readonly uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT';
}

export interface AnnualDayTradeSummaryReadModel {
  readonly totalGrossProfits: string;
  readonly totalLossesIncurred: string;
  readonly totalLossesCompensated: string;
  readonly totalNetTaxableBase: string;
  readonly totalTaxDue: string;
  readonly totalIrrfDeducted: string;
  readonly uncompensatedIrrf: string;
  readonly uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_RESTITUTION';
}

export interface AnnualFiiSummaryReadModel {
  readonly totalGrossProfits: string;
  readonly totalLossesIncurred: string;
  readonly totalLossesCompensated: string;
  readonly totalNetTaxableBase: string;
  readonly totalTaxDue: string;
  readonly totalIrrfDeducted: string;
}

export interface AnnualCategoryLossContinuityReadModel {
  readonly category: 'NORMAL_EQUITIES' | 'DAY_TRADE' | 'FII';
  readonly openingLossJanuary1: string;
  readonly lossesAdded: string;
  readonly lossesConsumed: string;
  readonly closingLossDecember31: string;
}

export interface AnnualLossCarrySummaryReadModel {
  readonly normalEquities: AnnualCategoryLossContinuityReadModel;
  readonly dayTrade: AnnualCategoryLossContinuityReadModel;
  readonly fii: AnnualCategoryLossContinuityReadModel;
  readonly isConsistent: boolean;
}

export interface Annual6015SummaryReadModel {
  readonly totalPrincipalDue: string;
  readonly totalPaid: string;
  readonly totalOverdue: string;
  readonly monthsWithLiabilityCount: number;
  readonly monthsSettledCount: number;
}

export interface AnnualCapitalMarketFiscalSummaryReadModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: string;
  readonly isComplete: boolean;
  readonly qualityIssues: readonly string[];
  readonly months: readonly AnnualMonthlyFiscalSnapshotReadModel[];
  readonly normalEquities: AnnualNormalEquitySummaryReadModel;
  readonly dayTrade: AnnualDayTradeSummaryReadModel;
  readonly fii: AnnualFiiSummaryReadModel;
  readonly lossCarry: AnnualLossCarrySummaryReadModel;
  readonly obligations6015: Annual6015SummaryReadModel;
  readonly calculatedAt: string;
  readonly fingerprint: string;
}

export function mapAnnualCapitalMarketSummaryToReadModel(
  summary: AnnualCapitalMarketFiscalSummary,
): AnnualCapitalMarketFiscalSummaryReadModel {
  return {
    calendarYear: summary.calendarYear as number,
    declarationExercise: summary.declarationExercise as number,
    taxSubjectId: summary.taxSubjectId,
    currency: String(summary.currency),
    isComplete: summary.isComplete,
    qualityIssues: summary.qualityIssues,
    months: summary.months.map((m) => ({
      competence: m.competence,
      month: m.month,
      normalEquities: {
        grossSaleAmount: m.normalEquities.grossSaleAmount.amount,
        isExempt: m.normalEquities.isExempt,
        profitOrLoss: m.normalEquities.profitOrLoss.amount,
        lossCompensated: m.normalEquities.lossCompensated.amount,
        taxableBase: m.normalEquities.taxableBase.amount,
        irrfDeducted: m.normalEquities.irrfDeducted.amount,
        taxDue: m.normalEquities.taxDue.amount,
      },
      dayTrade: {
        grossSaleAmount: m.dayTrade.grossSaleAmount.amount,
        isExempt: m.dayTrade.isExempt,
        profitOrLoss: m.dayTrade.profitOrLoss.amount,
        lossCompensated: m.dayTrade.lossCompensated.amount,
        taxableBase: m.dayTrade.taxableBase.amount,
        irrfDeducted: m.dayTrade.irrfDeducted.amount,
        taxDue: m.dayTrade.taxDue.amount,
      },
      fii: {
        grossSaleAmount: m.fii.grossSaleAmount.amount,
        isExempt: m.fii.isExempt,
        profitOrLoss: m.fii.profitOrLoss.amount,
        lossCompensated: m.fii.lossCompensated.amount,
        taxableBase: m.fii.taxableBase.amount,
        irrfDeducted: m.fii.irrfDeducted.amount,
        taxDue: m.fii.taxDue.amount,
      },
      totalTaxDue: m.totalTaxDue.amount,
      darf6015: {
        obligationId: m.darf6015.obligationId,
        status: m.darf6015.status,
        principalAmount: m.darf6015.principalAmount.amount,
        paidAmount: m.darf6015.paidAmount.amount,
      },
    })),
    normalEquities: {
      totalGrossSales: summary.normalEquities.totalGrossSales.amount,
      totalExemptProfits: summary.normalEquities.totalExemptProfits.amount,
      totalTaxableProfits: summary.normalEquities.totalTaxableProfits.amount,
      totalLossesIncurred: summary.normalEquities.totalLossesIncurred.amount,
      totalLossesCompensated: summary.normalEquities.totalLossesCompensated.amount,
      totalNetTaxableBase: summary.normalEquities.totalNetTaxableBase.amount,
      totalTaxDue: summary.normalEquities.totalTaxDue.amount,
      totalIrrfDeducted: summary.normalEquities.totalIrrfDeducted.amount,
      uncompensatedIrrf: summary.normalEquities.uncompensatedIrrf.amount,
      uncompensatedIrrfTerminalState: summary.normalEquities.uncompensatedIrrfTerminalState,
    },
    dayTrade: {
      totalGrossProfits: summary.dayTrade.totalGrossProfits.amount,
      totalLossesIncurred: summary.dayTrade.totalLossesIncurred.amount,
      totalLossesCompensated: summary.dayTrade.totalLossesCompensated.amount,
      totalNetTaxableBase: summary.dayTrade.totalNetTaxableBase.amount,
      totalTaxDue: summary.dayTrade.totalTaxDue.amount,
      totalIrrfDeducted: summary.dayTrade.totalIrrfDeducted.amount,
      uncompensatedIrrf: summary.dayTrade.uncompensatedIrrf.amount,
      uncompensatedIrrfTerminalState: summary.dayTrade.uncompensatedIrrfTerminalState,
    },
    fii: {
      totalGrossProfits: summary.fii.totalGrossProfits.amount,
      totalLossesIncurred: summary.fii.totalLossesIncurred.amount,
      totalLossesCompensated: summary.fii.totalLossesCompensated.amount,
      totalNetTaxableBase: summary.fii.totalNetTaxableBase.amount,
      totalTaxDue: summary.fii.totalTaxDue.amount,
      totalIrrfDeducted: summary.fii.totalIrrfDeducted.amount,
    },
    lossCarry: {
      normalEquities: {
        category: summary.lossCarry.normalEquities.category,
        openingLossJanuary1: summary.lossCarry.normalEquities.openingLossJanuary1.amount,
        lossesAdded: summary.lossCarry.normalEquities.lossesAdded.amount,
        lossesConsumed: summary.lossCarry.normalEquities.lossesConsumed.amount,
        closingLossDecember31: summary.lossCarry.normalEquities.closingLossDecember31.amount,
      },
      dayTrade: {
        category: summary.lossCarry.dayTrade.category,
        openingLossJanuary1: summary.lossCarry.dayTrade.openingLossJanuary1.amount,
        lossesAdded: summary.lossCarry.dayTrade.lossesAdded.amount,
        lossesConsumed: summary.lossCarry.dayTrade.lossesConsumed.amount,
        closingLossDecember31: summary.lossCarry.dayTrade.closingLossDecember31.amount,
      },
      fii: {
        category: summary.lossCarry.fii.category,
        openingLossJanuary1: summary.lossCarry.fii.openingLossJanuary1.amount,
        lossesAdded: summary.lossCarry.fii.lossesAdded.amount,
        lossesConsumed: summary.lossCarry.fii.lossesConsumed.amount,
        closingLossDecember31: summary.lossCarry.fii.closingLossDecember31.amount,
      },
      isConsistent: summary.lossCarry.isConsistent,
    },
    obligations6015: {
      totalPrincipalDue: summary.obligations6015.totalPrincipalDue.amount,
      totalPaid: summary.obligations6015.totalPaid.amount,
      totalOverdue: summary.obligations6015.totalOverdue.amount,
      monthsWithLiabilityCount: summary.obligations6015.monthsWithLiabilityCount,
      monthsSettledCount: summary.obligations6015.monthsSettledCount,
    },
    calculatedAt: summary.calculatedAt,
    fingerprint: summary.fingerprint,
  };
}
