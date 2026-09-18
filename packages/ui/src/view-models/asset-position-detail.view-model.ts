import { formatCurrency, formatPercentage, formatQuantity } from '../formatters';
import {
  PortfolioStateDto,
  PortfolioMeta,
  AccountMeta,
  MoneyDto,
} from './portfolio-overview.view-model';

export interface AssetMeta {
  readonly id: string;
  readonly ticker: string;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly currency?: string | null;
}

export interface PortfolioHistoryItemDto {
  readonly id: string;
  readonly kind: 'REALIZED_DISPOSAL' | 'INCOME' | 'CASH_FLOW' | 'CORPORATE_ACTION' | 'TRANSFER';
  readonly transactionId: string;
  readonly tradeDate: string;
  readonly accountId: string;
  readonly assetId: string | null;
  readonly currency: string | null;
  readonly details: Record<string, unknown>;
}

export interface PortfolioHistoryPaginationMetaDto {
  readonly limit: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly totalCount: number;
}

export interface AssetAccountBreakdownItem {
  readonly accountId: string;
  readonly accountName: string;
  readonly quantity: string;
  readonly rawQuantity: string;
  readonly averageCost: string;
  readonly totalCost: string;
  readonly currency: string;
  readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  readonly isCostBasisIncomplete: boolean;
}

export interface AssetRealizedDisposalItem {
  readonly transactionId: string;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly quantity: string;
  readonly grossProceeds: string;
  readonly sellingCosts: string;
  readonly netProceeds: string;
  readonly costBasisRemoved: string;
  readonly realizedGainLoss: string;
  readonly realizedReturnPercentage: string | null;
  readonly isPositive: boolean;
  readonly isNegative: boolean;
  readonly isZero: boolean;
  readonly status: 'KNOWN' | 'INCOMPLETE';
  readonly currency: string;
}

export interface AssetIncomeEventItem {
  readonly transactionId: string;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly type: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
  readonly typeLabel: string;
  readonly amount: string;
  readonly grossAmount: string;
  readonly status: 'KNOWN' | 'INCOMPLETE';
  readonly currency: string;
}

export interface AssetHistoryEventItem {
  readonly id: string;
  readonly kind: 'REALIZED_DISPOSAL' | 'INCOME' | 'CASH_FLOW' | 'CORPORATE_ACTION' | 'TRANSFER';
  readonly kindLabel: string;
  readonly transactionId: string;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly quantity: string | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly isCostBasisIncomplete: boolean;
  readonly description: string;
  readonly details: Record<string, unknown>;
}

export interface AssetPositionDetailViewModel {
  readonly header: {
    readonly assetId: string;
    readonly ticker: string;
    readonly name: string;
    readonly assetClass: string | null;
    readonly assetClassLabel: string | null;
    readonly portfolioId: string;
    readonly portfolioName: string;
    readonly isCostBasisIncomplete: boolean;
    readonly completenessBadgeLabel: string | null;
  };
  readonly primaryCard: {
    readonly quantity: string;
    readonly rawQuantity: string;
    readonly averageCost: string;
    readonly totalCost: string;
    readonly currency: string;
    readonly costBasisStatus: 'KNOWN' | 'INCOMPLETE';
    readonly isCostBasisIncomplete: boolean;
    readonly totalCostLabel: string;
  };
  readonly accountsBreakdown: readonly AssetAccountBreakdownItem[];
  readonly realizedResults: {
    readonly hasRealizedDisposals: boolean;
    readonly disposals: readonly AssetRealizedDisposalItem[];
  };
  readonly incomeReceived: {
    readonly hasIncomeEvents: boolean;
    readonly events: readonly AssetIncomeEventItem[];
  };
  readonly history: {
    readonly items: readonly AssetHistoryEventItem[];
    readonly pagination: {
      readonly limit: number;
      readonly cursor: string | null;
      readonly nextCursor: string | null;
      readonly hasMore: boolean;
      readonly totalCount: number;
    };
  };
  readonly isOpenPosition: boolean;
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: 'Ações',
  FII: 'Fundo Imobiliário',
  ETF: 'ETF',
  BDR: 'BDR',
  TREASURY: 'Tesouro Direto',
  FIXED_INCOME: 'Renda Fixa',
  CASH: 'Caixa',
  CRYPTO: 'Criptoativo',
  COMMODITY: 'Commodity',
  CURRENCY: 'Moeda',
};

