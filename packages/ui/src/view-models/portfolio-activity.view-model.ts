import { formatCurrency, formatQuantity, formatDate } from '../formatters';
import { PortfolioStateDto, AccountMeta, MoneyDto } from './portfolio-overview.view-model';
import {
  AssetMeta,
  PortfolioHistoryItemDto,
  PortfolioHistoryPaginationMetaDto,
} from './asset-position-detail.view-model';

export type PortfolioActivityKind =
  'REALIZED_DISPOSAL' | 'INCOME' | 'CASH_FLOW' | 'CORPORATE_ACTION' | 'TRANSFER';

export const PORTFOLIO_HISTORY_KINDS: readonly PortfolioActivityKind[] = [
  'REALIZED_DISPOSAL',
  'INCOME',
  'CASH_FLOW',
  'CORPORATE_ACTION',
  'TRANSFER',
] as const;

export function assertNever(x: never): never {
  throw new Error(`Unhandled portfolio history event kind: ${JSON.stringify(x)}`);
}

export type ActivityBadgeVariant = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

export interface PortfolioActivityItemViewModel {
  readonly id: string;
  readonly transactionId: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly subType: string | null;
  readonly tradeDate: string;
  readonly formattedTradeDate: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly assetId: string | null;
  readonly assetTicker: string | null;
  readonly assetName: string | null;
  readonly quantity: string | null;
  readonly rawQuantity: string | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly badgeVariant: ActivityBadgeVariant;
  readonly status: string | null;
  readonly statusBadgeLabel: string | null;
  readonly isCostBasisIncomplete: boolean;
  readonly canNavigateToAsset: boolean;
  readonly secondaryContext: string | null;
  readonly details: Record<string, unknown>;
}

export interface PortfolioActivityGroupViewModel {
  readonly date: string;
  readonly formattedDate: string;
  readonly items: readonly PortfolioActivityItemViewModel[];
}

export interface PortfolioActivityViewModel {
  readonly portfolioId: string;
  readonly portfolioName: string;
  readonly groups: readonly PortfolioActivityGroupViewModel[];
  readonly rawItemsCount: number;
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly isEmpty: boolean;
}

export interface BuildPortfolioActivityOptions {
  readonly portfolioId: string;
  readonly portfolioName?: string;
  readonly historyItems: readonly PortfolioHistoryItemDto[];
  readonly pagination: PortfolioHistoryPaginationMetaDto;
  readonly portfolioState?: PortfolioStateDto | null;
  readonly accountsMeta?: readonly AccountMeta[] | Record<string, AccountMeta> | null;
  readonly assetsMeta?: readonly AssetMeta[] | Record<string, AssetMeta> | null;
}

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

/**
 * Formats a civil date string 'YYYY-MM-DD' into Brazilian Portuguese prose: '18 de setembro de 2026'.
 */
