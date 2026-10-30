import {
  Money,
  Quantity,
  type AssetType,
  type Transaction,
  type TransactionType,
} from '@atlas/domain';
import { resolveTaxAssetCategory } from './asset-classification';
import { fiscalCompetenceFromDate } from './competence';
import { deriveFiscalEventId } from './ids';
import { FISCAL_PROJECTION_VERSION, SUPPORTED_FISCAL_CURRENCIES } from './version';
import type {
  FiscalDataQualityIssue,
  FiscalEvent,
  FiscalEventType,
  FiscalRelevance,
  TaxAssetCategory,
} from './types';

/**
 * Exhaustive fiscal mapping for every canonical transaction type (4A §19/§20).
 * Every existing type is explicitly classified — no type is left implicit.
 */
const TRANSACTION_FISCAL_MAPPING: Readonly<
  Record<
    TransactionType,
    { readonly eventType: FiscalEventType; readonly relevance: FiscalRelevance }
  >
> = Object.freeze({
  BUY: { eventType: 'PURCHASE', relevance: 'INFORMATIONAL' },
  SELL: { eventType: 'SALE', relevance: 'TAXABLE' },
  DIVIDEND: { eventType: 'INCOME', relevance: 'TAXABLE' },
  JCP: { eventType: 'INCOME', relevance: 'TAXABLE' },
  FII_INCOME: { eventType: 'INCOME', relevance: 'TAXABLE' },
  BONUS: { eventType: 'CORPORATE_ACTION', relevance: 'NON_TAXABLE' },
  SPLIT: { eventType: 'CORPORATE_ACTION', relevance: 'NON_TAXABLE' },
  REVERSE_SPLIT: { eventType: 'CORPORATE_ACTION', relevance: 'NON_TAXABLE' },
  SUBSCRIPTION: { eventType: 'PURCHASE', relevance: 'INFORMATIONAL' },
  AMORTIZATION: { eventType: 'AMORTIZATION', relevance: 'INFORMATIONAL' },
  TRANSFER_IN: { eventType: 'TRANSFER_IN', relevance: 'NON_TAXABLE' },
  TRANSFER_OUT: { eventType: 'TRANSFER_OUT', relevance: 'NON_TAXABLE' },
  RECEIPT_CONVERSION: { eventType: 'CORPORATE_ACTION', relevance: 'NON_TAXABLE' },
  DEPOSIT: { eventType: 'CASH_FLOW', relevance: 'NON_TAXABLE' },
  WITHDRAWAL: { eventType: 'CASH_FLOW', relevance: 'NON_TAXABLE' },
  FEE: { eventType: 'EXPENSE', relevance: 'INFORMATIONAL' },
  TAX: { eventType: 'EXPENSE', relevance: 'INFORMATIONAL' },
});

export function getTransactionFiscalMapping(type: TransactionType): {
  readonly eventType: FiscalEventType;
  readonly relevance: FiscalRelevance;
} {
  return TRANSACTION_FISCAL_MAPPING[type];
}

/**
 * Canonical realized-sale data supplied by the portfolio engine. The tax layer
 * reuses this result — it never re-derives gain arithmetic (4A §12).
 */
export interface CanonicalRealizedResult {
  readonly netProceeds?: string;
  readonly costBasisRemoved?: string;
  readonly realizedGainLoss?: string;
  readonly status?: 'KNOWN' | 'INCOMPLETE';
  readonly currency?: string;
}

export interface FiscalProjectionOptions {
  readonly projectionVersion?: string;
  readonly supportedCurrencies?: readonly string[];
  /** Canonical AssetType metadata per assetId (classification input). */
  readonly assetTypeByAssetId?: ReadonlyMap<string, AssetType | string>;
  /** Explicit pre-resolved tax category per assetId (highest precedence). */
  readonly taxCategoryByAssetId?: ReadonlyMap<string, TaxAssetCategory>;
  /** Canonical realized-sale results keyed by source transaction id. */
  readonly canonicalRealizedByTransactionId?: ReadonlyMap<string, CanonicalRealizedResult>;
}

