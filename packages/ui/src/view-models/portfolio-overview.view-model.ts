import { formatCurrency, formatPercentage, formatQuantity } from '../formatters';

export interface MoneyDto {
  readonly amount: string;
  readonly currency: string;
}

export interface PositionDto {
  readonly assetId: string;
  readonly ticker?: string | null;
  readonly assetName?: string | null;
  readonly quantity: string;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly currency?: string;
  readonly totalCost: MoneyDto | null;
  readonly averageCost: MoneyDto | null;
}

export interface AccountStateDto {
  readonly accountId: string;
  readonly positions: readonly PositionDto[];
  readonly realizedSummaries?: readonly RealizedSummaryDto[];
  readonly incomeSummaries?: readonly IncomeSummaryDto[];
  readonly cashFlowSummaries?: readonly CashFlowSummaryDto[];
}

export interface RealizedSummaryDto {
  readonly currency: string;
  readonly status: 'KNOWN' | 'INCOMPLETE';
  readonly grossProceeds: MoneyDto;
  readonly sellingCosts: MoneyDto;
  readonly netProceeds: MoneyDto;
  readonly costBasisRemoved: MoneyDto | null;
  readonly realizedGainLoss: MoneyDto | null;
  readonly realizedReturnPercentage: string | null;
  readonly disposalCount: number;
}

export interface IncomeSummaryDto {
  readonly currency: string;
  readonly totalDividends: MoneyDto;
  readonly totalJcp: MoneyDto;
  readonly totalFiiIncome: MoneyDto;
  readonly totalIncome: MoneyDto;
}

export interface CashFlowSummaryDto {
  readonly currency: string;
  readonly totalInflows: MoneyDto;
  readonly totalOutflows: MoneyDto;
  readonly netExternalFlow: MoneyDto;
  readonly totalExternalContributions: MoneyDto;
  readonly totalExternalWithdrawals: MoneyDto;
  readonly totalCapitalReturns: MoneyDto;
  readonly totalFees: MoneyDto;
  readonly totalTaxes: MoneyDto;
}

export interface ReplayMetadataDto {
  readonly engineVersion: string;
  readonly asOfDate: string | null;
  readonly processedTransactionCount: number;
  readonly appliedTransactionCount: number;
  readonly deferredTransactionCount: number;
  readonly hasIncompleteCostBasis: boolean;
}

export interface PortfolioStateDto {
  readonly portfolioId: string;
  readonly asOfDate: string | null;
  readonly engineVersion?: string;
  readonly completeness: {
    readonly costBasis: 'COMPLETE' | 'INCOMPLETE';
  };
  readonly positions: readonly PositionDto[];
  readonly accounts: readonly AccountStateDto[];
  readonly realizedSummaries: readonly RealizedSummaryDto[];
  readonly incomeSummaries: readonly IncomeSummaryDto[];
  readonly cashFlowSummaries: readonly CashFlowSummaryDto[];
  readonly replayMetadata?: ReplayMetadataDto;
}

export interface PortfolioMeta {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly baseCurrency: string;
}

export interface AccountMeta {
  readonly id: string;
  readonly name: string;
}

export interface AssetMeta {
  readonly id: string;
  readonly ticker: string;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly currency?: string | null;
}

export interface PositionAccountBreakdownItem {
  readonly accountId: string;
  readonly accountName: string;
  readonly quantity: string;
  readonly rawQuantity: string;
  readonly averageCost: string;
  readonly totalCost: string;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly currency: string;
}

export interface PortfolioOverviewPositionItem {
  readonly assetId: string;
  readonly displayIdentifier: string;
  readonly ticker?: string | null;
  readonly assetName?: string | null;
  readonly quantity: string;
  readonly rawQuantity: string;
  readonly currency: string;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly averageCost: string;
  readonly totalCost: string;
  readonly accountCount: number;
  readonly accounts: readonly PositionAccountBreakdownItem[];
}

export interface RealizedResultCardItem {
  readonly currency: string;
  readonly formattedAmount: string;
  readonly isPositive: boolean;
  readonly isNegative: boolean;
  readonly isZero: boolean;
  readonly formattedPercentage: string | null;
  readonly disposalCount: number;
  readonly status: 'KNOWN' | 'INCOMPLETE';
}

