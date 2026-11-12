import { UnprocessableEntityException } from '@nestjs/common';
import type { IAssetRepository, ITransactionRepository } from '@atlas/database';
import { Quantity, type Asset } from '@atlas/domain';
import { PortfolioReplayError, replayPortfolio } from '@atlas/portfolio-engine';

export interface PortfolioNewsUniversePositionLike {
  assetId?: string | null;
  ticker?: string | null;
  quantity?: string | number | null;
}

export interface PortfolioNewsUniverseResolution {
  tickers: string[];
  activeHoldingsCount: number;
  ignoredWithoutTickerCount: number;
  source: 'LEDGER_POSITIONS' | 'POSITION_READ_MODEL_FALLBACK';
}

const VALID_TICKER_PATTERN = /^[A-Z0-9._-]{1,24}$/;

/**
 * Normalizes and validates an asset ticker for external news queries.
 * Returns null if the ticker is missing, empty, or malformed.
 */
export function normalizeValidNewsTicker(rawTicker: unknown): string | null {
  if (typeof rawTicker !== 'string') {
    return null;
  }
  const normalized = rawTicker.trim().toUpperCase();
  if (!normalized || !VALID_TICKER_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function isNonZeroPositionQuantity(rawQuantity: unknown): boolean {
  if (rawQuantity === null || rawQuantity === undefined) {
    return false;
  }
  const str = typeof rawQuantity === 'string' ? rawQuantity.trim() : String(rawQuantity).trim();
  if (!str) {
    return false;
  }
  try {
    return !Quantity.from(str).isZero();
  } catch {
    return false;
  }
}

/**
 * Resolves the canonical active news universe directly from transaction ledger replay (APP-16P-R1).
 * Independent of quote freshness, pricing status, or market value.
 */
export async function resolvePortfolioNewsUniverseFromLedger(params: {
  portfolioId: string;
  transactionRepo: Pick<ITransactionRepository, 'findByPortfolioId'>;
  assetRepo: Pick<IAssetRepository, 'findById'> & Partial<Pick<IAssetRepository, 'findByIds'>>;
}): Promise<PortfolioNewsUniverseResolution> {
  const transactions = await params.transactionRepo.findByPortfolioId(params.portfolioId);

  let replayResult;
  try {
    replayResult = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions,
    });
  } catch (err: unknown) {
    if (err instanceof PortfolioReplayError) {
      throw new UnprocessableEntityException({
        message: err.message,
        code: 'PORTFOLIO.REPLAY_FAILED',
      });
    }
    throw err;
  }

  const activeAssetIds: string[] = [];
  for (const [assetId, assetState] of replayResult.state.assets.entries()) {
    // ADR-039 already omits zero positions from state.assets; this guard also
    // respects signed/non-zero quantities cleanly without assuming quantity > 0 only.
    if (!assetState.quantity.isZero()) {
      activeAssetIds.push(String(assetId));
    }
  }

  if (activeAssetIds.length === 0) {
    return {
      tickers: [],
      activeHoldingsCount: 0,
      ignoredWithoutTickerCount: 0,
      source: 'LEDGER_POSITIONS',
    };
  }

  const assets: Asset[] =
    typeof params.assetRepo.findByIds === 'function'
      ? await params.assetRepo.findByIds(activeAssetIds)
      : (await Promise.all(activeAssetIds.map((id) => params.assetRepo.findById(id)))).filter(
          (asset): asset is Asset => asset !== null,
        );

  const assetById = new Map<string, Asset>();
  for (const asset of assets) {
    assetById.set(String(asset.id), asset);
  }

  const tickerSet = new Set<string>();
  let ignoredWithoutTickerCount = 0;

  for (const assetId of activeAssetIds) {
    const asset = assetById.get(assetId);
    const ticker = normalizeValidNewsTicker(asset?.ticker);
    if (!ticker) {
      ignoredWithoutTickerCount++;
      continue;
    }
    tickerSet.add(ticker);
  }

  return {
    tickers: Array.from(tickerSet),
    activeHoldingsCount: activeAssetIds.length,
    ignoredWithoutTickerCount,
    source: 'LEDGER_POSITIONS',
  };
}

/**
 * Fallback helper when only read-model positions are available (e.g., isolated unit mocks).
 * Never filters by quote status ('VALUED' / 'QUOTE_STALE' / 'UNVALUED') or market value.
 */
export function resolvePortfolioNewsUniverseFromPositions(
  positions: readonly PortfolioNewsUniversePositionLike[],
): PortfolioNewsUniverseResolution {
  const tickerSet = new Set<string>();
  let activeHoldingsCount = 0;
  let ignoredWithoutTickerCount = 0;

  for (const pos of positions) {
    if (!isNonZeroPositionQuantity(pos.quantity)) {
      continue;
    }
    activeHoldingsCount++;
    const ticker = normalizeValidNewsTicker(pos.ticker);
    if (!ticker) {
      ignoredWithoutTickerCount++;
      continue;
    }
    tickerSet.add(ticker);
  }

  return {
    tickers: Array.from(tickerSet),
    activeHoldingsCount,
    ignoredWithoutTickerCount,
    source: 'POSITION_READ_MODEL_FALLBACK',
  };
}