const INCOME_TYPE_LABELS: Record<string, string> = {
  DIVIDEND: 'Dividendo',
  JCP: 'Juros sobre Capital Próprio',
  FII_INCOME: 'Rendimento FII',
};

const CORPORATE_ACTION_LABELS: Record<string, string> = {
  SPLIT: 'Desdobramento',
  REVERSE_SPLIT: 'Grupamento',
  BONUS: 'Bonificação',
  AMORTIZATION: 'Amortização',
};

export function formatDatePtBr(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr || '—';
  }
  const [year, month, day] = dateStr.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function mapToAssetPositionDetailViewModel(params: {
  readonly assetId: string;
  readonly state: PortfolioStateDto;
  readonly historyItems?: readonly PortfolioHistoryItemDto[];
  readonly historyMeta?: PortfolioHistoryPaginationMetaDto;
  readonly portfolioMeta?: PortfolioMeta | null;
  readonly accountsMeta?: Record<string, AccountMeta> | readonly AccountMeta[] | null;
  readonly assetMeta?: AssetMeta | null;
}): AssetPositionDetailViewModel {
  const {
    assetId,
    state,
    historyItems = [],
    historyMeta,
    portfolioMeta,
    accountsMeta,
    assetMeta,
  } = params;

  const portfolioId = state.portfolioId;
  const portfolioName = portfolioMeta?.name || 'Minha Carteira';
  const baseCurrency = portfolioMeta?.baseCurrency || 'BRL';

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

  const resolveAccountName = (accId: string): string => {
    return accountNameMap.get(accId) || `Conta ${accId.slice(0, 8)}`;
  };

  const pos = state.positions.find((p) => p.assetId === assetId);
  const isOpenPosition = Boolean(pos && pos.quantity !== '0');

  const ticker = assetMeta?.ticker || pos?.assetId || assetId;
  const assetName = assetMeta?.name || ticker;
  const assetClass = assetMeta?.type || null;
  const assetClassLabel = assetClass ? ASSET_CLASS_LABELS[assetClass] || assetClass : null;

  const currency = pos?.currency || pos?.totalCost?.currency || assetMeta?.currency || baseCurrency;
  const isCostBasisIncomplete = pos ? pos.costBasisStatus === 'INCOMPLETE' : false;

  const formattedAvgCost =
    pos && pos.costBasisStatus === 'KNOWN' && pos.averageCost
      ? formatCurrency(pos.averageCost.amount, currency)
      : '—';

  const formattedTotalCost =
    pos && pos.costBasisStatus === 'KNOWN' && pos.totalCost
      ? formatCurrency(pos.totalCost.amount, currency)
      : '—';

  const primaryCard = {
    quantity: pos ? formatQuantity(pos.quantity) : '0',
    rawQuantity: pos ? pos.quantity : '0',
    averageCost: formattedAvgCost,
    totalCost: formattedTotalCost,
    currency,
    costBasisStatus: pos?.costBasisStatus ?? 'KNOWN',
    isCostBasisIncomplete,
    totalCostLabel: isCostBasisIncomplete ? 'Custo total conhecido' : 'Custo total',
  };

  const accountsBreakdown: AssetAccountBreakdownItem[] = [];
  for (const acc of state.accounts) {
    const accPos = acc.positions.find((p) => p.assetId === assetId);
    if (accPos && accPos.quantity !== '0') {
      const accCurrency = accPos.currency || accPos.totalCost?.currency || currency;
      const accCostKnown = accPos.costBasisStatus === 'KNOWN';
      const accName = resolveAccountName(acc.accountId);

      accountsBreakdown.push({
        accountId: acc.accountId,
        accountName: accName,
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
        currency: accCurrency,
        costBasisStatus: accPos.costBasisStatus,
        isCostBasisIncomplete: accPos.costBasisStatus === 'INCOMPLETE',
      });
    }
  }
  accountsBreakdown.sort((a, b) => a.accountName.localeCompare(b.accountName));

  const assetDisposals = historyItems.filter(
    (item) => item.kind === 'REALIZED_DISPOSAL' && item.assetId === assetId,
  );

  const mappedDisposals: AssetRealizedDisposalItem[] = assetDisposals.map((d) => {
    const details = d.details as {
      quantity?: string;
      grossProceeds?: MoneyDto;
      sellingCosts?: MoneyDto;
      netProceeds?: MoneyDto;
      costBasisRemoved?: MoneyDto | null;
      realizedGainLoss?: MoneyDto | null;
      realizedReturnPercentage?: string | null;
      status?: 'KNOWN' | 'INCOMPLETE';
    };

    const dispCurrency = d.currency || currency;
    const isKnown = details.status === 'KNOWN';
    const amountStr = details.realizedGainLoss?.amount;

    const isNegative = Boolean(amountStr && amountStr.startsWith('-'));
    const isZero = Boolean(
      amountStr && (amountStr === '0' || amountStr === '0.00' || /^0+(\.0+)?$/.test(amountStr)),
    );
    const isPositive = Boolean(amountStr && !isNegative && !isZero);

    const formattedPercentage =
      isKnown && details.realizedReturnPercentage
        ? formatPercentage(details.realizedReturnPercentage, { showSign: true })
        : null;

    return {
      transactionId: d.transactionId,
      tradeDate: d.tradeDate,
      formattedTradeDate: formatDatePtBr(d.tradeDate),
      accountId: d.accountId,
      accountName: resolveAccountName(d.accountId),
      quantity: details.quantity ? formatQuantity(details.quantity) : '—',
      grossProceeds: details.grossProceeds
        ? formatCurrency(details.grossProceeds.amount, dispCurrency)
        : '—',
      sellingCosts: details.sellingCosts
        ? formatCurrency(details.sellingCosts.amount, dispCurrency)
        : '—',
      netProceeds: details.netProceeds
        ? formatCurrency(details.netProceeds.amount, dispCurrency)
        : '—',
      costBasisRemoved:
        isKnown && details.costBasisRemoved
          ? formatCurrency(details.costBasisRemoved.amount, dispCurrency)
          : '—',
      realizedGainLoss:
        isKnown && details.realizedGainLoss
          ? formatCurrency(details.realizedGainLoss.amount, dispCurrency)
          : '—',
      realizedReturnPercentage: formattedPercentage,
      isPositive,
      isNegative,
      isZero,
      status: details.status || 'KNOWN',
      currency: dispCurrency,
    };
  });

  const assetIncomeEvents = historyItems.filter(
    (item) => item.kind === 'INCOME' && item.assetId === assetId,
  );

  const mappedIncome: AssetIncomeEventItem[] = assetIncomeEvents.map((inc) => {
    const details = inc.details as {
      type?: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
      amount?: MoneyDto;
      grossAmount?: MoneyDto;
      status?: 'KNOWN' | 'INCOMPLETE';
    };

    const incType = details.type || 'DIVIDEND';
    const incCurrency = inc.currency || currency;

    return {
      transactionId: inc.transactionId,
      tradeDate: inc.tradeDate,
      formattedTradeDate: formatDatePtBr(inc.tradeDate),
      accountId: inc.accountId,
      accountName: resolveAccountName(inc.accountId),
      type: incType,
      typeLabel: INCOME_TYPE_LABELS[incType] || incType,
      amount: details.amount ? formatCurrency(details.amount.amount, incCurrency) : '—',
      grossAmount: details.grossAmount
        ? formatCurrency(details.grossAmount.amount, incCurrency)
        : '—',
      status: details.status || 'KNOWN',
      currency: incCurrency,
    };
  });

  const mappedHistory: AssetHistoryEventItem[] = historyItems
    .filter((item) => item.assetId === assetId || item.assetId === null)
    .map((item) => {
      const itemCurrency = item.currency || currency;
      const details = item.details;
      let kindLabel = item.kind as string;
      let quantity: string | null = null;
      let amount: string | null = null;
      let status: string | null = null;
      let isItemIncomplete = false;
      let description = '';

      if (item.kind === 'REALIZED_DISPOSAL') {
        kindLabel = 'Venda / Alienação';
        const d = details as {
          quantity?: string;
          netProceeds?: MoneyDto;
          realizedGainLoss?: MoneyDto | null;
          status?: 'KNOWN' | 'INCOMPLETE';
        };
        quantity = d.quantity ? formatQuantity(d.quantity) : null;
        amount = d.netProceeds ? formatCurrency(d.netProceeds.amount, itemCurrency) : null;
        status = d.status || null;
        isItemIncomplete = d.status === 'INCOMPLETE';
        description = `Alienação de ${quantity ?? ''} cotas por ${amount ?? ''}`;
      } else if (item.kind === 'INCOME') {
        const inc = details as {
          type?: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
          amount?: MoneyDto;
          status?: 'KNOWN' | 'INCOMPLETE';
        };
        const typeStr = inc.type ? INCOME_TYPE_LABELS[inc.type] || inc.type : 'Rendimento';
        kindLabel = typeStr;
        amount = inc.amount ? formatCurrency(inc.amount.amount, itemCurrency) : null;
        status = inc.status || null;
        isItemIncomplete = inc.status === 'INCOMPLETE';
        description = `Recebimento de ${typeStr}: ${amount ?? ''}`;
      } else if (item.kind === 'CORPORATE_ACTION') {
        const ca = details as {
          type?: 'SPLIT' | 'REVERSE_SPLIT' | 'BONUS' | 'AMORTIZATION';
          beforeQuantity?: string;
          afterQuantity?: string;
          status?: 'KNOWN' | 'INCOMPLETE';
        };
        const typeStr = ca.type
          ? CORPORATE_ACTION_LABELS[ca.type] || ca.type
          : 'Evento Corporativo';
        kindLabel = typeStr;
        status = ca.status || null;
        isItemIncomplete = ca.status === 'INCOMPLETE';
        if (ca.beforeQuantity && ca.afterQuantity) {
          description = `${typeStr}: quantidade ajustada de ${formatQuantity(ca.beforeQuantity)} para ${formatQuantity(ca.afterQuantity)}`;
        } else {
          description = `${typeStr} aplicado sobre a posição`;
        }
      } else if (item.kind === 'TRANSFER') {
        const tr = details as {
          type?: 'TRANSFER_IN' | 'TRANSFER_OUT';
          quantity?: string;
          status?: 'MATCHED' | 'UNMATCHED_IN' | 'UNMATCHED_OUT';
          costBasisStatus?: 'KNOWN' | 'INCOMPLETE';
        };
        kindLabel =
          tr.type === 'TRANSFER_IN' ? 'Transferência de Entrada' : 'Transferência de Saída';
        quantity = tr.quantity ? formatQuantity(tr.quantity) : null;
        status = tr.status || null;
        isItemIncomplete = tr.costBasisStatus === 'INCOMPLETE';
        description = `${kindLabel} de ${quantity ?? ''} cotas`;
      } else if (item.kind === 'CASH_FLOW') {
        const cf = details as {
          type?: string;
          category?: string;
          amount?: MoneyDto;
        };
        kindLabel = cf.type === 'AMORTIZATION' ? 'Devolução de Capital' : 'Fluxo Financeiro';
        amount = cf.amount ? formatCurrency(cf.amount.amount, itemCurrency) : null;
        description = `${kindLabel}: ${amount ?? ''}`;
      }

      return {
        id: item.id,
        kind: item.kind,
        kindLabel,
        transactionId: item.transactionId,
        tradeDate: item.tradeDate,
        formattedTradeDate: formatDatePtBr(item.tradeDate),
        accountId: item.accountId,
        accountName: resolveAccountName(item.accountId),
        quantity,
        amount,
        currency: itemCurrency,
        status,
        isCostBasisIncomplete: isItemIncomplete,
        description,
        details: item.details,
      };
    });

  return {
    header: {
      assetId,
      ticker,
      name: assetName,
      assetClass,
      assetClassLabel,
      portfolioId,
      portfolioName,
      isCostBasisIncomplete,
      completenessBadgeLabel: isCostBasisIncomplete ? 'Dados de custo incompletos' : null,
    },
    primaryCard,
    accountsBreakdown,
    realizedResults: {
      hasRealizedDisposals: mappedDisposals.length > 0,
      disposals: mappedDisposals,
    },
    incomeReceived: {
      hasIncomeEvents: mappedIncome.length > 0,
      events: mappedIncome,
    },
    history: {
      items: mappedHistory,
      pagination: {
        limit: historyMeta?.limit ?? 50,
        cursor: historyMeta?.cursor ?? null,
        nextCursor: historyMeta?.nextCursor ?? null,
        hasMore: historyMeta?.hasMore ?? false,
        totalCount: historyMeta?.totalCount ?? mappedHistory.length,
      },
    },
    isOpenPosition,
  };
}