function compareTransactions(a: Transaction, b: Transaction): number {
  const byDate = a.tradeDate.compare(b.tradeDate);
  if (byDate !== 0) return byDate;
  const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  const aId = String(a.id);
  const bId = String(b.id);
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

function resolveCategory(
  assetId: string | undefined,
  options: FiscalProjectionOptions,
): TaxAssetCategory {
  if (!assetId) return 'UNKNOWN';
  const explicit = options.taxCategoryByAssetId?.get(assetId);
  if (explicit) return explicit;
  const assetType = options.assetTypeByAssetId?.get(assetId);
  return resolveTaxAssetCategory(assetType);
}

/**
 * Pure, deterministic Transaction -> FiscalEvent projection.
 *
 * Invariants: same source ledger + same projection version => identical
 * fiscal events, independent of input ordering (ADR-236, 4A §18/§22/§54).
 */
export function projectFiscalEvents(
  transactions: readonly Transaction[],
  options: FiscalProjectionOptions = {},
): readonly FiscalEvent[] {
  const projectionVersion = options.projectionVersion ?? FISCAL_PROJECTION_VERSION;
  const supportedCurrencies = options.supportedCurrencies ?? SUPPORTED_FISCAL_CURRENCIES;

  const sorted = [...transactions].sort(compareTransactions);
  const events = sorted.map((tx) =>
    projectOne(tx, projectionVersion, supportedCurrencies, options),
  );
  return Object.freeze(events);
}

function projectOne(
  tx: Transaction,
  projectionVersion: string,
  supportedCurrencies: readonly string[],
  options: FiscalProjectionOptions,
): FiscalEvent {
  const mapping = TRANSACTION_FISCAL_MAPPING[tx.type];
  const competence = fiscalCompetenceFromDate(tx.tradeDate);
  const currency = tx.currency as string;
  const qualityIssues: FiscalDataQualityIssue[] = [];

  const rawAssetId = (tx as { assetId?: unknown }).assetId;
  const assetId = rawAssetId ? String(rawAssetId) : undefined;
  const category = resolveCategory(assetId, options);
  if (assetId && category === 'UNKNOWN') {
    qualityIssues.push('UNKNOWN_ASSET_TAX_CATEGORY');
  }
  if (!supportedCurrencies.includes(currency)) {
    qualityIssues.push('UNSUPPORTED_CURRENCY');
  }

  let quantity: Quantity | undefined;
  let unitPrice: Money | undefined;
  let proceeds: Money | undefined;
  let amount: Money | undefined;
  let costBasis: Money | undefined;
  let realizedResult: Money | undefined;

  switch (tx.type) {
    case 'BUY': {
      quantity = tx.quantity;
      unitPrice = tx.unitPrice;
      break;
    }
    case 'SELL': {
      quantity = tx.quantity;
      unitPrice = tx.unitPrice;
      const gross = tx.unitPrice.multiply(tx.quantity);
      const sellingCosts = (tx.fees ?? Money.zero(currency)).add(tx.taxes ?? Money.zero(currency));
      proceeds = gross.subtract(sellingCosts);
      const canonical = options.canonicalRealizedByTransactionId?.get(String(tx.id));
      const canonicalUsable =
        canonical !== undefined &&
        canonical.status !== 'INCOMPLETE' &&
        canonical.realizedGainLoss !== undefined;
      if (canonicalUsable) {
        if (canonical!.costBasisRemoved !== undefined) {
          costBasis = Money.from(canonical!.costBasisRemoved!, currency);
        }
        realizedResult = Money.from(canonical!.realizedGainLoss!, currency);
      } else {
        qualityIssues.push('UNKNOWN_COST_BASIS');
      }
      break;
    }
    case 'DIVIDEND':
    case 'JCP':
    case 'FII_INCOME':
    case 'AMORTIZATION': {
      amount = tx.amount;
      break;
    }
    case 'SUBSCRIPTION': {
      quantity = tx.quantity;
      unitPrice = tx.unitPrice;
      break;
    }
    case 'BONUS': {
      quantity = tx.quantity;
      if (tx.assignedCost) amount = tx.assignedCost;
      break;
    }
    case 'SPLIT':
    case 'REVERSE_SPLIT': {
      // Factor preserved for auditability; never a taxable acquisition/disposal.
      quantity = tx.factor;
      break;
    }
    case 'TRANSFER_IN':
    case 'TRANSFER_OUT': {
      quantity = tx.quantity;
      break;
    }
    case 'RECEIPT_CONVERSION': {
      // Corporate conversion: source quantity leaves, target quantity arrives.
      // No proceeds, no gain, no income — cost basis carries (PART R).
      quantity = tx.quantity;
      break;
    }
    case 'DEPOSIT':
    case 'WITHDRAWAL':
    case 'FEE':
    case 'TAX': {
      amount = tx.amount;
      break;
    }
  }

  return Object.freeze({
    id: deriveFiscalEventId(String(tx.id), projectionVersion),
    sourceTransactionId: String(tx.id),
    portfolioId: String(tx.portfolioId),
    accountId: String(tx.accountId),
    assetId,
    sourceTransactionType: tx.type,
    economicDate: tx.tradeDate,
    competence,
    eventType: mapping.eventType,
    relevance: mapping.relevance,
    taxAssetCategory: category,
    currency,
    quantity,
    unitPrice,
    proceeds,
    amount,
    costBasis,
    realizedResult,
    qualityIssues: Object.freeze(qualityIssues),
    projectionVersion,
  }) satisfies FiscalEvent;
}
