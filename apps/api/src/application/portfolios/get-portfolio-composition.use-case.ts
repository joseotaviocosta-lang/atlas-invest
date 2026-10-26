import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { IAssetRepository, IPortfolioRepository } from '@atlas/database';
import {
  addDecimals,
  buildCompositionDimension,
  largestBucket,
  topPositions,
  type CompositionBasis,
} from '@atlas/portfolio-strategy';
import { ASSET_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';

export interface CompositionDimensionView {
  code: 'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE';
  /** Basis currency for values in this dimension; null when weights are unavailable. */
  currency: string | null;
  totalKnownValue: { amount: string; currency: string } | null;
  /** Share of the known total covered by classified buckets ("100.00"-style), or null. */
  coveragePercent: string | null;
  buckets: Array<{
    key: string;
    label: string;
    marketValue: { amount: string; currency: string };
    weightBp: number | null;
    positionCount: number;
  }>;
  unclassified: {
    marketValue: { amount: string; currency: string };
    weightBp: number | null;
    positionCount: number;
  } | null;
  positionCount: number;
}

export interface CompositionResponse {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  basis: CompositionBasis;
  reportingCurrency: string | null;
  coverage: {
    valuationCoveragePercent: string;
    partialCoverage: boolean;
    knownCurrencies: string[];
    unvaluedCount: number;
  };
  availableDimensions: Array<'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE'>;
  dimensions: {
    byAsset: CompositionDimensionView | null;
    byAssetClass: CompositionDimensionView | null;
    byCurrency: CompositionDimensionView | null;
    byExchange: CompositionDimensionView | null;
  };
  topPositions: Array<{
    assetId: string;
    ticker: string | null;
    marketValue: { amount: string; currency: string };
    weightBp: number | null;
    rank: number;
  }>;
  concentrationFacts: {
    largestPosition: { assetId: string; ticker: string | null; weightBp: number | null } | null;
    largestAssetClass: { key: string; label: string; weightBp: number | null } | null;
    largestCurrency: { key: string; weightBp: number | null } | null;
    largestExchange: { key: string; weightBp: number | null } | null;
  };
  unvaluedPositions: Array<{
    assetId: string;
    ticker: string | null;
    currency: string;
    reason: string;
  }>;
  limitations: string[];
}

interface NormalizedPosition {
  assetId: string;
  ticker: string | null;
  assetType: string | null;
  nativeCurrency: string;
  nativeValue: string;
  /** Value in the composition basis currency (converted when translated is available). */
  basisValue: string;
  exchange: string | null;
}

/**
 * Phase 5R-C — portfolio composition intelligence (read-only).
 *
 * Composes one read from the canonical allocation use-case (single replay
 * inside it) plus one batched asset lookup. Dimensions aggregate over a
 * single known denominator with exact integer basis points; unknown
 * classifications and unvalued positions are explicit, never dropped.
 * Issuer and sector dimensions are reported unavailable: no canonical
 * source exists, and nothing is inferred.
 */
@Injectable()
export class GetPortfolioCompositionUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
  ) {}

  async execute(params: { portfolioId: string; userId: string }): Promise<CompositionResponse> {
    const portfolio = params.userId
      ? await this.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
      : await this.portfolios.findById(params.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }

    const allocation = await this.allocation.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });
    const generatedAt = new Date().toISOString();
    const limitations: string[] = [
      'ISSUER_CLASSIFICATION_NOT_AVAILABLE',
      'SECTOR_CLASSIFICATION_NOT_AVAILABLE',
    ];

    const bucketEntries = Object.values(allocation.currencies ?? {});
    const unvaluedPositions = bucketEntries.flatMap((bucket) =>
      (bucket.unvaluedAssets ?? []).map((row) => ({
        assetId: String(row.assetId),
        ticker: row.ticker,
        currency: row.currency,
        reason: row.reason,
      })),
    );
    const partialCoverage = allocation.status !== 'COMPLETE' || unvaluedPositions.length > 0;
    if (allocation.status === 'EMPTY') {
      limitations.push('NO_ACTIVITY');
    } else if (partialCoverage) {
      limitations.push('PARTIAL_PORTFOLIO_VALUATION');
    }

    if (allocation.status === 'EMPTY') {
      return {
        portfolioId: params.portfolioId,
        generatedAt,
        marketDataAsOf: allocation.asOf,
        basis: 'SINGLE_CURRENCY',
        reportingCurrency: null,
        coverage: {
          valuationCoveragePercent: allocation.valuationCoveragePercent,
          partialCoverage: true,
          knownCurrencies: [],
          unvaluedCount: 0,
        },
        availableDimensions: [],
        dimensions: { byAsset: null, byAssetClass: null, byCurrency: null, byExchange: null },
        topPositions: [],
        concentrationFacts: {
          largestPosition: null,
          largestAssetClass: null,
          largestCurrency: null,
          largestExchange: null,
        },
        unvaluedPositions: [],
        limitations,
      };
    }

    const translated =
      allocation.translatedAllocation?.status === 'AVAILABLE'
        ? allocation.translatedAllocation
        : null;
    const singleBucket =
      bucketEntries.length === 1
        ? ((bucketEntries[0] as (typeof bucketEntries)[number] | undefined) ?? null)
        : null;

    // Multi-currency without translation: per-currency native totals only.
    // Never invent cross-currency weights.
    if (!translated && !singleBucket) {
      limitations.push('MIXED_CURRENCIES_WITHOUT_TRANSLATION');
      const nativeBuckets = bucketEntries
        .map((bucket) => ({
          key: bucket.currency,
          label: bucket.currency,
          marketValue: bucket.totalMarketValue.amount,
          currency: bucket.currency,
          positionCount: new Set([
            ...bucket.byAsset.map((row) => String(row.assetId)),
            ...bucket.unvaluedAssets.map((row) => String(row.assetId)),
          ]).size,
        }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      return {
        portfolioId: params.portfolioId,
        generatedAt,
        marketDataAsOf: allocation.asOf,
        basis: 'PER_CURRENCY',
        reportingCurrency: allocation.translatedAllocation?.reportingCurrency ?? null,
        coverage: {
          valuationCoveragePercent: allocation.valuationCoveragePercent,
          partialCoverage,
          knownCurrencies: bucketEntries.map((bucket) => bucket.currency).sort(),
          unvaluedCount: unvaluedPositions.length,
        },
        availableDimensions: ['CURRENCY'],
        dimensions: {
          byAsset: null,
          byAssetClass: null,
          byCurrency: {
            code: 'CURRENCY',
            currency: null,
            totalKnownValue: null,
            coveragePercent: null,
            buckets: nativeBuckets.map((row) => ({
              key: row.key,
              label: row.label,
              marketValue: { amount: row.marketValue, currency: row.currency },
              weightBp: null,
              positionCount: row.positionCount,
            })),
            unclassified: null,
            positionCount: nativeBuckets.reduce((sum, row) => sum + row.positionCount, 0),
          },
          byExchange: null,
        },
        topPositions: [],
        concentrationFacts: {
          largestPosition: null,
          largestAssetClass: null,
          largestCurrency: null,
          largestExchange: null,
        },
        unvaluedPositions,
        limitations,
      };
    }

    const basis: CompositionBasis = translated ? 'REPORTING_CURRENCY' : 'SINGLE_CURRENCY';
    const basisCurrency = translated
      ? translated.reportingCurrency
      : (singleBucket as NonNullable<typeof singleBucket>).currency;
    const denominator = translated
      ? translated.totalMarketValue.amount
      : (singleBucket as NonNullable<typeof singleBucket>).totalMarketValue.amount;

    // Normalized positions in the basis currency (single denomination).
    const rawPositions: Array<Omit<NormalizedPosition, 'exchange'> & { exchange?: string | null }> =
      [];
    if (translated) {
      for (const row of translated.byAsset) {
        rawPositions.push({
          assetId: String(row.assetId),
          ticker: row.ticker ?? null,
          assetType: row.assetType ?? null,
          nativeCurrency: row.nativeCurrency,
          nativeValue: row.nativeMarketValue.amount,
          basisValue: row.reportingMarketValue.amount,
        });
      }
    } else if (singleBucket) {
      for (const row of singleBucket.byAsset) {
        rawPositions.push({
          assetId: String(row.assetId),
          ticker: row.ticker,
          assetType: row.assetType,
          nativeCurrency: row.currency,
          nativeValue: row.marketValue.amount,
          basisValue: row.marketValue.amount,
        });
      }
    }
    const assetMetas = await this.assets.findByIds(rawPositions.map((row) => row.assetId));
    const exchangeByAsset = new Map<string, string | null>(
      assetMetas.map((asset) => [String(asset.id), (asset.exchange as string | null) ?? null]),
    );
    const positioned: NormalizedPosition[] = rawPositions.map((row) => ({
      ...row,
      exchange: exchangeByAsset.get(row.assetId) ?? null,
    }));

    const aggregateBy = (
      keyOf: (row: NormalizedPosition) => string | null,
    ): Array<{ key: string | null; value: string; assets: Set<string> }> => {
      const groups = new Map<string | null, { value: string; assets: Set<string> }>();
      for (const row of positioned) {
        const key = keyOf(row);
        const existing = groups.get(key);
        if (existing) {
          existing.value = addDecimals(existing.value, row.basisValue);
          existing.assets.add(row.assetId);
        } else {
          groups.set(key, { value: row.basisValue, assets: new Set([row.assetId]) });
        }
      }
      return [...groups.entries()].map(([key, entry]) => ({
        key,
        value: entry.value,
        assets: entry.assets,
      }));
    };

    const assetGroups = aggregateBy((row) => row.assetId);
    const engineByAsset = buildCompositionDimension({
      code: 'ASSET',
      currency: basisCurrency,
      denominator,
      entries: assetGroups.map((group) => {
        const first = positioned.find((row) => row.assetId === group.key);
        return {
          key: group.key,
          label: first?.ticker ?? (group.key as string),
          value: group.value,
          positionCount: group.assets.size,
        };
      }),
    });

    const engineByAssetClass = buildCompositionDimension({
      code: 'ASSET_CLASS',
      currency: basisCurrency,
      denominator,
      entries: aggregateBy((row) => row.assetType ?? 'OTHER').map((group) => ({
        key: group.key as string,
        label: group.key as string,
        value: group.value,
        positionCount: group.assets.size,
      })),
    });

    // Currency weights need the basis currency (converted totals); displayed
    // values stay native per bucket (no mixed-currency sums).
    const nativeTotals = new Map<string, { value: string; assets: Set<string> }>();
    const convertedTotals = new Map<string, string>();
    for (const row of positioned) {
      const native = nativeTotals.get(row.nativeCurrency);
      if (native) {
        native.value = addDecimals(native.value, row.nativeValue);
        native.assets.add(row.assetId);
      } else {
        nativeTotals.set(row.nativeCurrency, {
          value: row.nativeValue,
          assets: new Set([row.assetId]),
        });
      }
      convertedTotals.set(
        row.nativeCurrency,
        addDecimals(convertedTotals.get(row.nativeCurrency) ?? '0', row.basisValue),
      );
    }
    const engineByCurrency = buildCompositionDimension({
      code: 'CURRENCY',
      currency: basisCurrency,
      denominator,
      entries: [...convertedTotals.entries()].map(([cur, value]) => ({
        key: cur,
        label: cur,
        value,
        positionCount: nativeTotals.get(cur)?.assets.size ?? 0,
      })),
    });

    const engineByExchange = buildCompositionDimension({
      code: 'EXCHANGE',
      currency: basisCurrency,
      denominator,
      entries: aggregateBy((row) => row.exchange).map((group) => ({
        key: group.key,
        label: group.key ?? 'UNKNOWN',
        value: group.value,
        positionCount: group.assets.size,
      })),
    });

    const toViewFromEngine = (
      code: 'ASSET' | 'ASSET_CLASS' | 'CURRENCY' | 'EXCHANGE',
      dimension: ReturnType<typeof buildCompositionDimension>,
      displayValue: (key: string) => { amount: string; currency: string },
    ): CompositionDimensionView => ({
      code,
      currency: dimension.currency,
      totalKnownValue:
        dimension.totalKnownValue === null
          ? null
          : { amount: dimension.totalKnownValue, currency: basisCurrency },
      coveragePercent: dimension.coveragePercent,
      buckets: dimension.buckets.map((row) => ({
        key: row.key,
        label: row.label,
        marketValue: displayValue(row.key),
        weightBp: row.weightBp,
        positionCount: row.positionCount,
      })),
      unclassified: dimension.unclassified
        ? {
            marketValue: {
              amount: dimension.unclassified.marketValue,
              currency: basisCurrency,
            },
            weightBp: dimension.unclassified.weightBp,
            positionCount: dimension.unclassified.positionCount,
          }
        : null,
      positionCount: dimension.positionCount,
    });

    const view: Record<
      'byAsset' | 'byAssetClass' | 'byCurrency' | 'byExchange',
      CompositionDimensionView
    > = {
      byAsset: toViewFromEngine('ASSET', engineByAsset, (key) => {
        const row = positioned.find((item) => item.assetId === key);
        return { amount: row?.nativeValue ?? '0', currency: row?.nativeCurrency ?? basisCurrency };
      }),
      byAssetClass: toViewFromEngine('ASSET_CLASS', engineByAssetClass, (key) => {
        const row = engineByAssetClass.buckets.find((item) => item.key === key);
        return { amount: row?.marketValue ?? '0', currency: basisCurrency };
      }),
      byCurrency: toViewFromEngine('CURRENCY', engineByCurrency, (key) => ({
        amount: nativeTotals.get(key)?.value ?? '0',
        currency: key,
      })),
      byExchange: toViewFromEngine('EXCHANGE', engineByExchange, (key) => {
        const row = engineByExchange.buckets.find((item) => item.key === key);
        return { amount: row?.marketValue ?? '0', currency: basisCurrency };
      }),
    };

    const top = topPositions(
      assetGroups.map((group) => {
        const first = positioned.find((row) => row.assetId === group.key);
        return {
          assetId: group.key as string,
          ticker: first?.ticker ?? null,
          value: group.value,
          weightBp: engineByAsset.buckets.find((row) => row.key === group.key)?.weightBp ?? null,
        };
      }),
      5,
    );

    const largestAssetClass = largestBucket({
      code: 'ASSET_CLASS',
      buckets: engineByAssetClass.buckets,
    });
    const largestCurrency = largestBucket({
      code: 'CURRENCY',
      buckets: engineByCurrency.buckets,
    });
    const largestExchange = largestBucket({
      code: 'EXCHANGE',
      buckets: engineByExchange.buckets,
    });
    const largestPosition = top[0];

    return {
      portfolioId: params.portfolioId,
      generatedAt,
      marketDataAsOf: allocation.asOf,
      basis,
      reportingCurrency: translated ? translated.reportingCurrency : null,
      coverage: {
        valuationCoveragePercent: allocation.valuationCoveragePercent,
        partialCoverage,
        knownCurrencies: translated
          ? [translated.reportingCurrency]
          : singleBucket
            ? [singleBucket.currency]
            : [],
        unvaluedCount: unvaluedPositions.length,
      },
      availableDimensions: ['ASSET', 'ASSET_CLASS', 'CURRENCY', 'EXCHANGE'],
      dimensions: view,
      topPositions: top.map((row) => ({
        assetId: row.assetId,
        ticker: row.ticker,
        marketValue: { amount: row.marketValue, currency: basisCurrency },
        weightBp: row.weightBp,
        rank: row.rank,
      })),
      concentrationFacts: {
        largestPosition: largestPosition
          ? {
              assetId: largestPosition.assetId,
              ticker: largestPosition.ticker,
              weightBp: largestPosition.weightBp,
            }
          : null,
        largestAssetClass: largestAssetClass
          ? {
              key: largestAssetClass.key,
              label: largestAssetClass.label,
              weightBp: largestAssetClass.weightBp,
            }
          : null,
        largestCurrency: largestCurrency
          ? { key: largestCurrency.key, weightBp: largestCurrency.weightBp }
          : null,
        largestExchange: largestExchange
          ? { key: largestExchange.key, weightBp: largestExchange.weightBp }
          : null,
      },
      unvaluedPositions,
      limitations,
    };
  }
}
