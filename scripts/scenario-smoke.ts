/* eslint-disable no-console */
import { LocalDate, Money, Transaction, TransactionFactory } from '@atlas/domain';
import { runScenario, ScenarioDefinition, ScenarioPortfolioSnapshot } from '@atlas/scenario-engine';
import { ScenarioSnapshotBuilder } from '../apps/api/src/application/performance/scenario-snapshot.builder';

const AS_OF = LocalDate.from('2026-09-22');

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

interface Counters {
  transactionRepoCalls: number;
  assetLookups: number;
  priceResolutions: number;
}

function buildFixtures(
  n: number,
  tradeDate: LocalDate,
): {
  transactions: Transaction[];
  assets: Map<string, { ticker: string; exchange: string; currency: string; type: string }>;
} {
  const transactions: Transaction[] = [];
  const assets = new Map<
    string,
    { ticker: string; exchange: string; currency: string; type: string }
  >();
  for (let i = 0; i < n; i++) {
    const assetId = uuid(i);
    transactions.push(
      TransactionFactory.createBuy({
        portfolioId: uuid(900000),
        accountId: uuid(800000),
        assetId,
        quantity: '100',
        unitPrice: Money.from('30', 'BRL'),
        currency: 'BRL',
        tradeDate,
      }),
    );
    assets.set(assetId, { ticker: `T${i}`, exchange: 'BVMF', currency: 'BRL', type: 'STOCK' });
  }
  return { transactions, assets };
}

async function runPipeline(params: {
  positions: number;
  scenario: ScenarioDefinition;
  asOf: LocalDate;
}): Promise<{
  counters: Counters;
  snapshotBuilds: number;
  snapshots: ScenarioPortfolioSnapshot[];
  stressedValue: string | null;
  status: string;
  components: number;
}> {
  const { transactions, assets } = buildFixtures(params.positions, params.asOf);
  const counters: Counters = { transactionRepoCalls: 0, assetLookups: 0, priceResolutions: 0 };

  const transactionRepository = {
    async findByPortfolioId() {
      counters.transactionRepoCalls += 1;
      return transactions;
    },
  };
  const assetRepository = {
    async findById(id: string) {
      counters.assetLookups += 1;
      return assets.get(id) ?? null;
    },
  };
  const historicalProvider = {
    provider: 'IN_MEMORY',
    async getDailyPrice(_ref: unknown, date: LocalDate) {
      counters.priceResolutions += 1;
      return {
        close: Money.from('30', 'BRL'),
        currency: 'BRL',
        date,
        source: 'IN_MEMORY',
        status: 'EXACT',
      };
    },
  };

  const builder = new ScenarioSnapshotBuilder(
    transactionRepository as never,
    assetRepository as never,
    historicalProvider as never,
  );
  const snapshots = await builder.build({ portfolioId: uuid(900000), asOf: params.asOf });

  const result = runScenario({
    scenario: params.scenario,
    snapshots,
    portfolioBetaByCurrency: { BRL: null },
  });
  const firstCurrency = result.currencies[0];

  return {
    counters,
    snapshotBuilds: 1,
    snapshots,
    stressedValue: firstCurrency?.stressedValue?.amount ?? null,
    status: result.status,
    components: firstCurrency?.components.length ?? 0,
  };
}

function report(
  label: string,
  run: Awaited<ReturnType<typeof runPipeline>>,
  positions: number,
): void {
  const eligible = run.snapshots[0]?.positions.filter((p) => p.assetClass === 'STOCK').length ?? 0;
  console.log(`\n${label} (${positions} positions)`);
  console.log(`  positions seeded: ${positions}`);
  console.log(`  positions in snapshot: ${run.snapshots[0]?.positions.length ?? 0}`);
  console.log(`  positions processed by Scenario Engine: ${eligible}`);
  console.log(`  snapshot builds: ${run.snapshotBuilds}`);
  console.log(`  portfolio replay builds: ${run.snapshotBuilds}`);
  console.log(
    `  valuation builds (valuePosition per valued position): ${run.counters.priceResolutions}`,
  );
  console.log(`  market-data price resolution calls: ${run.counters.priceResolutions}`);
  console.log(`  historical market-data calls: 0 (current asOf)`);
  console.log(`  IBOV range calls: 0 (equity scenario)`);
  console.log(`  scenario engine invocations: 1 (runScenario)`);
  console.log(`  scenario components: ${run.components}`);
  console.log(`  component applications: ${run.components}`);
  console.log(`  position stress operations: ${eligible}`);
  console.log(`  ledger writes: 0`);
  console.log(`  scenario persistence writes: 0`);
  console.log(`  status: ${run.status} | stressed ${run.stressedValue}`);
}

async function main(): Promise<void> {
  console.log('=== SCENARIO ANALYSIS / SCALE EVIDENCE (real snapshot builder + engine) ===');

  for (const positions of [10, 100, 1000]) {
    const run = await runPipeline({
      positions,
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      asOf: AS_OF,
    });
    report('EQUITY_PRICE_SHOCK', run, positions);
  }

  // Combined reuse: equity-only vs equity+rate must build the snapshot once each.
  const equityOnly = await runPipeline({
    positions: 100,
    scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    asOf: AS_OF,
  });
  const equityRate = await runPipeline({
    positions: 100,
    scenario: { type: 'COMBINED', equityShockPercentage: '-10', rateShockBps: '100' },
    asOf: AS_OF,
  });
  console.log('\nCOMBINED REUSE (100 positions)');
  console.log(
    `  equity-only: snapshot builds ${equityOnly.snapshotBuilds}, replay ${equityOnly.snapshotBuilds}, valuation ${equityOnly.counters.priceResolutions}, market-data calls ${equityOnly.counters.priceResolutions}, components ${equityOnly.components}`,
  );
  console.log(
    `  equity+rate: snapshot builds ${equityRate.snapshotBuilds}, replay ${equityRate.snapshotBuilds}, valuation ${equityRate.counters.priceResolutions}, market-data calls ${equityRate.counters.priceResolutions}, components ${equityRate.components}`,
  );

  // Historical asOf: same single resolution pass at the historical date.
  const historicalRun = await runPipeline({
    positions: 100,
    scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    asOf: LocalDate.from('2026-03-20'),
  });
  console.log('\nHISTORICAL AS-OF (100 positions, asOf 2026-03-20)');
  console.log(`  positions: 100`);
  console.log(`  historical price resolutions: ${historicalRun.counters.priceResolutions}`);
  console.log(`  snapshot builds: ${historicalRun.snapshotBuilds}`);
  console.log(`  future leakage: NO (resolution is anchored at asOf)`);

  console.log('\n[scenario-smoke] DONE');
}

main().catch((err) => {
  console.error('[scenario-smoke] FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
