import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPortfolioReview, type BuildReviewInput } from '@atlas/portfolio-review';

/**
 * Phase 5Q-A — review derivation contract (pure).
 *
 * Every signal is deterministic, explainable from its evidence and
 * aggregated by stable code (one card per code maximum). Thresholds are
 * attention heuristics, never financial advice: the domain emits codes,
 * counts and raw values — no prose, no recommendations.
 */
function baseInput(overrides: Partial<BuildReviewInput> = {}): BuildReviewInput {
  return {
    portfolioId: 'p1',
    generatedAt: new Date('2026-06-16T12:00:00Z'),
    valuation: {
      asOf: '2026-06-13',
      summary: {
        totalPositions: 4,
        valuedPositions: 4,
        unvaluedPositions: 0,
        stalePositions: 0,
        mismatchPositions: 0,
        valuationCoveragePercent: '100',
        currencies: ['BRL'],
      },
      quoteSummary: {
        totalQuotesRequested: 4,
        quotesAvailable: 4,
        quotesUnavailable: 0,
        quotesStale: 0,
      },
    },
    allocation: {
      status: 'COMPLETE',
      valuationCoveragePercent: '100',
      currencies: {
        BRL: {
          byAsset: [
            { assetId: 'a1', ticker: 'PETR4', allocationPercent: '30', currency: 'BRL' },
            { assetId: 'a2', ticker: 'VALE3', allocationPercent: '30', currency: 'BRL' },
            { assetId: 'a3', ticker: 'ITUB4', allocationPercent: '20', currency: 'BRL' },
            { assetId: 'a4', ticker: 'KNCR11', allocationPercent: '20', currency: 'BRL' },
          ],
        },
      },
      translatedAllocation: null,
    },
    state: {
      openPositionCount: 4,
      hasCashFlowsOnly: false,
      income: [],
    },
    intelligence: {
      period: { startDate: '2025-06-16', endDate: '2026-06-16' },
      benchmarks: [
        { id: 'IBOV', currency: 'BRL', differencePercentagePoints: '1.5', status: 'AVAILABLE' },
        { id: 'CDI', currency: 'BRL', differencePercentagePoints: '0.5', status: 'AVAILABLE' },
      ],
    },
    runs: {
      pendingReviewCount: 0,
      partialRuns: 0,
      reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
    },
    ...overrides,
  };
}

