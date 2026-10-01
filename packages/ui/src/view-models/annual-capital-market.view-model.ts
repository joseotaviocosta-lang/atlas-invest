import { formatCurrency } from '../formatters';
import { colors } from '../tokens/colors';

export interface RawAnnualMonthlyCategorySnapshot {
  readonly grossSaleAmount: string;
  readonly isExempt: boolean;
  readonly profitOrLoss: string;
  readonly lossCompensated: string;
  readonly taxableBase: string;
  readonly irrfDeducted: string;
  readonly taxDue: string;
}

export interface RawAnnualMonthlyDarf6015Snapshot {
  readonly obligationId: string | null;
  readonly status: string;
  readonly principalAmount: string;
  readonly paidAmount: string;
}

export interface RawAnnualMonthlyFiscalSnapshot {
  readonly competence: string;
  readonly month: number;
  readonly normalEquities: RawAnnualMonthlyCategorySnapshot;
  readonly dayTrade: RawAnnualMonthlyCategorySnapshot;
  readonly fii: RawAnnualMonthlyCategorySnapshot;
  readonly totalTaxDue: string;
  readonly darf6015: RawAnnualMonthlyDarf6015Snapshot;
}

export interface RawAnnualNormalEquitySummary {
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

export interface RawAnnualDayTradeSummary {
  readonly totalGrossProfits: string;
  readonly totalLossesIncurred: string;
  readonly totalLossesCompensated: string;
  readonly totalNetTaxableBase: string;
  readonly totalTaxDue: string;
  readonly totalIrrfDeducted: string;
  readonly uncompensatedIrrf: string;
  readonly uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_RESTITUTION';
}

export interface RawAnnualFiiSummary {
  readonly totalGrossProfits: string;
  readonly totalLossesIncurred: string;
  readonly totalLossesCompensated: string;
  readonly totalNetTaxableBase: string;
  readonly totalTaxDue: string;
  readonly totalIrrfDeducted: string;
}

export interface RawAnnualCategoryLossContinuity {
  readonly category: 'NORMAL_EQUITIES' | 'DAY_TRADE' | 'FII';
  readonly openingLossJanuary1: string;
  readonly lossesAdded: string;
  readonly lossesConsumed: string;
  readonly closingLossDecember31: string;
}

export interface RawAnnualLossCarrySummary {
  readonly normalEquities: RawAnnualCategoryLossContinuity;
  readonly dayTrade: RawAnnualCategoryLossContinuity;
  readonly fii: RawAnnualCategoryLossContinuity;
  readonly isConsistent: boolean;
}

export interface RawAnnual6015Summary {
  readonly totalPrincipalDue: string;
  readonly totalPaid: string;
  readonly totalOverdue: string;
  readonly monthsWithLiabilityCount: number;
  readonly monthsSettledCount: number;
}

export interface RawAnnualCapitalMarketFiscalSummary {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: string;
  readonly isComplete: boolean;
  readonly qualityIssues: readonly string[];
  readonly months: readonly RawAnnualMonthlyFiscalSnapshot[];
  readonly normalEquities: RawAnnualNormalEquitySummary;
  readonly dayTrade: RawAnnualDayTradeSummary;
  readonly fii: RawAnnualFiiSummary;
  readonly lossCarry: RawAnnualLossCarrySummary;
  readonly obligations6015: RawAnnual6015Summary;
  readonly calculatedAt: string;
  readonly fingerprint: string;
}

export interface AnnualMonthlySnapshotViewModel {
  readonly competence: string;
  readonly month: number;
  readonly monthLabel: string;
  readonly normalEquities: {
    readonly formattedGrossSales: string;
    readonly isExempt: boolean;
    readonly formattedProfitOrLoss: string;
    readonly formattedLossCompensated: string;
    readonly formattedTaxableBase: string;
    readonly formattedIrrfDeducted: string;
    readonly formattedTaxDue: string;
  };
  readonly dayTrade: {
    readonly formattedProfitOrLoss: string;
    readonly formattedLossCompensated: string;
    readonly formattedTaxableBase: string;
    readonly formattedIrrfDeducted: string;
    readonly formattedTaxDue: string;
  };
  readonly fii: {
    readonly formattedProfitOrLoss: string;
    readonly formattedLossCompensated: string;
    readonly formattedTaxableBase: string;
    readonly formattedIrrfDeducted: string;
    readonly formattedTaxDue: string;
  };
  readonly formattedTotalTaxDue: string;
  readonly darf6015: {
    readonly obligationId: string | null;
    readonly status: string;
    readonly statusLabel: string;
    readonly formattedPrincipalAmount: string;
    readonly formattedPaidAmount: string;
  };
}

export interface AnnualCapitalMarketViewModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly periodLabel: string;
  readonly currency: string;
  readonly isComplete: boolean;
  readonly qualityIssues: readonly string[];
  readonly months: readonly AnnualMonthlySnapshotViewModel[];
  readonly normalEquities: {
    readonly formattedGrossSales: string;
    readonly formattedExemptProfits: string;
    readonly formattedTaxableProfits: string;
    readonly formattedLossesIncurred: string;
    readonly formattedLossesCompensated: string;
    readonly formattedNetTaxableBase: string;
    readonly formattedTaxDue: string;
    readonly formattedIrrfDeducted: string;
    readonly formattedUncompensatedIrrf: string;
    readonly uncompensatedIrrfTerminalState: string;
  };
  readonly dayTrade: {
    readonly formattedGrossProfits: string;
    readonly formattedLossesIncurred: string;
    readonly formattedLossesCompensated: string;
    readonly formattedNetTaxableBase: string;
    readonly formattedTaxDue: string;
    readonly formattedIrrfDeducted: string;
    readonly formattedUncompensatedIrrf: string;
    readonly uncompensatedIrrfTerminalState: string;
  };
  readonly fii: {
    readonly formattedGrossProfits: string;
    readonly formattedLossesIncurred: string;
    readonly formattedLossesCompensated: string;
    readonly formattedNetTaxableBase: string;
    readonly formattedTaxDue: string;
    readonly formattedIrrfDeducted: string;
  };
  readonly lossCarry: {
    readonly normalEquities: {
      readonly formattedOpeningLoss: string;
      readonly formattedLossesAdded: string;
      readonly formattedLossesConsumed: string;
      readonly formattedClosingLoss: string;
    };
    readonly dayTrade: {
      readonly formattedOpeningLoss: string;
      readonly formattedLossesAdded: string;
      readonly formattedLossesConsumed: string;
      readonly formattedClosingLoss: string;
    };
    readonly fii: {
      readonly formattedOpeningLoss: string;
      readonly formattedLossesAdded: string;
      readonly formattedLossesConsumed: string;
      readonly formattedClosingLoss: string;
    };
    readonly isConsistent: boolean;
  };
  readonly obligations6015: {
    readonly formattedPrincipalDue: string;
    readonly formattedTotalPaid: string;
    readonly formattedTotalOverdue: string;
    readonly monthsWithLiabilityCount: number;
    readonly monthsSettledCount: number;
  };
  readonly statusBadge: {
    readonly label: string;
    readonly color: string;
    readonly bg: string;
  };
  readonly calculatedAt: string;
  readonly fingerprint: string;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function annualCapitalMarketQueryKey(calendarYear: number): string[] {
  return ['fiscal', 'annual', String(calendarYear), 'capital-market'];
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PAID':
    case 'SETTLED':
      return 'Pago';
    case 'GENERATED':
    case 'OPEN':
      return 'Pendente';
    case 'BELOW_MINIMUM':
      return 'Abaixo do Mínimo';
    case 'EXEMPT':
      return 'Isento';
    case 'OVERDUE':
      return 'Em Atraso';
    default:
      return status;
  }
}

