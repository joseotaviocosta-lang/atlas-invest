import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IIntegrationRunRepository,
  IntegrationRunRow,
  IPortfolioRepository,
} from '@atlas/database';
import { deriveReviewItems } from '@atlas/import-engine';
import {
  buildIssue,
  deriveQualityStatus,
  sortQualityIssues,
  unionCapabilities,
  type AffectedCapability,
  type DataQualityIssue,
  type DataQualityStatus,
} from '@atlas/portfolio-strategy';
import type { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import type { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';

/**
 * Phase 5R-E — portfolio data quality composition (pure orchestration).
 *
 * Consolidates facts the canonical read models already produce: valuation
 * statuses, cost-basis states, FX translation state and integration-run
 * reconciliation summaries. No new detection heuristics, no writes, no
 * per-position replays — one valuation read plus one allocation read
 * (each with its own single replay, like 5R-A) and batched lookups.
 */

export interface DataQualityPositionRow {
  assetId: string;
  ticker: string | null;
  currency: string;
  status: DataQualityStatus;
  issueCount: number;
  blockingCount: number;
  reviewCount: number;
  issues: DataQualityIssue[];
  affectedCapabilities: AffectedCapability[];
}

export interface DataQualityReconciliationSummary {
  matched: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
  pendingReviews: number;
  truncated: boolean;
}

export interface PortfolioDataQualityModel {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  status: DataQualityStatus;
  summary: {
    positionsTotal: number;
    positionsWithoutIssues: number;
    positionsReviewRequired: number;
    positionsBlocked: number;
    issuesTotal: number;
    coveragePercent: string;
    unvaluedCount: number;
    knownCurrencies: string[];
  };
  issuesByDomain: Array<{ domain: string; count: number }>;
  positions: DataQualityPositionRow[];
  portfolioIssues: DataQualityIssue[];
  reconciliation: DataQualityReconciliationSummary;
  structuralLimitations: string[];
  limitations: string[];
}

const MAX_RUN_WINDOW = 200;

type ValuationPosition = {
  assetId: string;
  currency: string;
  status: string;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  quote: { asOf: string } | null;
  marketValue: { amount: string; currency: string } | null;
  ticker?: string | null;
};

function toDerivationInput(row: IntegrationRunRow) {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    source: row.source,
    trigger: row.trigger,
    status: row.status,
    newCandidates: row.newCandidates,
    exactDuplicates: row.exactDuplicates,
    probableDuplicates: row.probableDuplicates,
    conflicts: row.conflicts,
    unsupported: row.unsupported,
    invalid: row.invalid,
    partial: row.partial,
    reconciliation: row.reconciliation,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function composePortfolioDataQuality(
  deps: {
    portfolios: IPortfolioRepository;
    valuation: GetPortfolioValuationUseCase;
    allocation: GetPortfolioAllocationUseCase;
    assets: IAssetRepository;
    runs: IIntegrationRunRepository;
  },
  params: { portfolioId: string; userId: string },
): Promise<PortfolioDataQualityModel> {
  const portfolio = params.userId
    ? await deps.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
    : await deps.portfolios.findById(params.portfolioId);
  if (!portfolio) {
    throw new EntityNotFoundError('Portfolio', params.portfolioId);
  }

  const [valuation, allocation, recentRuns] = await Promise.all([
    deps.valuation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
    deps.allocation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
    deps.runs.listRecentByPortfolioIds([params.portfolioId], MAX_RUN_WINDOW),
  ]);

  const positions = (valuation.positions ?? []) as ValuationPosition[];
  const assetIds = [...new Set(positions.map((position) => String(position.assetId)))];
  const assetMetas = assetIds.length > 0 ? await deps.assets.findByIds(assetIds) : [];
  const tickerById = new Map(
    assetMetas.map((asset) => [String(asset.id), (asset.ticker as string | null) ?? null]),
  );
  // Valuation already enriches tickers where available; the batch lookup
  // only fills gaps and never invents names.
  for (const position of positions) {
    if ((position.ticker ?? null) === null) {
      const fallback = tickerById.get(String(position.assetId)) ?? null;
      if (fallback !== null) position.ticker = fallback;
    }
  }

  const baseCurrency = (portfolio as { baseCurrency?: unknown }).baseCurrency;
  const translated = allocation.translatedAllocation ?? null;
  const translatedAvailable = translated?.status === 'AVAILABLE';
  const reportingCurrency =
    (translatedAvailable ? translated?.reportingCurrency : null) ??
    (typeof baseCurrency === 'string' && baseCurrency !== '' ? baseCurrency : null);

  const rows: DataQualityPositionRow[] = positions.map((position) => {
    const assetId = String(position.assetId);
    const ticker = (position.ticker as string | null) ?? tickerById.get(assetId) ?? null;
    const issues: DataQualityIssue[] = [];
    // Any status without a usable price blocks valuation the same way:
    // the cause differs, the operational fact does not.
    if (
      position.status === 'QUOTE_UNAVAILABLE' ||
      position.status === 'CURRENCY_MISMATCH' ||
      position.status === 'UNSUPPORTED_ASSET'
    ) {
      const issue = buildIssue({ code: 'MISSING_PRICE', assetId, ticker });
      if (issue) issues.push(issue);
    }
    if (position.status === 'QUOTE_STALE') {
      const issue = buildIssue({
        code: 'STALE_PRICE',
        assetId,
        ticker,
        asOf: position.quote?.asOf ?? null,
      });
      if (issue) issues.push(issue);
    }
    if (position.costBasisStatus === 'INCOMPLETE') {
      const issue = buildIssue({ code: 'INCOMPLETE_COST_BASIS', assetId, ticker });
      if (issue) issues.push(issue);
    }
    // Native values stay valid; only reporting-currency views degrade.
    const positionReporting = reportingCurrency ?? position.currency;
    const translatedRow =
      translatedAvailable && Array.isArray(translated?.byAsset)
        ? (translated?.byAsset.find((row) => String(row.assetId) === assetId) ?? null)
        : null;
    if (position.currency !== positionReporting && translatedRow === null) {
      const issue = buildIssue({ code: 'NO_FX_TRANSLATION', assetId, ticker });
      if (issue) issues.push(issue);
    }
    const ordered = sortQualityIssues(issues);
    return {
      assetId,
      ticker,
      currency: position.currency,
      status: deriveQualityStatus(ordered),
      issueCount: ordered.length,
      blockingCount: ordered.filter((issue) => issue.severity === 'BLOCKING').length,
      reviewCount: ordered.filter((issue) => issue.severity === 'REVIEW').length,
      issues: ordered,
      affectedCapabilities: unionCapabilities(ordered),
    };
  });
  rows.sort((a, b) => (a.assetId < b.assetId ? -1 : 1));

  const portfolioIssues: DataQualityIssue[] = [];
  const isEmpty = allocation.status === 'EMPTY';
  if (!isEmpty) {
    const bucketCount = Object.keys(allocation.currencies ?? {}).length;
    if (!translatedAvailable && bucketCount > 1) {
      const issue = buildIssue({
        code: 'MIXED_CURRENCIES_WITHOUT_TRANSLATION',
        assetId: null,
        ticker: null,
      });
      if (issue) portfolioIssues.push(issue);
    }
  }

  // Reconciliation: bounded recent-run window, same 200-row semantics as
  // the portfolio review. Per-asset entries are never persisted, so
  // problem states stay portfolio-level (never inferred per asset).
  const reconciliation = {
    matched: 0,
    divergent: 0,
    missingLocal: 0,
    missingSource: 0,
    unresolved: 0,
    pendingReviews: 0,
    truncated: recentRuns.length >= MAX_RUN_WINDOW,
  };
  for (const row of recentRuns) {
    const summary = row.reconciliation;
    if (!summary) continue;
    reconciliation.matched += summary.matched;
    reconciliation.divergent += summary.divergent;
    reconciliation.missingLocal += summary.missingLocal;
    reconciliation.missingSource += summary.missingSource;
    reconciliation.unresolved += summary.unresolved;
  }
  reconciliation.pendingReviews = deriveReviewItems(recentRuns.map(toDerivationInput)).length;

  const reconIssues: Array<{ code: string; count: number }> = [
    { code: 'RECONCILIATION_DIVERGENT', count: reconciliation.divergent },
    { code: 'RECONCILIATION_MISSING_LOCAL', count: reconciliation.missingLocal },
    { code: 'RECONCILIATION_MISSING_SOURCE', count: reconciliation.missingSource },
    { code: 'RECONCILIATION_UNRESOLVED', count: reconciliation.unresolved },
  ];
  for (const entry of reconIssues) {
    if (entry.count > 0) {
      const issue = buildIssue({
        code: entry.code,
        assetId: null,
        ticker: null,
        count: entry.count,
      });
      if (issue) portfolioIssues.push(issue);
    }
  }
  if (reconciliation.pendingReviews > 0) {
    const issue = buildIssue({
      code: 'PENDING_INTEGRATION_REVIEW',
      assetId: null,
      ticker: null,
      count: reconciliation.pendingReviews,
    });
    if (issue) portfolioIssues.push(issue);
  }

  const allIssues = sortQualityIssues([...rows.flatMap((row) => row.issues), ...portfolioIssues]);

  const issuesByDomain = [...DATA_QUALITY_DOMAIN_ORDER(allIssues)];

  const withoutIssues = rows.filter((row) => row.issueCount === 0).length;
  const blocked = rows.filter((row) =>
    row.issues.some((issue) => issue.severity === 'BLOCKING'),
  ).length;
  const reviewRequired = rows.filter(
    (row) => row.issueCount > 0 && !row.issues.some((issue) => issue.severity === 'BLOCKING'),
  ).length;

  const knownCurrencies = [...new Set(rows.map((row) => row.currency))].sort();
  const unvaluedCount = positions.filter((position) => position.marketValue === null).length;

  const limitations: string[] = [];
  if (isEmpty) limitations.push('NO_ACTIVITY');

  return {
    portfolioId: params.portfolioId,
    generatedAt: new Date().toISOString(),
    marketDataAsOf: (valuation.asOf as string | null) ?? null,
    status: deriveQualityStatus(allIssues),
    summary: {
      positionsTotal: rows.length,
      positionsWithoutIssues: withoutIssues,
      positionsReviewRequired: reviewRequired,
      positionsBlocked: blocked,
      issuesTotal: allIssues.length,
      coveragePercent: String(allocation.valuationCoveragePercent ?? '0'),
      unvaluedCount,
      knownCurrencies,
    },
    issuesByDomain,
    positions: rows,
    portfolioIssues: sortQualityIssues(portfolioIssues),
    reconciliation,
    // No canonical issuer/sector/country/region source exists (5R-C);
    // reported once at portfolio level, never per position.
    structuralLimitations: [
      'ISSUER_CLASSIFICATION_NOT_AVAILABLE',
      'SECTOR_CLASSIFICATION_NOT_AVAILABLE',
    ],
    limitations,
  };
}

function DATA_QUALITY_DOMAIN_ORDER(
  issues: DataQualityIssue[],
): Array<{ domain: string; count: number }> {
  const order = ['MARKET_DATA', 'COST_BASIS', 'FX', 'RECONCILIATION'];
  return order
    .map((domain) => ({
      domain,
      count: issues.filter((issue) => issue.domain === domain).length,
    }))
    .filter((entry) => entry.count > 0);
}
