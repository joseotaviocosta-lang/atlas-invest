import { formatCurrency } from '../formatters';
import { colors } from '../tokens/colors';

export interface RawAnnualPosition {
  readonly assetId: string;
  readonly ticker?: string;
  readonly assetCategory: string;
  readonly quantity: string;
  readonly totalHistoricalCost: string | null;
  readonly averageHistoricalCost: string | null;
  readonly currency: string;
  readonly costBasisStatus: string;
  readonly completenessStatus: string;
  readonly blockingReasons: readonly string[];
  readonly openingPositionApplied: boolean;
  readonly openingPositionId?: string;
  readonly trace: {
    readonly appliedTransactionCount: number;
    readonly corporateActionCount: number;
    readonly openingPositionApplied: boolean;
    readonly provenanceSummary: string;
  };
}

export interface RawAnnualPositionSummary {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly totalAssetsCount: number;
  readonly completePositionsCount: number;
  readonly blockedPositionsCount: number;
  readonly requiresConfirmationCount: number;
  readonly totalHistoricalCostKnown: string | null;
  readonly currency: string;
  readonly completenessStatus: string;
}

export interface RawAnnualPositionReport {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly period: {
    readonly calendarYear: number;
    readonly declarationExercise: number;
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly positions: readonly RawAnnualPosition[];
  readonly summary: RawAnnualPositionSummary;
  readonly generatedAt: string;
  readonly version: string;
}

export interface AnnualPositionViewModel {
  readonly assetId: string;
  readonly ticker: string;
  readonly assetCategory: string;
  readonly categoryLabel: string;
  readonly quantity: string;
  readonly totalHistoricalCost: string | null;
  readonly formattedTotalHistoricalCost: string;
  readonly averageHistoricalCost: string | null;
  readonly formattedAverageHistoricalCost: string;
  readonly currency: string;
  readonly costBasisStatus: string;
  readonly completenessStatus: string;
  readonly completenessBadge: {
    readonly label: string;
    readonly color: string;
    readonly bg: string;
  };
  readonly blockingReasons: readonly { readonly code: string; readonly label: string }[];
  readonly openingPositionApplied: boolean;
  readonly openingPositionId?: string;
  readonly provenanceSummary: string;
  readonly appliedTransactionCount: number;
  readonly corporateActionCount: number;
}

export interface AnnualPositionSummaryViewModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly totalAssetsCount: number;
  readonly completePositionsCount: number;
  readonly blockedPositionsCount: number;
  readonly requiresConfirmationCount: number;
  readonly totalHistoricalCostKnown: string | null;
  readonly formattedTotalHistoricalCost: string;
  readonly currency: string;
  readonly completenessStatus: string;
  readonly completenessBadge: {
    readonly label: string;
    readonly color: string;
    readonly bg: string;
  };
}

export interface AnnualPositionReportViewModel {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly periodLabel: string;
  readonly positions: readonly AnnualPositionViewModel[];
  readonly summary: AnnualPositionSummaryViewModel;
  readonly generatedAt: string;
  readonly version: string;
}

export function annualPositionsQueryKey(calendarYear: number, portfolioId: string): string[] {
  return ['fiscal', 'annual', String(calendarYear), 'positions', portfolioId];
}

export function annualOpeningPositionsQueryKey(portfolioId?: string): string[] {
  return ['fiscal', 'annual', 'opening-positions', portfolioId ?? 'all'];
}

function completenessBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'COMPLETE':
      return {
        label: 'COMPLETO',
        color: colors.positive,
        bg: 'rgba(52, 211, 153, 0.1)',
      };
    case 'REQUIRES_CONFIRMATION':
      return {
        label: 'REQUER CONFIRMAÇÃO',
        color: colors.warning,
        bg: 'rgba(251, 191, 36, 0.1)',
      };
    case 'PARTIAL':
      return {
        label: 'PARCIAL',
        color: colors.warning,
        bg: 'rgba(251, 191, 36, 0.1)',
      };
    case 'BLOCKED':
    default:
      return {
        label: 'BLOQUEADO',
        color: colors.negative,
        bg: 'rgba(248, 113, 113, 0.1)',
      };
  }
}

