import type { Transaction } from '@atlas/domain';
import { STRATEGY_CATEGORIES } from '@atlas/portfolio-strategy';

/**
 * Shared plan-tracking read helpers (5Q-G/5Q-I).
 *
 * Classifies ledger transactions into plan categories for actuals:
 * DEPOSIT (no asset) is cash by definition; asset-backed rows use the
 * canonical asset type when it is a known category, else OTHER.
 * Nothing is invented: unmapped rows stay visible as OTHER.
 */
export async function classifyPlanTransactions(
  transactions: Array<{ id: string; assetId?: string | null; type: string }>,
  loadAssets: (ids: readonly string[]) => Promise<Array<{ id: string; type: string }>>,
): Promise<Map<string, string>> {
  const categories = new Map<string, string>();
  const assetIds = Array.from(
    new Set(
      transactions
        .filter((tx) => tx.type !== 'DEPOSIT' && tx.assetId !== undefined && tx.assetId !== null)
        .map((tx) => tx.assetId as string),
    ),
  );
  const assets = assetIds.length > 0 ? await loadAssets(assetIds) : [];
  const typeByAssetId = new Map<string, string>(assets.map((asset) => [asset.id, asset.type]));
  for (const tx of transactions) {
    if (tx.type === 'DEPOSIT') {
      categories.set(tx.id, 'CASH');
      continue;
    }
    const assetType =
      tx.assetId !== undefined && tx.assetId !== null ? typeByAssetId.get(tx.assetId) : undefined;
    categories.set(
      tx.id,
      assetType !== undefined && (STRATEGY_CATEGORIES as readonly string[]).includes(assetType)
        ? assetType
        : 'OTHER',
    );
  }
  return categories;
}

export function planTransactionAmount(tx: Transaction): {
  amount: string;
  currency: string;
  tradeDate: string;
} | null {
  const candidate = tx as unknown as {
    amount?: { amount?: string };
    currency?: string;
    tradeDate?: { toString(): string };
  };
  const amount = candidate.amount?.amount;
  if (typeof amount !== 'string' || typeof candidate.currency !== 'string') return null;
  const tradeDate = candidate.tradeDate?.toString();
  if (typeof tradeDate !== 'string') return null;
  return { amount, currency: candidate.currency, tradeDate };
}
