import { formatCurrency } from '../formatters';

export function annualInvestmentIncomeQueryKey(calendarYear: number | string): readonly string[] {
  return ['fiscal', 'annual', String(calendarYear), 'income'];
}

export interface FormattedAnnualIncomeCategoryViewModel {
  readonly incomeType: string;
  readonly typeLabel: string;
  readonly formattedGrossAmount: string;
  readonly formattedWithheldTax: string;
  readonly formattedNetAmount: string;
  readonly eventCount: number;
  readonly taxTreatmentLabel: string;
  readonly isComplete: boolean;
}

export interface FormattedAnnualIncomePayerViewModel {
  readonly payerId: string;
  readonly payerDisplayName: string;
  readonly formattedDividendGross: string;
  readonly formattedJcpGross: string;
  readonly formattedJcpWithheld: string;
  readonly formattedFiiIncomeGross: string;
  readonly formattedTotalGross: string;
  readonly formattedTotalWithheld: string;
  readonly isComplete: boolean;
}

export interface FormattedAnnualMonthlyIncomeViewModel {
  readonly competence: string;
  readonly monthLabel: string;
  readonly formattedDividendsGross: string;
  readonly formattedJcpGross: string;
  readonly formattedJcpWithheld: string;
  readonly formattedFiiIncomeGross: string;
  readonly formattedTotalGross: string;
  readonly formattedTotalWithheld: string;
  readonly eventCount: number;
}

export interface AnnualInvestmentIncomeViewModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly isComplete: boolean;
  readonly status: string;
  readonly statusLabel: string;
  readonly formattedTotalGrossIncome: string;
  readonly formattedTotalWithheldTax: string;
  readonly dividends: FormattedAnnualIncomeCategoryViewModel;
  readonly jcp: FormattedAnnualIncomeCategoryViewModel;
  readonly fiiIncome: FormattedAnnualIncomeCategoryViewModel;
  readonly payers: readonly FormattedAnnualIncomePayerViewModel[];
  readonly months: readonly FormattedAnnualMonthlyIncomeViewModel[];
  readonly qualityIssues: readonly string[];
  readonly blockingReasons: readonly string[];
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

export interface RawAnnualInvestmentIncomeSummary {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly isComplete: boolean;
  readonly status: string;
  readonly currency: string;
  readonly qualityIssues: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly dividends: {
    readonly incomeType: string;
    readonly totalGrossAmount: string;
    readonly totalWithheldTax: string;
    readonly totalNetAmount: string;
    readonly eventCount: number;
    readonly taxTreatmentSummary: string;
    readonly isComplete: boolean;
  };
  readonly jcp: {
    readonly incomeType: string;
    readonly totalGrossAmount: string;
    readonly totalWithheldTax: string;
    readonly totalNetAmount: string;
    readonly eventCount: number;
    readonly taxTreatmentSummary: string;
    readonly isComplete: boolean;
  };
  readonly fiiIncome: {
    readonly incomeType: string;
    readonly totalGrossAmount: string;
    readonly totalWithheldTax: string;
    readonly totalNetAmount: string;
    readonly eventCount: number;
    readonly taxTreatmentSummary: string;
    readonly isComplete: boolean;
  };
  readonly totalGrossIncome: string;
  readonly totalWithheldTax: string;
  readonly payers: readonly {
    readonly payerId: string;
    readonly payerDisplayName: string;
    readonly dividendGross: string;
    readonly jcpGross: string;
    readonly jcpWithheld: string;
    readonly fiiIncomeGross: string;
    readonly totalGross: string;
    readonly totalWithheld: string;
    readonly isComplete: boolean;
  }[];
  readonly months: readonly {
    readonly competence: string;
    readonly month: number;
    readonly dividendsGross: string;
    readonly jcpGross: string;
    readonly jcpWithheld: string;
    readonly fiiIncomeGross: string;
    readonly totalGross: string;
    readonly totalWithheld: string;
    readonly eventCount: number;
  }[];
  readonly fingerprint: string;
}