export interface IncomeReceivedCardItem {
  readonly currency: string;
  readonly formattedAmount: string;
  readonly breakdown: {
    readonly dividends: string;
    readonly jcp: string;
    readonly fiiIncome: string;
  };
}

export interface PortfolioOverviewViewModel {
  readonly header: {
    readonly portfolioId: string;
    readonly name: string;
    readonly type: string;
    readonly typeLabel: string;
    readonly baseCurrency: string;
    readonly openPositionsCount: number;
    readonly accountsCount: number;
    readonly hasIncompleteCostBasis: boolean;
  };
  readonly completenessNotice: {
    readonly hasIncompletePositions: boolean;
    readonly message: string | null;
  };
  readonly summaryCards: {
    readonly openPositionsCount: number;
    readonly realizedResult: readonly RealizedResultCardItem[];
    readonly incomeReceived: readonly IncomeReceivedCardItem[];
  };
  readonly positions: readonly PortfolioOverviewPositionItem[];
  readonly stateIndicators: {
    readonly isEmptyPortfolio: boolean;
    readonly hasNoOpenPositions: boolean;
    readonly hasCashFlowsOnly: boolean;
  };
}

const TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Pessoal',
  FAMILY: 'Família',
  COMPANY: 'Empresa',
  SIMULATION: 'Simulação',
};

/**
 * Transforms a PortfolioStateDto into a pure, presentation-ready PortfolioOverviewViewModel.
 *
 * Strict invariants:
 * - NO recalculation of financial values (no quantity * averageCost).
 * - Multi-currency values are segregated and never cross-converted.
 * - Incomplete cost basis renders as "—", never 0 or "R$ 0,00".
 */
