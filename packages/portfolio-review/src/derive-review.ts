import {
  BENCHMARK_GAP_MATERIAL_PP_BP,
  SINGLE_ASSET_CONCENTRATION_BP,
  VALUATION_COVERAGE_ATTENTION_BP,
  VALUATION_COVERAGE_LOW_BP,
  isPositiveAmountString,
  percentStringToBasisPoints,
} from './policy';
import type {
  BuildReviewInput,
  PortfolioReview,
  PortfolioReviewSignal,
  ReviewSignalCode,
} from './types';

const SIGNAL_RANK: Record<ReviewSignalCode, number> = {
  DATA_RECONCILIATION_DIVERGENCE: 0,
  DATA_VALUATION_COVERAGE: 1,
  INTEGRATION_PENDING_REVIEW: 2,
  ALLOCATION_SINGLE_ASSET_CONCENTRATION: 3,
  PERFORMANCE_BENCHMARK_GAP: 4,
  PERFORMANCE_BENCHMARK_UNAVAILABLE: 5,
  INCOME_RECEIVED: 6,
};

function route(href: string, label: string): PortfolioReviewSignal['action'] {
  return { kind: 'ROUTE', href, label };
}

/**
 * Phase 5Q-A — deterministic review derivation (pure, zero I/O).
 *
 * Every signal is explainable from its evidence; ordering is total
 * (rank, then code); signal ids are stable codes. Aggregation is built
 * in: one code emits at most one signal per review. Anything without a
 * sound number (unparseable percent, missing denominator) suppresses
 * the signal instead of guessing.
 */
export function buildPortfolioReview(input: BuildReviewInput): PortfolioReview {
  const generatedAt = input.generatedAt.toISOString();
  const marketDataAsOf = input.valuation.asOf;
  const coverageBp = percentStringToBasisPoints(input.valuation.summary.valuationCoveragePercent);

  const isEmpty = input.allocation.status === 'EMPTY';
  const signals: PortfolioReviewSignal[] = [];
  const quality = buildDataQuality(input);

  const coverageSignal = coverageSignalFor(input, coverageBp);
  if (coverageSignal) signals.push(coverageSignal);

  const reconciliationSignal = reconciliationSignalFor(input);
  if (reconciliationSignal) signals.push(reconciliationSignal);

  if (input.runs.pendingReviewCount > 0) {
    signals.push({
      id: 'INTEGRATION_PENDING_REVIEW',
      code: 'INTEGRATION_PENDING_REVIEW',
      category: 'INTEGRATION',
      severity: 'REVIEW',
      evidence: { pendingReviewCount: input.runs.pendingReviewCount },
      action: route(`/reviews?portfolioId=${input.portfolioId}`, 'Revisar importações'),
    });
  }

  // Financial signals need positions to reason about. An empty portfolio
  // still surfaces data-quality and pending-review signals above: a fresh
  // import awaiting review is exactly how holdings arrive.
  if (!isEmpty) {
    const concentrationSignal = concentrationSignalFor(input);
    if (concentrationSignal) signals.push(concentrationSignal);

    for (const signal of performanceSignalsFor(input)) {
      signals.push(signal);
    }

    const incomeSignal = incomeSignalFor(input);
    if (incomeSignal) signals.push(incomeSignal);
  }

  signals.sort((left, right) => {
    const rank = SIGNAL_RANK[left.code] - SIGNAL_RANK[right.code];
    return rank !== 0 ? rank : left.id.localeCompare(right.id);
  });

  const attentionCount = signals.filter(
    (signal) => signal.severity === 'REVIEW' || signal.severity === 'WARNING',
  ).length;

  return {
    portfolioId: input.portfolioId,
    asOf: { generatedAt, marketDataAsOf },
    summary: {
      attentionCount,
      dataNote:
        coverageBp !== null && coverageBp < VALUATION_COVERAGE_ATTENTION_BP
          ? input.valuation.summary.valuationCoveragePercent
          : null,
    },
    dataQuality: quality,
    signals,
    isEmpty,
  };
}

