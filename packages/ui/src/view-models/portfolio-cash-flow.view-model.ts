import { formatCurrency, formatDate } from '../formatters';
import {
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from './asset-position-detail.view-model';
import { AccountMeta } from './portfolio-overview.view-model';

export type CashFlowType = 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'TAX' | 'AMORTIZATION';

export interface CashFlowEventViewModel {
  readonly id: string;
  readonly transactionId: string;
  readonly type: CashFlowType;
  readonly typeLabel: string;
  readonly direction: 'INFLOW' | 'OUTFLOW' | null;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly assetId: string | null;
  readonly assetTicker: string | null;
  readonly assetName: string | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly category: string | null;
  readonly secondaryContext: string | null;
}

export interface CashFlowSummaryCardItem {
  readonly currency: string;
  readonly totalInflows: string;
  readonly formattedTotalInflows: string;
  readonly totalOutflows: string;
  readonly formattedTotalOutflows: string;
  readonly formattedNetExternalFlow: string;
  readonly netExternalFlowDirection: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  readonly totalExternalContributions: string;
  readonly formattedContributions: string;
  readonly totalExternalWithdrawals: string;
  readonly formattedWithdrawals: string;
  readonly totalCapitalReturns: string;
  readonly formattedCapitalReturns: string;
  readonly totalFees: string;
  readonly formattedFees: string;
  readonly totalTaxes: string;
  readonly formattedTaxes: string;
  readonly depositCount: number;
  readonly withdrawalCount: number;
  readonly feeCount: number;
  readonly taxCount: number;
  readonly amortizationCount: number;
}

export interface PortfolioCashFlowGroupViewModel {
  readonly date: string;
  readonly formattedDate: string;
  readonly items: readonly CashFlowEventViewModel[];
}

export interface PortfolioCashFlowViewModel {
  readonly portfolioId: string;
  readonly portfolioName: string;
  readonly groups: readonly PortfolioCashFlowGroupViewModel[];
  readonly summaryCards: readonly CashFlowSummaryCardItem[];
  readonly rawItemsCount: number;
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly isEmpty: boolean;
}

export interface BuildPortfolioCashFlowOptions {
  readonly portfolioId: string;
  readonly portfolioName?: string;
  readonly historyItems: readonly PortfolioHistoryItemDto[];
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly cashFlowSummaries?:
    | readonly {
        currency: string;
        totalInflows: { amount: string; currency: string };
        totalOutflows: { amount: string; currency: string };
        netExternalFlow: { amount: string; currency: string };
        totalExternalContributions: { amount: string; currency: string };
        totalExternalWithdrawals: { amount: string; currency: string };
        totalCapitalReturns: { amount: string; currency: string };
        totalFees: { amount: string; currency: string };
        totalTaxes: { amount: string; currency: string };
      }[]
    | null;
  readonly accountsMeta?: readonly AccountMeta[] | Record<string, AccountMeta> | null;
  readonly assetsMeta?: readonly AssetMeta[] | Record<string, AssetMeta> | null;
}

const CASH_FLOW_TYPE_LABELS: Record<CashFlowType, string> = {
  DEPOSIT: 'Depósito',
  WITHDRAWAL: 'Retirada',
  FEE: 'Taxa',
  TAX: 'Tributo pago',
  AMORTIZATION: 'Amortização',
};

const CASH_FLOW_DIRECTION_LABELS: Record<string, string> = {
  INFLOW: 'Entrada',
  OUTFLOW: 'Saída',
};

const MONTH_NAMES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function formatCivilDateHeader(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return formatDate(dateStr);
  }
  const [yearStr = '', monthStr = '', dayStr = ''] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${day} de ${MONTH_NAMES_PT[monthIdx]} de ${year}`;
  }
  return formatDate(dateStr);
}

export function buildPortfolioCashFlowViewModel(
  options: BuildPortfolioCashFlowOptions,
): PortfolioCashFlowViewModel {
  const {
    portfolioId,
    portfolioName = 'Minha Carteira',
    historyItems,
    pagination,
    cashFlowSummaries,
    accountsMeta,
    assetsMeta,
  } = options;

  const accountMap = new Map<string, string>();
  if (accountsMeta) {
    if (Array.isArray(accountsMeta)) {
      for (const a of accountsMeta) {
        accountMap.set(a.id, a.name);
      }
    } else {
      for (const [id, a] of Object.entries(accountsMeta)) {
        accountMap.set(id, a.name);
      }
    }
  }

  const assetMap = new Map<string, AssetMeta>();
  if (assetsMeta) {
    if (Array.isArray(assetsMeta)) {
      for (const a of assetsMeta) {
        assetMap.set(a.id, a);
      }
    } else {
      for (const [id, a] of Object.entries(assetsMeta)) {
        assetMap.set(id, a);
      }
    }
  }

  const mappedItems: CashFlowEventViewModel[] = historyItems.map((item) => {
    const details = (item.details || {}) as {
      type?: CashFlowType;
      direction?: 'INFLOW' | 'OUTFLOW';
      category?: string;
      amount?: { amount: string; currency: string };
    };

    const cfType: CashFlowType = details.type || 'DEPOSIT';
    const kindLabel = CASH_FLOW_TYPE_LABELS[cfType] || 'Movimentação';
    const direction = details.direction ?? null;
    const amountMoney = details.amount ?? null;
    const formattedAmount = amountMoney
      ? formatCurrency(amountMoney.amount, amountMoney.currency)
      : null;
    const accountName = accountMap.get(item.accountId) || `Conta ${item.accountId.slice(0, 8)}`;
    const asset = item.assetId ? assetMap.get(item.assetId) || null : null;
    const assetTicker = asset?.ticker || (item.assetId ? item.assetId.slice(0, 8) : null);
    const assetName = asset?.name || assetTicker;
    const formattedTradeDate = formatDate(item.tradeDate);

    let secondaryContext: string | null = null;
    if (cfType === 'AMORTIZATION') {
      secondaryContext = 'Devolução de capital';
    } else if (cfType === 'TAX') {
      secondaryContext = null;
    } else if (direction) {
      secondaryContext = CASH_FLOW_DIRECTION_LABELS[direction] || null;
    }

    return {
      id: item.id,
      transactionId: item.transactionId,
      type: cfType,
      typeLabel: kindLabel,
      direction,
      tradeDate: item.tradeDate,
      formattedTradeDate,
      accountId: item.accountId,
      accountName,
      assetId: item.assetId,
      assetTicker,
      assetName,
      amount: formattedAmount,
      currency: amountMoney?.currency ?? item.currency,
      category: details.category ?? null,
      secondaryContext,
    };
  });

  const groupMap = new Map<string, CashFlowEventViewModel[]>();
  for (const item of mappedItems) {
    const existing = groupMap.get(item.tradeDate);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.tradeDate, [item]);
    }
  }

  const groups: PortfolioCashFlowGroupViewModel[] = [];
  for (const [date, items] of groupMap.entries()) {
    groups.push({
      date,
      formattedDate: formatCivilDateHeader(date),
      items,
    });
  }

  const summaryCards: CashFlowSummaryCardItem[] = [];
  if (cashFlowSummaries) {
    for (const summary of cashFlowSummaries) {
      const currency = summary.currency;

      const totalInflows = summary.totalInflows?.amount ?? '0';
      const totalOutflows = summary.totalOutflows?.amount ?? '0';
      const netExternalFlow = summary.netExternalFlow?.amount ?? '0';
      const contributions = summary.totalExternalContributions?.amount ?? '0';
      const withdrawals = summary.totalExternalWithdrawals?.amount ?? '0';
      const capitalReturns = summary.totalCapitalReturns?.amount ?? '0';
      const fees = summary.totalFees?.amount ?? '0';
      const taxes = summary.totalTaxes?.amount ?? '0';

      const netDirection: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL' = netExternalFlow.startsWith('-')
        ? 'OUTFLOW'
        : netExternalFlow === '0' || netExternalFlow === '0.00'
          ? 'NEUTRAL'
          : 'INFLOW';

      summaryCards.push({
        currency,
        totalInflows,
        formattedTotalInflows: formatCurrency(totalInflows, currency),
        totalOutflows,
        formattedTotalOutflows: formatCurrency(totalOutflows, currency),
        formattedNetExternalFlow: formatCurrency(netExternalFlow, currency),
        netExternalFlowDirection: netDirection,
        totalExternalContributions: contributions,
        formattedContributions: formatCurrency(contributions, currency),
        totalExternalWithdrawals: withdrawals,
        formattedWithdrawals: formatCurrency(withdrawals, currency),
        totalCapitalReturns: capitalReturns,
        formattedCapitalReturns: formatCurrency(capitalReturns, currency),
        totalFees: fees,
        formattedFees: formatCurrency(fees, currency),
        totalTaxes: taxes,
        formattedTaxes: formatCurrency(taxes, currency),
        depositCount: mappedItems.filter((i) => i.type === 'DEPOSIT' && i.currency === currency)
          .length,
        withdrawalCount: mappedItems.filter(
          (i) => i.type === 'WITHDRAWAL' && i.currency === currency,
        ).length,
        feeCount: mappedItems.filter((i) => i.type === 'FEE' && i.currency === currency).length,
        taxCount: mappedItems.filter((i) => i.type === 'TAX' && i.currency === currency).length,
        amortizationCount: mappedItems.filter(
          (i) => i.type === 'AMORTIZATION' && i.currency === currency,
        ).length,
      });
    }
  }

  summaryCards.sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    portfolioId,
    portfolioName,
    groups,
    summaryCards,
    rawItemsCount: mappedItems.length,
    pagination,
    isEmpty: mappedItems.length === 0,
  };
}