export function formatAnnualInvestmentIncomeViewModel(
  data: RawAnnualInvestmentIncomeSummary | null | undefined,
): AnnualInvestmentIncomeViewModel | null {
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== 'object' ||
    !data.dividends ||
    !data.jcp ||
    !data.fiiIncome
  ) {
    return null;
  }

  const cur = data.currency ?? 'BRL';

  let statusLabel = 'Completo';
  if (data.status === 'BLOCKED') {
    statusLabel = 'Bloqueado';
  } else if (data.status === 'REQUIRES_CONFIRMATION') {
    statusLabel = 'Requer Confirmação';
  } else if (!data.isComplete) {
    statusLabel = 'Incompleto';
  }

  return {
    calendarYear: data.calendarYear,
    declarationExercise: data.declarationExercise,
    isComplete: data.isComplete,
    status: data.status,
    statusLabel,
    formattedTotalGrossIncome: formatCurrency(data.totalGrossIncome, cur),
    formattedTotalWithheldTax: formatCurrency(data.totalWithheldTax, cur),
    dividends: {
      incomeType: data.dividends.incomeType,
      typeLabel: 'Dividendos',
      formattedGrossAmount: formatCurrency(data.dividends.totalGrossAmount, cur),
      formattedWithheldTax: formatCurrency(data.dividends.totalWithheldTax, cur),
      formattedNetAmount: formatCurrency(data.dividends.totalNetAmount, cur),
      eventCount: data.dividends.eventCount,
      taxTreatmentLabel: 'Isento e Não Tributável',
      isComplete: data.dividends.isComplete,
    },
    jcp: {
      incomeType: data.jcp.incomeType,
      typeLabel: 'Juros sobre Capital Próprio (JCP)',
      formattedGrossAmount: formatCurrency(data.jcp.totalGrossAmount, cur),
      formattedWithheldTax: formatCurrency(data.jcp.totalWithheldTax, cur),
      formattedNetAmount: formatCurrency(data.jcp.totalNetAmount, cur),
      eventCount: data.jcp.eventCount,
      taxTreatmentLabel: 'Tributação Exclusiva (15%)',
      isComplete: data.jcp.isComplete,
    },
    fiiIncome: {
      incomeType: data.fiiIncome.incomeType,
      typeLabel: 'Rendimentos de FII',
      formattedGrossAmount: formatCurrency(data.fiiIncome.totalGrossAmount, cur),
      formattedWithheldTax: formatCurrency(data.fiiIncome.totalWithheldTax, cur),
      formattedNetAmount: formatCurrency(data.fiiIncome.totalNetAmount, cur),
      eventCount: data.fiiIncome.eventCount,
      taxTreatmentLabel: data.fiiIncome.isComplete
        ? 'Isento e Não Tributável'
        : 'Requer Confirmação',
      isComplete: data.fiiIncome.isComplete,
    },
    payers: data.payers.map((p) => ({
      payerId: p.payerId,
      payerDisplayName: p.payerDisplayName,
      formattedDividendGross: formatCurrency(p.dividendGross, cur),
      formattedJcpGross: formatCurrency(p.jcpGross, cur),
      formattedJcpWithheld: formatCurrency(p.jcpWithheld, cur),
      formattedFiiIncomeGross: formatCurrency(p.fiiIncomeGross, cur),
      formattedTotalGross: formatCurrency(p.totalGross, cur),
      formattedTotalWithheld: formatCurrency(p.totalWithheld, cur),
      isComplete: p.isComplete,
    })),
    months: data.months.map((m) => ({
      competence: m.competence,
      monthLabel: MONTH_NAMES[m.month - 1] ?? `Mês ${m.month}`,
      formattedDividendsGross: formatCurrency(m.dividendsGross, cur),
      formattedJcpGross: formatCurrency(m.jcpGross, cur),
      formattedJcpWithheld: formatCurrency(m.jcpWithheld, cur),
      formattedFiiIncomeGross: formatCurrency(m.fiiIncomeGross, cur),
      formattedTotalGross: formatCurrency(m.totalGross, cur),
      formattedTotalWithheld: formatCurrency(m.totalWithheld, cur),
      eventCount: m.eventCount,
    })),
    qualityIssues: data.qualityIssues,
    blockingReasons: data.blockingReasons,
    fingerprint: data.fingerprint,
  };
}