function buildDataQuality(input: BuildReviewInput): PortfolioReview['dataQuality'] {
  const summary = input.valuation.summary;
  return {
    valuationCoveragePercent: input.valuation.summary.valuationCoveragePercent,
    totalPositions: summary.totalPositions,
    valuedPositions: summary.valuedPositions,
    unvaluedPositions: summary.unvaluedPositions,
    stalePositions: summary.stalePositions,
    missingPrices: input.valuation.quoteSummary.quotesUnavailable,
    reconciliation: { ...input.runs.reconciliation },
    partialRuns: input.runs.partialRuns,
    pendingReviews: input.runs.pendingReviewCount,
  };
}

function coverageSignalFor(
  input: BuildReviewInput,
  coverageBp: number | null,
): PortfolioReviewSignal | null {
  // No positions means no denominator: never emit coverage copy for an
  // empty portfolio (would read as "X% of nothing").
  if (input.valuation.summary.totalPositions === 0) return null;
  if (coverageBp === null || coverageBp >= VALUATION_COVERAGE_ATTENTION_BP) {
    return null;
  }
  return {
    id: 'DATA_VALUATION_COVERAGE',
    code: 'DATA_VALUATION_COVERAGE',
    category: 'DATA_QUALITY',
    severity: coverageBp < VALUATION_COVERAGE_LOW_BP ? 'REVIEW' : 'INFO',
    evidence: {
      coveragePercent: input.valuation.summary.valuationCoveragePercent,
      valuedPositions: input.valuation.summary.valuedPositions,
      totalPositions: input.valuation.summary.totalPositions,
      stalePositions: input.valuation.summary.stalePositions,
    },
    action: route(`/portfolio?portfolioId=${input.portfolioId}`, 'Ver valuation'),
  };
}

function reconciliationSignalFor(input: BuildReviewInput): PortfolioReviewSignal | null {
  const { divergent, missingLocal, missingSource, unresolved } = input.runs.reconciliation;
  const total = divergent + missingLocal + missingSource + unresolved;
  if (total <= 0) return null;
  return {
    id: 'DATA_RECONCILIATION_DIVERGENCE',
    code: 'DATA_RECONCILIATION_DIVERGENCE',
    category: 'DATA_QUALITY',
    severity: 'WARNING',
    evidence: { divergent, missingLocal, missingSource, unresolved },
    action: route(`/reviews?portfolioId=${input.portfolioId}`, 'Ver pendências'),
  };
}

function concentrationSignalFor(input: BuildReviewInput): PortfolioReviewSignal | null {
  const translated = input.allocation.translatedAllocation;
  let items: Array<{ assetId: string; ticker: string | null; allocationPercent: string }>;
  let denominator: string;
  if (translated && translated.status === 'AVAILABLE') {
    items = translated.byAsset.map((item) => ({
      assetId: item.assetId,
      ticker: item.ticker ?? null,
      allocationPercent: item.allocationPercent,
    }));
    denominator = 'KNOWN_VALUE';
  } else {
    const currencies = Object.keys(input.allocation.currencies);
    if (currencies.length !== 1) return null;
    const bucket = input.allocation.currencies[currencies[0] as string]!;
    items = bucket.byAsset.map((item) => ({
      assetId: item.assetId,
      ticker: item.ticker,
      allocationPercent: item.allocationPercent,
    }));
    denominator = `KNOWN_VALUE_${bucket.byAsset[0]?.currency ?? currencies[0]}`;
  }
  const concentrated = items
    .map((item) => ({
      item,
      weightBp: percentStringToBasisPoints(item.allocationPercent),
    }))
    .filter(
      (entry): entry is { item: (typeof items)[number]; weightBp: number } =>
        entry.weightBp !== null && entry.weightBp >= SINGLE_ASSET_CONCENTRATION_BP,
    )
    .sort((left, right) => right.weightBp - left.weightBp);
  if (concentrated.length === 0) return null;
  const [top] = concentrated;
  if (!top) return null;
  return {
    id: 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    code: 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    category: 'ALLOCATION',
    severity: 'REVIEW',
    evidence: {
      ticker: top.item.ticker,
      assetId: top.item.assetId,
      weightPercent: top.item.allocationPercent,
      thresholdPercent: '25',
      concentratedPositions: concentrated.length,
      denominator,
      coveragePercent: input.allocation.valuationCoveragePercent,
    },
    action: route(`/portfolio?tab=allocation&portfolioId=${input.portfolioId}`, 'Ver alocação'),
  };
}