export function formatCivilDateHeader(dateStr: string): string {
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

/**
 * Pure, deterministic presentation mapper for portfolio activity and history events.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Zero Client Financial Math (ADR-077, ADR-080):
 *    Never sums, subtracts, or computes net cash, totals, or yields.
 * 2. Closed Position Safety:
 *    Only allows navigation to asset detail when the asset currently has an open position (quantity > 0)
 *    in the portfolio state, preventing broken or misleading navigation.
 * 3. Canonical Portuguese Labels:
 *    - TAX -> "Tributo pago" (never "Imposto devido")
 *    - FEE -> "Taxa"
 *    - REALIZED_DISPOSAL -> "Venda"
 *    - SUBSCRIPTION -> "Subscrição" (distinct from BUY)
 *    - AMORTIZATION -> "Amortização" ("Devolução de capital")
 * 4. Deterministic Ordering:
 *    Preserves API ordering within and across dates.
 */
export function buildPortfolioActivityViewModel(
  options: BuildPortfolioActivityOptions,
): PortfolioActivityViewModel {
  const {
    portfolioId,
    portfolioName = 'Minha Carteira',
    historyItems,
    pagination,
    portfolioState,
    accountsMeta,
    assetsMeta,
  } = options;

  // 1. Build lookup maps
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

  // 2. Build set of open position asset IDs to guarantee safe navigation
  const openAssetIds = new Set<string>();
  if (portfolioState && Array.isArray(portfolioState.positions)) {
    for (const p of portfolioState.positions) {
      if (p.quantity && p.quantity !== '0') {
        openAssetIds.add(p.assetId);
      }
    }
  }

  const resolveAccountName = (accId: string): string => {
    return accountMap.get(accId) || `Conta ${accId.slice(0, 8)}`;
  };

  // 3. Map items
  const mappedItems: PortfolioActivityItemViewModel[] = historyItems.map((item) => {
    const details = item.details || {};
    const accountName = resolveAccountName(item.accountId);
    const asset = item.assetId ? assetMap.get(item.assetId) || null : null;
    const assetTicker = asset?.ticker || (item.assetId ? item.assetId.slice(0, 8) : null);
    const assetName = asset?.name || assetTicker;
    const canNavigateToAsset = item.assetId ? openAssetIds.has(item.assetId) : false;
    const formattedTradeDate = formatDate(item.tradeDate);

    switch (item.kind) {
      case 'REALIZED_DISPOSAL': {
        const d = details as {
          quantity?: string;
          netProceeds?: MoneyDto;
          grossProceeds?: MoneyDto;
          sellingCosts?: MoneyDto;
          realizedGainLoss?: MoneyDto | null;
          status?: 'KNOWN' | 'INCOMPLETE';
        };

        const isCostBasisIncomplete = d.status === 'INCOMPLETE';
        const rawQty = d.quantity ?? null;
        const formattedQty = rawQty ? formatQuantity(rawQty) : null;
        const amountMoney = d.netProceeds ?? d.grossProceeds ?? null;
        const formattedAmount = amountMoney
          ? formatCurrency(amountMoney.amount, amountMoney.currency)
          : null;

        let badgeVariant: ActivityBadgeVariant = 'neutral';
        if (d.realizedGainLoss?.amount) {
          if (d.realizedGainLoss.amount.startsWith('-')) {
            badgeVariant = 'negative';
          } else if (d.realizedGainLoss.amount !== '0' && d.realizedGainLoss.amount !== '0.00') {
            badgeVariant = 'positive';
          }
        }

        const statusBadgeLabel = isCostBasisIncomplete ? 'Custo incompleto' : null;

        return {
          id: item.id,
          transactionId: item.transactionId,
          kind: item.kind,
          kindLabel: 'Venda',
          subType: 'REALIZED_DISPOSAL',
          tradeDate: item.tradeDate,
          formattedTradeDate,
          accountId: item.accountId,
          accountName,
          assetId: item.assetId,
          assetTicker,
          assetName,
          quantity: formattedQty,
          rawQuantity: rawQty,
          amount: formattedAmount,
          currency: amountMoney?.currency ?? item.currency,
          badgeVariant,
          status: d.status ?? null,
          statusBadgeLabel,
          isCostBasisIncomplete,
          canNavigateToAsset,
          secondaryContext: null,
          details,
        };
      }

      case 'INCOME': {
        const inc = details as {
          type?: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
          amount?: MoneyDto;
          grossAmount?: MoneyDto;
          status?: 'KNOWN' | 'INCOMPLETE';
        };

        let kindLabel = 'Rendimento';
        if (inc.type === 'DIVIDEND') kindLabel = 'Dividendo';
        else if (inc.type === 'JCP') kindLabel = 'JCP';
        else if (inc.type === 'FII_INCOME') kindLabel = 'Rendimento de FII';

        const amountMoney = inc.amount ?? inc.grossAmount ?? null;
        const formattedAmount = amountMoney
          ? formatCurrency(amountMoney.amount, amountMoney.currency)
          : null;

        const isCostBasisIncomplete = inc.status === 'INCOMPLETE';
        const statusBadgeLabel = isCostBasisIncomplete ? 'Incompleto' : null;

        return {
          id: item.id,
          transactionId: item.transactionId,
          kind: item.kind,
          kindLabel,
          subType: inc.type ?? null,
          tradeDate: item.tradeDate,
          formattedTradeDate,
          accountId: item.accountId,
          accountName,
          assetId: item.assetId,
          assetTicker,
          assetName,
          quantity: null,
          rawQuantity: null,
          amount: formattedAmount,
          currency: amountMoney?.currency ?? item.currency,
          badgeVariant: 'positive',
          status: inc.status ?? null,
          statusBadgeLabel,
          isCostBasisIncomplete,
          canNavigateToAsset,
          secondaryContext: null,
          details,
        };
      }

      case 'CASH_FLOW': {
        const cf = details as {
          type?: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'TAX' | 'AMORTIZATION';
          direction?: 'INFLOW' | 'OUTFLOW';
          category?: string;
          amount?: MoneyDto;
        };

        let kindLabel = 'Movimentação';
        let badgeVariant: ActivityBadgeVariant = 'neutral';
        let secondaryContext: string | null = null;

        switch (cf.type) {
          case 'DEPOSIT':
            kindLabel = 'Depósito';
            badgeVariant = 'positive';
            break;
          case 'WITHDRAWAL':
            kindLabel = 'Retirada';
            badgeVariant = 'negative';
            break;
          case 'FEE':
            kindLabel = 'Taxa';
            badgeVariant = 'neutral';
            break;
          case 'TAX':
            kindLabel = 'Tributo pago';
            badgeVariant = 'neutral';
            break;
          case 'AMORTIZATION':
            kindLabel = 'Amortização';
            secondaryContext = 'Devolução de capital';
            badgeVariant = 'positive';
            break;
          default:
            kindLabel = cf.type ?? 'Movimentação';
            break;
        }

        const amountMoney = cf.amount ?? null;
        const formattedAmount = amountMoney
          ? formatCurrency(amountMoney.amount, amountMoney.currency)
          : null;

        return {
          id: item.id,
          transactionId: item.transactionId,
          kind: item.kind,
          kindLabel,
          subType: cf.type ?? null,
          tradeDate: item.tradeDate,
          formattedTradeDate,
          accountId: item.accountId,
          accountName,
          assetId: item.assetId,
          assetTicker,
          assetName,
          quantity: null,
          rawQuantity: null,
          amount: formattedAmount,
          currency: amountMoney?.currency ?? item.currency,
          badgeVariant,
          status: null,
          statusBadgeLabel: null,
          isCostBasisIncomplete: false,
          canNavigateToAsset,
          secondaryContext,
          details,
        };
      }

      case 'CORPORATE_ACTION': {
        const ca = details as {
          type?: 'SPLIT' | 'REVERSE_SPLIT' | 'BONUS' | 'SUBSCRIPTION' | 'AMORTIZATION';
          beforeQuantity?: string;
          afterQuantity?: string;
          beforeTotalCost?: MoneyDto | null;
          afterTotalCost?: MoneyDto | null;
          status?: string;
        };

        let kindLabel = 'Evento Corporativo';
        let secondaryContext: string | null = null;

        switch (ca.type) {
          case 'SPLIT':
            kindLabel = 'Desdobramento';
            break;
          case 'REVERSE_SPLIT':
            kindLabel = 'Grupamento';
            break;
          case 'BONUS':
            kindLabel = 'Bonificação';
            break;
          case 'SUBSCRIPTION':
            kindLabel = 'Subscrição';
            break;
          case 'AMORTIZATION':
            kindLabel = 'Amortização';
            secondaryContext = 'Devolução de capital';
            break;
          default:
            kindLabel = ca.type ?? 'Evento Corporativo';
            break;
        }

        const isCostBasisIncomplete = ca.status === 'INCOMPLETE';
        const rawQty = ca.afterQuantity ?? null;
        const formattedQty = rawQty ? formatQuantity(rawQty) : null;

        return {
          id: item.id,
          transactionId: item.transactionId,
          kind: item.kind,
          kindLabel,
          subType: ca.type ?? null,
          tradeDate: item.tradeDate,
          formattedTradeDate,
          accountId: item.accountId,
          accountName,
          assetId: item.assetId,
          assetTicker,
          assetName,
          quantity: formattedQty,
          rawQuantity: rawQty,
          amount: null,
          currency: item.currency,
          badgeVariant: 'info',
          status: ca.status ?? null,
          statusBadgeLabel: isCostBasisIncomplete ? 'Custo incompleto' : null,
          isCostBasisIncomplete,
          canNavigateToAsset,
          secondaryContext,
          details,
        };
      }

      case 'TRANSFER': {
        const tr = details as {
          type?: 'TRANSFER_IN' | 'TRANSFER_OUT';
          status?: 'MATCHED' | 'UNMATCHED';
          counterpartyAccountId?: string | null;
          quantity?: string;
          costBasisStatus?: 'KNOWN' | 'INCOMPLETE';
        };

        const isTransferIn = tr.type === 'TRANSFER_IN';
        const kindLabel = isTransferIn ? 'Transferência de entrada' : 'Transferência de saída';
        const isUnmatched = tr.status === 'UNMATCHED';
        const isCostBasisIncomplete = tr.costBasisStatus === 'INCOMPLETE';

        let statusBadgeLabel: string | null = null;
        let badgeVariant: ActivityBadgeVariant = 'info';

        if (isUnmatched) {
          statusBadgeLabel = 'Transferência incompleta';
          badgeVariant = 'warning';
        } else if (isCostBasisIncomplete) {
          statusBadgeLabel = 'Custo incompleto';
        }

        let secondaryContext: string | null = null;
        if (tr.counterpartyAccountId) {
          const cpName = resolveAccountName(tr.counterpartyAccountId);
          secondaryContext = isTransferIn ? `De: ${cpName}` : `Para: ${cpName}`;
        }

        const rawQty = tr.quantity ?? null;
        const formattedQty = rawQty ? formatQuantity(rawQty) : null;

        return {
          id: item.id,
          transactionId: item.transactionId,
          kind: item.kind,
          kindLabel,
          subType: tr.type ?? null,
          tradeDate: item.tradeDate,
          formattedTradeDate,
          accountId: item.accountId,
          accountName,
          assetId: item.assetId,
          assetTicker,
          assetName,
          quantity: formattedQty,
          rawQuantity: rawQty,
          amount: null,
          currency: item.currency,
          badgeVariant,
          status: tr.status ?? null,
          statusBadgeLabel,
          isCostBasisIncomplete,
          canNavigateToAsset,
          secondaryContext,
          details,
        };
      }

      default: {
        return assertNever(item.kind as never);
      }
    }
  });

  // 4. Group by civil date (tradeDate YYYY-MM-DD), preserving descending order
  const groupMap = new Map<string, PortfolioActivityItemViewModel[]>();
  for (const item of mappedItems) {
    const existing = groupMap.get(item.tradeDate);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.tradeDate, [item]);
    }
  }

  const groups: PortfolioActivityGroupViewModel[] = [];
  for (const [date, items] of groupMap.entries()) {
    groups.push({
      date,
      formattedDate: formatCivilDateHeader(date),
      items,
    });
  }

  return {
    portfolioId,
    portfolioName,
    groups,
    rawItemsCount: mappedItems.length,
    pagination,
    isEmpty: mappedItems.length === 0,
  };
}
