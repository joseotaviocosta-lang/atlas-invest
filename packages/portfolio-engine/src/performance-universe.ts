import { Transaction, LocalDate, AssetId, createAssetId } from '@atlas/domain';
import { replayPortfolio } from './engine';

export interface PerformanceAssetUniverseInput {
  portfolioId?: string;
  transactions: readonly Transaction[];
  from: LocalDate;
  to: LocalDate;
}

/**
 * Derives the canonical set of assets that had economically relevant custody or exposure
 * during the period [from, to].
 *
 * An asset belongs to the performance asset universe if and only if:
 * 1. It is held with positive custody at `from` (derived via canonical replay asOf=from); OR
 * 2. It is held with positive custody at `to` (derived via canonical replay asOf=to); OR
 * 3. It had any transaction touching it during the period [from, to] (e.g. bought and sold
 *    entirely within the period, corporate actions, transfers, or income events).
 *
 * This guarantees that assets sold before `to` but held during part of [from, to] are
 * strictly included in historical backfill and performance replay calculations.
 */
export function derivePerformanceAssetUniverse(input: PerformanceAssetUniverseInput): AssetId[] {
  if (input.from.compare(input.to) > 0) {
    throw new Error(
      `Invalid date range: 'from' (${input.from.toString()}) cannot be after 'to' (${input.to.toString()})`,
    );
  }

  const universe = new Set<string>();

  // 1. Replay as of `from`
  const startState = replayPortfolio({
    portfolioId: input.portfolioId ?? 'universe-replay',
    transactions: input.transactions as Transaction[],
    asOfDate: input.from,
  }).state;

  for (const assetId of startState.assets.keys()) {
    universe.add(String(assetId));
  }

  // 2. Replay as of `to`
  const endState = replayPortfolio({
    portfolioId: input.portfolioId ?? 'universe-replay',
    transactions: input.transactions as Transaction[],
    asOfDate: input.to,
  }).state;

  for (const assetId of endState.assets.keys()) {
    universe.add(String(assetId));
  }

  // 3. Transactions executed within [from, to]
  for (const tx of input.transactions) {
    if (tx.tradeDate.compare(input.from) >= 0 && tx.tradeDate.compare(input.to) <= 0) {
      if ('assetId' in tx && tx.assetId) {
        universe.add(String(tx.assetId));
      }
    }
  }

  return Array.from(universe).map((id) => createAssetId(id));
}