function blockingReasonLabel(code: string): string {
  switch (code) {
    case 'UNKNOWN_COST_BASIS':
      return 'Custo de aquisição desconhecido / incompleto';
    case 'OVERLAPPING_OPENING_AND_LEDGER_HISTORY':
      return 'Sobreposição entre posição inicial de abertura e histórico de transações';
    case 'UNCONFIRMED_OPENING_POSITION':
      return 'Posição inicial pendente de confirmação';
    case 'UNSUPPORTED_ASSET_CLASS':
      return 'Classe de ativo não suportada nesta fase';
    case 'MISSING_OPENING_HISTORY':
      return 'Histórico prévio de custódia ausente';
    case 'CURRENCY_CONVERSION_MISSING':
      return 'Conversão cambial de moeda ausente';
    default:
      return code;
  }
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'BRAZILIAN_EQUITY':
    case 'EQUITY':
      return 'Ações (Bens e Direitos)';
    case 'FII':
      return 'FIIs (Bens e Direitos)';
    case 'ETF':
      return 'ETFs';
    case 'BDR':
      return 'BDRs';
    default:
      return cat;
  }
}

export function mapToAnnualPositionReportViewModel(
  raw: RawAnnualPositionReport | null | undefined,
): AnnualPositionReportViewModel | null {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' || !raw.summary) return null;

  const positions: AnnualPositionViewModel[] = (raw.positions ?? []).map((pos) => {
    const formattedTotal = pos.totalHistoricalCost
      ? formatCurrency(pos.totalHistoricalCost, pos.currency)
      : '—';
    const formattedAvg = pos.averageHistoricalCost
      ? formatCurrency(pos.averageHistoricalCost, pos.currency)
      : '—';

    return {
      assetId: pos.assetId,
      ticker: pos.ticker ?? pos.assetId.slice(0, 8),
      assetCategory: pos.assetCategory,
      categoryLabel: categoryLabel(pos.assetCategory),
      quantity: pos.quantity,
      totalHistoricalCost: pos.totalHistoricalCost,
      formattedTotalHistoricalCost: formattedTotal,
      averageHistoricalCost: pos.averageHistoricalCost,
      formattedAverageHistoricalCost: formattedAvg,
      currency: pos.currency,
      costBasisStatus: pos.costBasisStatus,
      completenessStatus: pos.completenessStatus,
      completenessBadge: completenessBadge(pos.completenessStatus),
      blockingReasons: (pos.blockingReasons ?? []).map((code) => ({
        code,
        label: blockingReasonLabel(code),
      })),
      openingPositionApplied: pos.openingPositionApplied,
      openingPositionId: pos.openingPositionId,
      provenanceSummary: pos.trace?.provenanceSummary ?? '',
      appliedTransactionCount: pos.trace?.appliedTransactionCount ?? 0,
      corporateActionCount: pos.trace?.corporateActionCount ?? 0,
    };
  });

  const summary = raw.summary;
  const formattedSummaryTotal = summary?.totalHistoricalCostKnown
    ? formatCurrency(summary.totalHistoricalCostKnown, summary.currency)
    : '—';

  return {
    taxSubjectId: raw.taxSubjectId,
    portfolioId: raw.portfolioId,
    calendarYear: raw.calendarYear,
    declarationExercise: raw.declarationExercise,
    asOfDate: raw.asOfDate,
    periodLabel: `Ano-calendário ${raw.calendarYear} (Exercício ${raw.declarationExercise})`,
    positions,
    summary: {
      calendarYear: summary?.calendarYear ?? raw.calendarYear,
      declarationExercise: summary?.declarationExercise ?? raw.declarationExercise,
      asOfDate: summary?.asOfDate ?? raw.asOfDate,
      totalAssetsCount: summary?.totalAssetsCount ?? positions.length,
      completePositionsCount: summary?.completePositionsCount ?? 0,
      blockedPositionsCount: summary?.blockedPositionsCount ?? 0,
      requiresConfirmationCount: summary?.requiresConfirmationCount ?? 0,
      totalHistoricalCostKnown: summary?.totalHistoricalCostKnown ?? null,
      formattedTotalHistoricalCost: formattedSummaryTotal,
      currency: summary?.currency ?? 'BRL',
      completenessStatus: summary?.completenessStatus ?? 'BLOCKED',
      completenessBadge: completenessBadge(summary?.completenessStatus ?? 'BLOCKED'),
    },
    generatedAt: raw.generatedAt,
    version: raw.version,
  };
}