function performanceSignalsFor(input: BuildReviewInput): PortfolioReviewSignal[] {
  const gaps: Array<{ id: string; gap: string; gapBp: number }> = [];
  const unavailable: string[] = [];
  for (const benchmark of input.intelligence.benchmarks) {
    if (benchmark.differencePercentagePoints === null) {
      unavailable.push(benchmark.id);
      continue;
    }
    const gapBp = percentStringToBasisPoints(benchmark.differencePercentagePoints);
    if (gapBp === null) {
      unavailable.push(benchmark.id);
      continue;
    }
    if (gapBp <= BENCHMARK_GAP_MATERIAL_PP_BP) {
      gaps.push({ id: benchmark.id, gap: benchmark.differencePercentagePoints, gapBp });
    }
  }
  if (gaps.length > 0) {
    gaps.sort((left, right) => left.gapBp - right.gapBp);
    const [worst] = gaps;
    return [
      {
        id: 'PERFORMANCE_BENCHMARK_GAP',
        code: 'PERFORMANCE_BENCHMARK_GAP',
        category: 'PERFORMANCE',
        severity: 'REVIEW',
        evidence: {
          benchmarks: gaps.map((entry) => entry.id).join(','),
          worstBenchmark: worst!.id,
          worstGapPercentagePoints: worst!.gap,
          periodStart: input.intelligence.period.startDate,
          periodEnd: input.intelligence.period.endDate,
        },
        action: route(`/portfolio/performance?portfolioId=${input.portfolioId}`, 'Ver performance'),
      },
    ];
  }
  if (unavailable.length > 0) {
    return [
      {
        id: 'PERFORMANCE_BENCHMARK_UNAVAILABLE',
        code: 'PERFORMANCE_BENCHMARK_UNAVAILABLE',
        category: 'PERFORMANCE',
        severity: 'INFO',
        evidence: {
          benchmarks: [...unavailable].sort().join(','),
          periodStart: input.intelligence.period.startDate,
          periodEnd: input.intelligence.period.endDate,
        },
        action: route(`/portfolio/performance?portfolioId=${input.portfolioId}`, 'Ver performance'),
      },
    ];
  }
  return [];
}

function incomeSignalFor(input: BuildReviewInput): PortfolioReviewSignal | null {
  const withIncome = input.state.income.filter((row) =>
    isPositiveAmountString(row.totalIncome.amount),
  );
  if (withIncome.length === 0) return null;
  const breakdown = withIncome
    .map(
      (row) =>
        `${row.currency} ${row.totalIncome.amount} (div ${row.totalDividends.amount}, jcp ${row.totalJcp.amount}, fii ${row.totalFiiIncome.amount})`,
    )
    .join('; ');
  return {
    id: 'INCOME_RECEIVED',
    code: 'INCOME_RECEIVED',
    category: 'INCOME',
    severity: 'INFO',
    evidence: {
      currencies: withIncome.map((row) => row.currency).join(','),
      breakdown,
    },
    action: route(`/portfolio/income?portfolioId=${input.portfolioId}`, 'Ver proventos'),
  };
}