export function mapToPortfolioOverviewViewModel(
  state: PortfolioStateDto,
  portfolioMeta?: PortfolioMeta | null,
  accountsMeta?: Record<string, AccountMeta> | readonly AccountMeta[] | null,
  assetsMeta?: Record<string, AssetMeta> | readonly AssetMeta[] | null,
): PortfolioOverviewViewModel {
  const portfolioId = state.portfolioId;
  const metaName = portfolioMeta?.name || 'Minha Carteira';
  const metaType = portfolioMeta?.type || 'PERSONAL';
  const baseCurrency = portfolioMeta?.baseCurrency || 'BRL';

  // Build account name resolver
  const accountNameMap = new Map<string, string>();
  if (accountsMeta) {
    if (Array.isArray(accountsMeta)) {
      for (const acc of accountsMeta) {
        accountNameMap.set(acc.id, acc.name);
      }
    } else {
      for (const [id, acc] of Object.entries(accountsMeta)) {
        accountNameMap.set(id, acc.name);
      }
    }
  }

  // Build asset metadata resolver
  const assetMetaMap = new Map<string, AssetMeta>();
  if (assetsMeta) {
    if (Array.isArray(assetsMeta)) {
      for (const asset of assetsMeta) {
        assetMetaMap.set(asset.id, asset);
      }
    } else {
      for (const [id, asset] of Object.entries(assetsMeta)) {
        assetMetaMap.set(id, asset);
      }
    }
  }

  const hasIncompleteCostBasis =
    state.completeness.costBasis === 'INCOMPLETE' ||
    state.positions.some((p) => p.costBasisStatus === 'INCOMPLETE') ||
    Boolean(state.replayMetadata?.hasIncompleteCostBasis);

  // Map positions
  const positions: PortfolioOverviewPositionItem[] = state.positions.map((pos) => {
    const currency = pos.currency || pos.totalCost?.currency || baseCurrency;
    const isCostKnown = pos.costBasisStatus === 'KNOWN';

    const formattedAvgCost =
      isCostKnown && pos.averageCost ? formatCurrency(pos.averageCost.amount, currency) : '—';

    const formattedTotalCost =
      isCostKnown && pos.totalCost ? formatCurrency(pos.totalCost.amount, currency) : '—';

    // Find account breakdown for this asset
    const accountBreakdowns: PositionAccountBreakdownItem[] = [];
    for (const acc of state.accounts) {
      const accPos = acc.positions.find((p) => p.assetId === pos.assetId);
      if (accPos) {
        const accCurrency = accPos.currency || accPos.totalCost?.currency || currency;
        const accCostKnown = accPos.costBasisStatus === 'KNOWN';
        const fallbackName = `Conta ${acc.accountId.slice(0, 8)}`;
        const accountName = accountNameMap.get(acc.accountId) || fallbackName;

        accountBreakdowns.push({
          accountId: acc.accountId,
          accountName,
          quantity: formatQuantity(accPos.quantity),
          rawQuantity: accPos.quantity,
          averageCost:
            accCostKnown && accPos.averageCost
              ? formatCurrency(accPos.averageCost.amount, accCurrency)
              : '—',
          totalCost:
            accCostKnown && accPos.totalCost
              ? formatCurrency(accPos.totalCost.amount, accCurrency)
              : '—',
          costBasisStatus: accPos.costBasisStatus,
          currency: accCurrency,
        });
      }
    }

    const assetMeta = assetMetaMap.get(pos.assetId);
    const resolvedTicker = assetMeta?.ticker || pos.ticker || null;
    const resolvedName = assetMeta?.name || pos.assetName || null;
    const displayIdentifier = resolvedTicker || pos.assetId;

    return {
      assetId: pos.assetId,
      displayIdentifier,
      ticker: resolvedTicker,
      assetName: resolvedName,
      quantity: formatQuantity(pos.quantity),
      rawQuantity: pos.quantity,
      currency,
      costBasisStatus: pos.costBasisStatus,
      averageCost: formattedAvgCost,
      totalCost: formattedTotalCost,
      accountCount: accountBreakdowns.length,
      accounts: accountBreakdowns,
    };
  });

  // Sort positions stably by displayIdentifier ASC
  positions.sort((a, b) => a.displayIdentifier.localeCompare(b.displayIdentifier));

  // Summary Card 1: Realized Result per currency (from official API summaries)
  const realizedResult: RealizedResultCardItem[] = state.realizedSummaries.map((summary) => {
    const amountStr = summary.realizedGainLoss?.amount ?? '0';
    const isNegative = amountStr.startsWith('-');
    const isZero = amountStr === '0' || amountStr === '0.00' || /^0+(\.0+)?$/.test(amountStr);
    const isPositive = !isNegative && !isZero;

    const formattedPercentage = summary.realizedReturnPercentage
      ? formatPercentage(summary.realizedReturnPercentage, { showSign: true })
      : null;

    return {
      currency: summary.currency,
      formattedAmount: formatCurrency(amountStr, summary.currency),
      isPositive,
      isNegative,
      isZero,
      formattedPercentage,
      disposalCount: summary.disposalCount,
      status: summary.status,
    };
  });
  realizedResult.sort((a, b) => a.currency.localeCompare(b.currency));

  // Summary Card 3: Income Received per currency
  const incomeReceived: IncomeReceivedCardItem[] = state.incomeSummaries.map((inc) => {
    return {
      currency: inc.currency,
      formattedAmount: formatCurrency(inc.totalIncome.amount, inc.currency),
      breakdown: {
        dividends: formatCurrency(inc.totalDividends.amount, inc.currency),
        jcp: formatCurrency(inc.totalJcp.amount, inc.currency),
        fiiIncome: formatCurrency(inc.totalFiiIncome.amount, inc.currency),
      },
    };
  });
  incomeReceived.sort((a, b) => a.currency.localeCompare(b.currency));

  // Completeness Notice
  const completenessNotice = {
    hasIncompletePositions: hasIncompleteCostBasis,
    message: hasIncompleteCostBasis
      ? 'Algumas posições possuem custo de aquisição incompleto. Os valores de custo e preço médio dessas posições não podem ser exibidos com precisão.'
      : null,
  };

  const processedCount = state.replayMetadata?.processedTransactionCount ?? 0;
  const isEmptyPortfolio = processedCount === 0 && state.positions.length === 0;
  const hasNoOpenPositions = state.positions.length === 0;
  const hasCashFlowsOnly = hasNoOpenPositions && processedCount > 0;

  return {
    header: {
      portfolioId,
      name: metaName,
      type: metaType,
      typeLabel: TYPE_LABELS[metaType] || metaType,
      baseCurrency,
      openPositionsCount: positions.length,
      accountsCount: state.accounts.length,
      hasIncompleteCostBasis,
    },
    completenessNotice,
    summaryCards: {
      openPositionsCount: positions.length,
      realizedResult,
      incomeReceived,
    },
    positions,
    stateIndicators: {
      isEmptyPortfolio,
      hasNoOpenPositions,
      hasCashFlowsOnly,
    },
  };
}