export function mapToAnnualCapitalMarketViewModel(
  raw: RawAnnualCapitalMarketFiscalSummary | null,
): AnnualCapitalMarketViewModel | null {
  if (!raw) return null;
  const currency = raw.currency ?? 'BRL';

  const months: AnnualMonthlySnapshotViewModel[] = (raw.months ?? []).map((m) => {
    return {
      competence: m.competence,
      month: m.month,
      monthLabel: MONTH_NAMES[m.month - 1] ?? `Mês ${m.month}`,
      normalEquities: {
        formattedGrossSales: formatCurrency(m.normalEquities.grossSaleAmount, currency),
        isExempt: m.normalEquities.isExempt,
        formattedProfitOrLoss: formatCurrency(m.normalEquities.profitOrLoss, currency),
        formattedLossCompensated: formatCurrency(m.normalEquities.lossCompensated, currency),
        formattedTaxableBase: formatCurrency(m.normalEquities.taxableBase, currency),
        formattedIrrfDeducted: formatCurrency(m.normalEquities.irrfDeducted, currency),
        formattedTaxDue: formatCurrency(m.normalEquities.taxDue, currency),
      },
      dayTrade: {
        formattedProfitOrLoss: formatCurrency(m.dayTrade.profitOrLoss, currency),
        formattedLossCompensated: formatCurrency(m.dayTrade.lossCompensated, currency),
        formattedTaxableBase: formatCurrency(m.dayTrade.taxableBase, currency),
        formattedIrrfDeducted: formatCurrency(m.dayTrade.irrfDeducted, currency),
        formattedTaxDue: formatCurrency(m.dayTrade.taxDue, currency),
      },
      fii: {
        formattedProfitOrLoss: formatCurrency(m.fii.profitOrLoss, currency),
        formattedLossCompensated: formatCurrency(m.fii.lossCompensated, currency),
        formattedTaxableBase: formatCurrency(m.fii.taxableBase, currency),
        formattedIrrfDeducted: formatCurrency(m.fii.irrfDeducted, currency),
        formattedTaxDue: formatCurrency(m.fii.taxDue, currency),
      },
      formattedTotalTaxDue: formatCurrency(m.totalTaxDue, currency),
      darf6015: {
        obligationId: m.darf6015.obligationId,
        status: m.darf6015.status,
        statusLabel: statusLabel(m.darf6015.status),
        formattedPrincipalAmount: formatCurrency(m.darf6015.principalAmount, currency),
        formattedPaidAmount: formatCurrency(m.darf6015.paidAmount, currency),
      },
    };
  });

  const isComplete = raw.isComplete;
  const statusBadge = isComplete
    ? { label: 'CONSOLIDADO', color: colors.positive, bg: 'rgba(52, 211, 153, 0.1)' }
    : { label: 'PENDENTE / PARCIAL', color: colors.warning, bg: 'rgba(251, 191, 36, 0.1)' };

  return {
    calendarYear: raw.calendarYear,
    declarationExercise: raw.declarationExercise,
    periodLabel: `Ano-calendário ${raw.calendarYear} (Exercício ${raw.declarationExercise})`,
    currency,
    isComplete,
    qualityIssues: raw.qualityIssues ?? [],
    months,
    normalEquities: {
      formattedGrossSales: formatCurrency(raw.normalEquities.totalGrossSales, currency),
      formattedExemptProfits: formatCurrency(raw.normalEquities.totalExemptProfits, currency),
      formattedTaxableProfits: formatCurrency(raw.normalEquities.totalTaxableProfits, currency),
      formattedLossesIncurred: formatCurrency(raw.normalEquities.totalLossesIncurred, currency),
      formattedLossesCompensated: formatCurrency(
        raw.normalEquities.totalLossesCompensated,
        currency,
      ),
      formattedNetTaxableBase: formatCurrency(raw.normalEquities.totalNetTaxableBase, currency),
      formattedTaxDue: formatCurrency(raw.normalEquities.totalTaxDue, currency),
      formattedIrrfDeducted: formatCurrency(raw.normalEquities.totalIrrfDeducted, currency),
      formattedUncompensatedIrrf: formatCurrency(raw.normalEquities.uncompensatedIrrf, currency),
      uncompensatedIrrfTerminalState: 'Ajuste Anual (DIRPF)',
    },
    dayTrade: {
      formattedGrossProfits: formatCurrency(raw.dayTrade.totalGrossProfits, currency),
      formattedLossesIncurred: formatCurrency(raw.dayTrade.totalLossesIncurred, currency),
      formattedLossesCompensated: formatCurrency(raw.dayTrade.totalLossesCompensated, currency),
      formattedNetTaxableBase: formatCurrency(raw.dayTrade.totalNetTaxableBase, currency),
      formattedTaxDue: formatCurrency(raw.dayTrade.totalTaxDue, currency),
      formattedIrrfDeducted: formatCurrency(raw.dayTrade.totalIrrfDeducted, currency),
      formattedUncompensatedIrrf: formatCurrency(raw.dayTrade.uncompensatedIrrf, currency),
      uncompensatedIrrfTerminalState: 'Restituição / Compensação',
    },
    fii: {
      formattedGrossProfits: formatCurrency(raw.fii.totalGrossProfits, currency),
      formattedLossesIncurred: formatCurrency(raw.fii.totalLossesIncurred, currency),
      formattedLossesCompensated: formatCurrency(raw.fii.totalLossesCompensated, currency),
      formattedNetTaxableBase: formatCurrency(raw.fii.totalNetTaxableBase, currency),
      formattedTaxDue: formatCurrency(raw.fii.totalTaxDue, currency),
      formattedIrrfDeducted: formatCurrency(raw.fii.totalIrrfDeducted, currency),
    },
    lossCarry: {
      normalEquities: {
        formattedOpeningLoss: formatCurrency(
          raw.lossCarry.normalEquities.openingLossJanuary1,
          currency,
        ),
        formattedLossesAdded: formatCurrency(raw.lossCarry.normalEquities.lossesAdded, currency),
        formattedLossesConsumed: formatCurrency(
          raw.lossCarry.normalEquities.lossesConsumed,
          currency,
        ),
        formattedClosingLoss: formatCurrency(
          raw.lossCarry.normalEquities.closingLossDecember31,
          currency,
        ),
      },
      dayTrade: {
        formattedOpeningLoss: formatCurrency(raw.lossCarry.dayTrade.openingLossJanuary1, currency),
        formattedLossesAdded: formatCurrency(raw.lossCarry.dayTrade.lossesAdded, currency),
        formattedLossesConsumed: formatCurrency(raw.lossCarry.dayTrade.lossesConsumed, currency),
        formattedClosingLoss: formatCurrency(
          raw.lossCarry.dayTrade.closingLossDecember31,
          currency,
        ),
      },
      fii: {
        formattedOpeningLoss: formatCurrency(raw.lossCarry.fii.openingLossJanuary1, currency),
        formattedLossesAdded: formatCurrency(raw.lossCarry.fii.lossesAdded, currency),
        formattedLossesConsumed: formatCurrency(raw.lossCarry.fii.lossesConsumed, currency),
        formattedClosingLoss: formatCurrency(raw.lossCarry.fii.closingLossDecember31, currency),
      },
      isConsistent: raw.lossCarry.isConsistent,
    },
    obligations6015: {
      formattedPrincipalDue: formatCurrency(raw.obligations6015.totalPrincipalDue, currency),
      formattedTotalPaid: formatCurrency(raw.obligations6015.totalPaid, currency),
      formattedTotalOverdue: formatCurrency(raw.obligations6015.totalOverdue, currency),
      monthsWithLiabilityCount: raw.obligations6015.monthsWithLiabilityCount,
      monthsSettledCount: raw.obligations6015.monthsSettledCount,
    },
    statusBadge,
    calculatedAt: raw.calculatedAt,
    fingerprint: raw.fingerprint,
  };
}
