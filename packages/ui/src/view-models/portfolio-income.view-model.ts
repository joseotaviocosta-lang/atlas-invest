import { formatCurrency, formatDate } from '../formatters';
import {
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
  AssetMeta,
} from './asset-position-detail.view-model';
import { AccountMeta } from './portfolio-overview.view-model';

export type IncomeType = 'DIVIDEND' | 'JCP' | 'FII_INCOME';

export interface IncomeEventViewModel {
  readonly id: string;
  readonly transactionId: string;
  readonly type: IncomeType;
  readonly typeLabel: string;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly assetId: string | null;
  readonly assetTicker: string | null;
  readonly assetName: string | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly isCostBasisIncomplete: boolean;
  readonly canNavigateToAsset: boolean;
}

export interface IncomeSummaryCardItem {
  readonly currency: string;
  readonly totalIncome: string;
  readonly formattedTotalIncome: string;
  readonly dividends: string;
  readonly formattedDividends: string;
  readonly jcp: string;
  readonly formattedJcp: string;
  readonly fiiIncome: string;
  readonly formattedFiiIncome: string;
  readonly totalIncomeCount: number;
}

export interface PortfolioIncomeGroupViewModel {
  readonly date: string;
  readonly formattedDate: string;
  readonly items: readonly IncomeEventViewModel[];
}

export interface PortfolioIncomeViewModel {
  readonly portfolioId: string;
  readonly portfolioName: string;
  readonly groups: readonly PortfolioIncomeGroupViewModel[];
  readonly summaryCards: readonly IncomeSummaryCardItem[];
  readonly rawItemsCount: number;
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly isEmpty: boolean;
}

export interface BuildPortfolioIncomeOptions {
  readonly portfolioId: string;
  readonly portfolioName?: string;
  readonly historyItems: readonly PortfolioHistoryItemDto[];
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly incomeSummaries?:
    | readonly {
        currency: string;
        totalDividends: { amount: string; currency: string };
        totalJcp: { amount: string; currency: string };
        totalFiiIncome: { amount: string; currency: string };
        totalIncome: { amount: string; currency: string };
      }[]
    | null;
  readonly accountsMeta?: readonly AccountMeta[] | Record<string, AccountMeta> | null;
  readonly assetsMeta?: readonly AssetMeta[] | Record<string, AssetMeta> | null;
}

const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  DIVIDEND: 'Dividendo',
  JCP: 'JCP',
  FII_INCOME: 'Rendimento de FII',
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

export function buildPortfolioIncomeViewModel(
  options: BuildPortfolioIncomeOptions,
): PortfolioIncomeViewModel {
  const {
    portfolioId,
    portfolioName = 'Minha Carteira',
    historyItems,
    pagination,
    incomeSummaries,
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

  const mappedItems: IncomeEventViewModel[] = historyItems.map((item) => {
    const details = (item.details || {}) as {
      type?: IncomeType;
      amount?: { amount: string; currency: string };
      grossAmount?: { amount: string; currency: string };
      status?: string;
    };

    const incType: IncomeType = details.type || 'DIVIDEND';
    const kindLabel = INCOME_TYPE_LABELS[incType] || 'Rendimento';
    const amountMoney = details.amount ?? null;
    const formattedAmount = amountMoney
      ? formatCurrency(amountMoney.amount, amountMoney.currency)
      : null;
    const accountName = accountMap.get(item.accountId) || `Conta ${item.accountId.slice(0, 8)}`;
    const asset = item.assetId ? assetMap.get(item.assetId) || null : null;
    const assetTicker = asset?.ticker || (item.assetId ? item.assetId.slice(0, 8) : null);
    const assetName = asset?.name || assetTicker;
    const canNavigateToAsset = item.assetId ? true : false;
    const formattedTradeDate = formatDate(item.tradeDate);

    return {
      id: item.id,
      transactionId: item.transactionId,
      type: incType,
      typeLabel: kindLabel,
      tradeDate: item.tradeDate,
      formattedTradeDate,
      accountId: item.accountId,
      accountName,
      assetId: item.assetId,
      assetTicker,
      assetName,
      amount: formattedAmount,
      currency: amountMoney?.currency ?? item.currency,
      status: details.status ?? null,
      isCostBasisIncomplete: details.status === 'INCOMPLETE',
      canNavigateToAsset,
    };
  });

  const groupMap = new Map<string, IncomeEventViewModel[]>();
  for (const item of mappedItems) {
    const existing = groupMap.get(item.tradeDate);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.tradeDate, [item]);
    }
  }

  const groups: PortfolioIncomeGroupViewModel[] = [];
  for (const [date, items] of groupMap.entries()) {
    groups.push({
      date,
      formattedDate: formatCivilDateHeader(date),
      items,
    });
  }

  const summaryCards: IncomeSummaryCardItem[] = [];
  if (incomeSummaries) {
    for (const summary of incomeSummaries) {
      const currency = summary.currency;
      const totalDividends = summary.totalDividends?.amount ?? '0';
      const totalJcp = summary.totalJcp?.amount ?? '0';
      const totalFiiIncome = summary.totalFiiIncome?.amount ?? '0';
      const totalIncome = summary.totalIncome?.amount ?? '0';

      summaryCards.push({
        currency,
        totalIncome,
        formattedTotalIncome: formatCurrency(totalIncome, currency),
        dividends: totalDividends,
        formattedDividends: formatCurrency(totalDividends, currency),
        jcp: totalJcp,
        formattedJcp: formatCurrency(totalJcp, currency),
        fiiIncome: totalFiiIncome,
        formattedFiiIncome: formatCurrency(totalFiiIncome, currency),
        totalIncomeCount: mappedItems.filter((item) => item.currency === currency).length,
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