describe('Phase 5Q-A: review derivation', () => {
  it('empty portfolio yields no financial signals, but pending reviews still surface', () => {
    const review = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'EMPTY',
          valuationCoveragePercent: '100',
          currencies: {},
          translatedAllocation: null,
        },
        state: { openPositionCount: 0, hasCashFlowsOnly: false, income: [] },
        runs: {
          pendingReviewCount: 2,
          partialRuns: 0,
          reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
        },
      }),
    );
    expect(review.isEmpty).toBe(true);
    expect(review.signals.map((item) => item.id)).toEqual(['INTEGRATION_PENDING_REVIEW']);
    expect(review.summary.attentionCount).toBe(1);

    const quiet = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'EMPTY',
          valuationCoveragePercent: '100',
          currencies: {},
          translatedAllocation: null,
        },
        state: { openPositionCount: 0, hasCashFlowsOnly: false, income: [] },
      }),
    );
    expect(quiet.signals).toEqual([]);
    expect(quiet.summary.attentionCount).toBe(0);
    expect(quiet.asOf.generatedAt).toBe('2026-06-16T12:00:00.000Z');
    expect(quiet.asOf.marketDataAsOf).toBe('2026-06-13');
  });

  it('complete quiet data yields no signals', () => {
    const review = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'COMPLETE',
          valuationCoveragePercent: '100',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: '10', currency: 'BRL' },
                { assetId: 'a2', ticker: 'VALE3', allocationPercent: '10', currency: 'BRL' },
              ],
            },
          },
          translatedAllocation: null,
        },
      }),
    );
    expect(review.isEmpty).toBe(false);
    expect(review.signals).toEqual([]);
    expect(review.summary.attentionCount).toBe(0);
  });

  it('partial valuation coverage surfaces an INFO data-quality signal', () => {
    const review = buildPortfolioReview(
      baseInput({
        valuation: {
          ...baseInput().valuation,
          summary: {
            totalPositions: 4,
            valuedPositions: 3,
            unvaluedPositions: 1,
            stalePositions: 0,
            mismatchPositions: 0,
            valuationCoveragePercent: '87.40',
            currencies: ['BRL'],
          },
          quoteSummary: {
            totalQuotesRequested: 4,
            quotesAvailable: 3,
            quotesUnavailable: 1,
            quotesStale: 0,
          },
        },
        allocation: {
          status: 'PARTIAL',
          valuationCoveragePercent: '87.40',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: '10', currency: 'BRL' },
              ],
            },
          },
          translatedAllocation: null,
        },
      }),
    );
    const [signal] = review.signals.filter((item) => item.code === 'DATA_VALUATION_COVERAGE');
    expect(signal).toMatchObject({ severity: 'INFO', category: 'DATA_QUALITY' });
    expect(signal!.evidence).toMatchObject({ coveragePercent: '87.40' });
    expect(review.summary.dataNote).toBe('87.40');
    expect(review.dataQuality.missingPrices).toBe(1);
  });

  it('coverage below 80% escalates to REVIEW', () => {
    const review = buildPortfolioReview(
      baseInput({
        valuation: {
          ...baseInput().valuation,
          summary: {
            totalPositions: 4,
            valuedPositions: 1,
            unvaluedPositions: 3,
            stalePositions: 0,
            mismatchPositions: 0,
            valuationCoveragePercent: '42.10',
            currencies: ['BRL'],
          },
        },
        allocation: {
          status: 'PARTIAL',
          valuationCoveragePercent: '42.10',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: '10', currency: 'BRL' },
              ],
            },
          },
          translatedAllocation: null,
        },
      }),
    );
    expect(review.signals.find((item) => item.code === 'DATA_VALUATION_COVERAGE')?.severity).toBe(
      'REVIEW',
    );
  });

  it('concentration below threshold emits nothing; at/above emits REVIEW', () => {
    const bucket = (weight: string) => ({
      status: 'COMPLETE' as const,
      valuationCoveragePercent: '100',
      currencies: {
        BRL: {
          byAsset: [{ assetId: 'a1', ticker: 'PETR4', allocationPercent: weight, currency: 'BRL' }],
        },
      },
      translatedAllocation: null,
    });
    expect(
      buildPortfolioReview(baseInput({ allocation: bucket('24.99') })).signals.map(
        (item) => item.code,
      ),
    ).not.toContain('ALLOCATION_SINGLE_ASSET_CONCENTRATION');

    for (const weight of ['25', '25.00', '31.42']) {
      const review = buildPortfolioReview(baseInput({ allocation: bucket(weight) }));
      const signal = review.signals.find(
        (item) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
      );
      expect(signal?.severity).toBe('REVIEW');
      expect(signal?.evidence).toMatchObject({
        ticker: 'PETR4',
        weightPercent: weight,
        thresholdPercent: '25',
        denominator: 'KNOWN_VALUE_BRL',
      });
      expect(signal?.action).toMatchObject({ kind: 'ROUTE', label: 'Ver alocação' });
      expect(signal?.action.kind === 'ROUTE' ? signal.action.href : '').toContain('tab=allocation');
    }
  });

  it('multiple concentrated positions aggregate into one signal', () => {
    const review = buildPortfolioReview(baseInput());
    const signals = review.signals.filter(
      (item) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.evidence).toMatchObject({ concentratedPositions: 2 });
  });

  it('translated allocation is preferred as the known-value denominator', () => {
    const review = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'COMPLETE',
          valuationCoveragePercent: '100',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: '90', currency: 'BRL' },
              ],
            },
            USD: {
              byAsset: [
                { assetId: 'a2', ticker: 'AAPL', allocationPercent: '90', currency: 'USD' },
              ],
            },
          },
          translatedAllocation: {
            status: 'AVAILABLE',
            byAsset: [{ assetId: 'a1', ticker: 'PETR4', allocationPercent: '31.42' }],
          },
        },
      }),
    );
    const signal = review.signals.find(
      (item) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
    expect(signal?.evidence).toMatchObject({
      denominator: 'KNOWN_VALUE',
      weightPercent: '31.42',
    });
  });

  it('multi-currency without translation skips concentration (no unsound denominator)', () => {
    const review = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'PARTIAL',
          valuationCoveragePercent: '87.40',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: '90', currency: 'BRL' },
              ],
            },
            USD: {
              byAsset: [
                { assetId: 'a2', ticker: 'AAPL', allocationPercent: '90', currency: 'USD' },
              ],
            },
          },
          translatedAllocation: { status: 'UNAVAILABLE', byAsset: [] },
        },
      }),
    );
    expect(review.signals.map((item) => item.code)).not.toContain(
      'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
  });

  it('unparseable weights suppress concentration instead of guessing', () => {
    const review = buildPortfolioReview(
      baseInput({
        allocation: {
          status: 'COMPLETE',
          valuationCoveragePercent: '100',
          currencies: {
            BRL: {
              byAsset: [
                { assetId: 'a1', ticker: 'PETR4', allocationPercent: 'N/A', currency: 'BRL' },
              ],
            },
          },
          translatedAllocation: null,
        },
      }),
    );
    expect(review.signals.map((item) => item.code)).not.toContain(
      'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
  });

  it('benchmark unavailable yields INFO; material gap yields REVIEW', () => {
    const unavailable = buildPortfolioReview(
      baseInput({
        intelligence: {
          period: { startDate: '2025-06-16', endDate: '2026-06-16' },
          benchmarks: [
            {
              id: 'IBOV',
              currency: 'BRL',
              differencePercentagePoints: null,
              status: 'UNAVAILABLE',
            },
          ],
        },
      }),
    );
    expect(
      unavailable.signals.find((item) => item.code === 'PERFORMANCE_BENCHMARK_UNAVAILABLE')
        ?.severity,
    ).toBe('INFO');

    const gap = buildPortfolioReview(
      baseInput({
        intelligence: {
          period: { startDate: '2025-06-16', endDate: '2026-06-16' },
          benchmarks: [
            {
              id: 'IBOV',
              currency: 'BRL',
              differencePercentagePoints: '-4.20',
              status: 'AVAILABLE',
            },
            { id: 'CDI', currency: 'BRL', differencePercentagePoints: '0.30', status: 'AVAILABLE' },
          ],
        },
      }),
    );
    const signal = gap.signals.find((item) => item.code === 'PERFORMANCE_BENCHMARK_GAP');
    expect(signal?.severity).toBe('REVIEW');
    expect(signal?.evidence).toMatchObject({
      worstBenchmark: 'IBOV',
      worstGapPercentagePoints: '-4.20',
    });
    expect(signal?.action).toMatchObject({ kind: 'ROUTE', label: 'Ver performance' });

    const small = buildPortfolioReview(
      baseInput({
        intelligence: {
          period: { startDate: '2025-06-16', endDate: '2026-06-16' },
          benchmarks: [
            {
              id: 'IBOV',
              currency: 'BRL',
              differencePercentagePoints: '-1.50',
              status: 'AVAILABLE',
            },
          ],
        },
      }),
    );
    expect(small.signals.map((item) => item.code)).not.toContain('PERFORMANCE_BENCHMARK_GAP');
  });

  it('pending integration reviews aggregate into one signal with count', () => {
    const review = buildPortfolioReview(
      baseInput({
        runs: {
          pendingReviewCount: 3,
          partialRuns: 0,
          reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
        },
      }),
    );
    const signal = review.signals.find((item) => item.code === 'INTEGRATION_PENDING_REVIEW');
    expect(signal?.severity).toBe('REVIEW');
    expect(signal?.evidence).toMatchObject({ pendingReviewCount: 3 });
    expect(signal?.action).toMatchObject({ kind: 'ROUTE', label: 'Revisar importações' });
  });

  it('reconciliation divergence surfaces as WARNING with counts', () => {
    const review = buildPortfolioReview(
      baseInput({
        runs: {
          pendingReviewCount: 0,
          partialRuns: 1,
          reconciliation: { divergent: 2, missingLocal: 1, missingSource: 0, unresolved: 0 },
        },
      }),
    );
    const signal = review.signals.find((item) => item.code === 'DATA_RECONCILIATION_DIVERGENCE');
    expect(signal?.severity).toBe('WARNING');
    expect(signal?.evidence).toMatchObject({ divergent: 2, missingLocal: 1 });
    expect(review.dataQuality.reconciliation).toMatchObject({ divergent: 2, missingLocal: 1 });
    expect(review.dataQuality.partialRuns).toBe(1);
  });

  it('income received surfaces as INFO with per-currency breakdown', () => {
    const review = buildPortfolioReview(
      baseInput({
        state: {
          openPositionCount: 4,
          hasCashFlowsOnly: false,
          income: [
            {
              currency: 'BRL',
              totalDividends: { amount: '120.50', currency: 'BRL' },
              totalJcp: { amount: '30.00', currency: 'BRL' },
              totalFiiIncome: { amount: '0', currency: 'BRL' },
              totalIncome: { amount: '150.50', currency: 'BRL' },
            },
          ],
        },
      }),
    );
    const signal = review.signals.find((item) => item.code === 'INCOME_RECEIVED');
    expect(signal?.severity).toBe('INFO');
    expect(signal?.action).toMatchObject({ kind: 'ROUTE', label: 'Ver proventos' });
    expect(String(signal?.evidence.breakdown)).toContain('150.50');

    const none = buildPortfolioReview(baseInput());
    expect(none.signals.map((item) => item.code)).not.toContain('INCOME_RECEIVED');
  });

  it('never emits tax signals and never fabricates tax intelligence', () => {
    const kitchenSink = baseInput({
      runs: {
        pendingReviewCount: 2,
        partialRuns: 1,
        reconciliation: { divergent: 1, missingLocal: 0, missingSource: 0, unresolved: 0 },
      },
    });
    const review = buildPortfolioReview(kitchenSink);
    expect(review.signals.some((item) => item.category === 'TAX')).toBe(false);
  });

  it('orders deterministically: integrity, coverage, integration, allocation, performance, income', () => {
    const review = buildPortfolioReview(
      baseInput({
        valuation: {
          ...baseInput().valuation,
          summary: {
            totalPositions: 4,
            valuedPositions: 3,
            unvaluedPositions: 1,
            stalePositions: 0,
            mismatchPositions: 0,
            valuationCoveragePercent: '87.40',
            currencies: ['BRL'],
          },
        },
        runs: {
          pendingReviewCount: 2,
          partialRuns: 0,
          reconciliation: { divergent: 1, missingLocal: 0, missingSource: 0, unresolved: 0 },
        },
        state: {
          openPositionCount: 4,
          hasCashFlowsOnly: false,
          income: [
            {
              currency: 'BRL',
              totalDividends: { amount: '10', currency: 'BRL' },
              totalJcp: { amount: '0', currency: 'BRL' },
              totalFiiIncome: { amount: '0', currency: 'BRL' },
              totalIncome: { amount: '10', currency: 'BRL' },
            },
          ],
        },
        intelligence: {
          period: { startDate: '2025-06-16', endDate: '2026-06-16' },
          benchmarks: [
            {
              id: 'IBOV',
              currency: 'BRL',
              differencePercentagePoints: '-3.00',
              status: 'AVAILABLE',
            },
          ],
        },
      }),
    );
    expect(review.signals.map((item) => item.id)).toEqual([
      'DATA_RECONCILIATION_DIVERGENCE',
      'DATA_VALUATION_COVERAGE',
      'INTEGRATION_PENDING_REVIEW',
      'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
      'PERFORMANCE_BENCHMARK_GAP',
      'INCOME_RECEIVED',
    ]);
    expect(review.summary.attentionCount).toBe(4);
  });

  it('signal ids are stable and evidence preserves raw values', () => {
    const review = buildPortfolioReview(baseInput());
    for (const signal of review.signals) {
      expect(signal.id).toBe(signal.code);
    }
    const concentration = review.signals.find(
      (item) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
    expect(concentration?.evidence.weightPercent).toBe('30');
    expect(typeof concentration?.evidence.concentratedPositions).toBe('number');
  });

  it('domain contracts contain no advice, predictive or guarantee language', () => {
    const files = ['types.ts', 'policy.ts', 'derive-review.ts'].map((file) =>
      fs.readFileSync(path.join(process.cwd(), 'packages/portfolio-review/src', file), 'utf8'),
    );
    for (const content of files) {
      // Directive/predictive/guarantee language is forbidden. Explanatory
      // boundary documentation ("no threshold implies buy/sell") is allowed.
      expect(content).not.toMatch(
        /você deve (comprar|vender)|recomendamos (comprar|vender)|melhor investimento|garantia de retorno|vai subir|vai cair|rentabilidade garantida|health score|score de saúde/i,
      );
    }
  });
});
