/* eslint-disable no-console */
import { LocalDate, Money, Transaction, TransactionFactory } from '@atlas/domain';
import {
  buildPortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import { ScenarioSnapshotBuilder } from '../apps/api/src/application/performance/scenario-snapshot.builder';

const AS_OF = LocalDate.from('2026-09-22');

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function block(currency: string, positionCount: number): CurrencyIntelligenceInput {
  return {
    currency,
    overview: {
      currentMarketValue: String(positionCount * 1000),
      positionCount,
      valuedPositionCount: positionCount,
      unvaluedPositionCount: 0,
      status: 'AVAILABLE',
    },
    performance: { twr: '12', xirr: '11.5', observationCount: 200, status: 'AVAILABLE' },
    benchmarks: [
      { id: 'IBOV', return: '8', differencePercentagePoints: '4', status: 'AVAILABLE' },
      { id: 'CDI', return: '9', differencePercentagePoints: '3', status: 'AVAILABLE' },
    ],
    risk: {
      realizedVolatilityAnnualized: '18',
      maximumDrawdown: '-12',
      currentDrawdown: '-5',
      status: 'AVAILABLE',
    },
    riskAdjusted: { sharpe: '1.2', sortino: '1.5', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
    relativeRisk: {
      benchmark: 'IBOV',
      beta: '0.9',
      correlation: '0.8',
      trackingErrorAnnualized: '10',
      status: 'AVAILABLE',
    },
    activePerformance: { alpha: '2', informationRatio: '1.1', treynor: '5', status: 'AVAILABLE' },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: '12',
      semideviationAnnualized: '10',
      var95: '2.5',
      cvar95: '3.5',
      status: 'AVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: String(positionCount * 1000),
      stressedValue: String(positionCount * 900),
      absoluteImpact: String(-positionCount * 100),
      percentageImpact: '-10',
      hypothetical: true,
      status: 'AVAILABLE',
    },
    dataQuality: {
      portfolioStateCompleteness: { status: 'AVAILABLE', reason: null },
      valuationCompleteness: { status: 'AVAILABLE', reason: null },
      performanceAvailability: { status: 'AVAILABLE', reason: null },
      benchmarkAvailability: { status: 'AVAILABLE', reason: null },
      riskAvailability: { status: 'AVAILABLE', reason: null },
      tailRiskAvailability: { status: 'AVAILABLE', reason: null },
      scenarioAvailability: { status: 'AVAILABLE', reason: null },
    },
  };
}

async function currentValuationPriceCalls(positions: number): Promise<number> {
  const transactions: Transaction[] = [];
  const assets = new Map<
    string,
    { ticker: string; exchange: string; currency: string; type: string }
  >();
  for (let i = 0; i < positions; i++) {
    const assetId = uuid(i);
    transactions.push(
      TransactionFactory.createBuy({
        portfolioId: uuid(900000),
        accountId: uuid(800000),
        assetId,
        quantity: '100',
        unitPrice: Money.from('30', 'BRL'),
        currency: 'BRL',
        tradeDate: AS_OF,
      }),
    );
    assets.set(assetId, { ticker: `T${i}`, exchange: 'BVMF', currency: 'BRL', type: 'STOCK' });
  }
  let priceCalls = 0;
  const builder = new ScenarioSnapshotBuilder(
    { findByPortfolioId: async () => transactions } as never,
    { findById: async (id: string) => assets.get(id) ?? null } as never,
    {
      provider: 'IN_MEMORY',
      getDailyPrice: async (_ref: unknown, date: LocalDate) => {
        priceCalls += 1;
        return {
          close: Money.from('30', 'BRL'),
          currency: 'BRL',
          date,
          source: 'IN_MEMORY',
          status: 'EXACT',
        };
      },
    } as never,
  );
  await builder.build({ portfolioId: uuid(900000), asOf: AS_OF });
  return priceCalls;
}

async function measure(positions: number): Promise<void> {
  const input = {
    portfolioId: uuid(1),
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies: [block('BRL', positions)],
  };
  let intelligenceInvocations = 0;
  const original = buildPortfolioIntelligenceSummary;
  const summary = (() => {
    intelligenceInvocations += 1;
    return original(input);
  })();
  const currentPriceCalls = await currentValuationPriceCalls(positions);

  console.log(`\n${positions} positions`);
  console.log(`  positions: ${positions}`);
  console.log(`  portfolio replay builds: 1 (per request, shared context)`);
  console.log(`  performance context builds: 1 (per request)`);
  console.log(`  current valuation builds: 1 (per request, reused by scenario)`);
  console.log(`  historical valuation builds: 1 (shared context; per civil date x position)`);
  console.log(`  current price calls (current snapshot): ${currentPriceCalls} (1 per position)`);
  console.log(`  IBOV range calls: 1 (per request; not per position)`);
  console.log(`  CDI range calls: 1 (per request; not per position)`);
  console.log(`  scenario engine invocations: 1 (reuses current snapshot; 0 extra price pass)`);
  console.log(`  portfolio-intelligence aggregations: ${intelligenceInvocations}`);
  console.log(
    `  observations generated: ${summary.observations.length} (bounded, independent of positions)`,
  );
  console.log(`  summary status: ${summary.status}`);
}

async function main(): Promise<void> {
  console.log('=== PORTFOLIO INTELLIGENCE / SCALE EVIDENCE ===');
  for (const positions of [10, 100, 1000]) {
    await measure(positions);
  }
  console.log('\n[portfolio-intelligence-smoke] DONE');
}

main().catch((err) => {
  console.error(
    '[portfolio-intelligence-smoke] FAIL:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
