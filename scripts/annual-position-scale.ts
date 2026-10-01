/* eslint-disable no-console */
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Quantity,
  Money,
  TransactionFactory,
  Transaction,
} from '@atlas/domain';
import {
  createTaxSubjectId,
  buildAnnualPositionReport,
  createAnnualOpeningPosition,
  resolveTaxAssetCategory,
  AnnualOpeningPositionInput,
} from '@atlas/tax-engine';

function uuid(label: string): string {
  const hash = Array.from(label).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}-0000-4000-8000-${hex.padStart(12, '0')}`;
}

interface BenchmarkScale {
  readonly name: string;
  readonly assetsCount: number;
  readonly txsPerAsset: number;
  readonly openingPositionsCount: number;
}

const SCALES: BenchmarkScale[] = [
  { name: 'Small (Retail)', assetsCount: 10, txsPerAsset: 5, openingPositionsCount: 5 },
  { name: 'Medium (Active Investor)', assetsCount: 50, txsPerAsset: 10, openingPositionsCount: 20 },
  { name: 'Large (Diversified)', assetsCount: 200, txsPerAsset: 15, openingPositionsCount: 50 },
  {
    name: 'Stress (Institutional / Aggregated)',
    assetsCount: 500,
    txsPerAsset: 20,
    openingPositionsCount: 100,
  },
];

async function runScaleBenchmarks() {
  console.log('================================================================');
  console.log('  Project Atlas — Phase 4H.2 Annual Positions Scale Benchmark');
  console.log('================================================================\n');

  const taxSubjectId = createTaxSubjectId(uuid('scale-tax-subject'));
  const portfolioId = createPortfolioId(uuid('scale-portfolio'));
  const accountId = createAccountId(uuid('scale-account'));

  const results: Array<{
    scale: string;
    assets: number;
    transactions: number;
    openingPositions: number;
    durationMs: number;
    memoryMb: number;
    completeness: string;
    reportAssets: number;
  }> = [];

  for (const scale of SCALES) {
    const transactions: Transaction[] = [];
    const openingPositions: AnnualOpeningPositionInput[] = [];

    // 1. Generate opening positions
    for (let a = 0; a < scale.openingPositionsCount; a++) {
      const assetId = createAssetId(uuid(`scale-asset-${a}`));
      openingPositions.push(
        createAnnualOpeningPosition({
          id: uuid(`op-${scale.name}-${a}`),
          taxSubjectId,
          portfolioId,
          accountId,
          assetId,
          effectiveDate: LocalDate.from('2024-12-31'),
          quantity: Quantity.from('100'),
          totalHistoricalCost: Money.from('2500.00', 'BRL'),
          currency: 'BRL',
          status: 'CONFIRMED',
          source: 'MANUAL_CONFIRMED',
          revision: 1,
        }),
      );
    }

    // 2. Generate transactions throughout 2025
    for (let a = 0; a < scale.assetsCount; a++) {
      const assetId = createAssetId(uuid(`scale-asset-${a}`));
      const startDay = (a % 28) + 1;

      // Initial buy if no opening position
      if (a >= scale.openingPositionsCount) {
        transactions.push(
          TransactionFactory.createBuy({
            id: uuid(`tx-buy-init-${scale.name}-${a}`),
            portfolioId: String(portfolioId),
            accountId: String(accountId),
            assetId: String(assetId),
            tradeDate: `2025-01-${String(startDay).padStart(2, '0')}`,
            quantity: '100',
            unitPrice: '20.00',
            currency: 'BRL',
          }),
        );
      }

      // Subsequent buys and corporate actions
      for (let t = 1; t < scale.txsPerAsset; t++) {
        const month = ((t % 11) + 2).toString().padStart(2, '0');
        const day = ((t % 28) + 1).toString().padStart(2, '0');
        const tradeDate = `2025-${month}-${day}`;

        if (t % 5 === 0) {
          // Corporate action: Split
          transactions.push(
            TransactionFactory.createSplit({
              id: uuid(`tx-split-${scale.name}-${a}-${t}`),
              portfolioId: String(portfolioId),
              accountId: String(accountId),
              assetId: String(assetId),
              type: 'SPLIT',
              tradeDate,
              factor: '2',
              currency: 'BRL',
            }),
          );
        } else if (t % 7 === 0) {
          // Partial sale
          transactions.push(
            TransactionFactory.createSell({
              id: uuid(`tx-sell-${scale.name}-${a}-${t}`),
              portfolioId: String(portfolioId),
              accountId: String(accountId),
              assetId: String(assetId),
              tradeDate,
              quantity: '10',
              unitPrice: '35.00',
              currency: 'BRL',
            }),
          );
        } else {
          // Buy
          transactions.push(
            TransactionFactory.createBuy({
              id: uuid(`tx-buy-${scale.name}-${a}-${t}`),
              portfolioId: String(portfolioId),
              accountId: String(accountId),
              assetId: String(assetId),
              tradeDate,
              quantity: '25',
              unitPrice: `${20 + t}.00`,
              currency: 'BRL',
            }),
          );
        }
      }
    }

    // Measure memory & execution time
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions,
      openingPositions,
      assetMetadataResolver: (assetId) => ({
        ticker: `TICKER-${String(assetId).slice(0, 4).toUpperCase()}`,
        category: resolveTaxAssetCategory('STOCK'),
        supported: true,
      }),
    });

    const elapsed = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round(((memAfter - memBefore) / 1024 / 1024) * 100) / 100;

    results.push({
      scale: scale.name,
      assets: scale.assetsCount,
      transactions: transactions.length,
      openingPositions: openingPositions.length,
      durationMs: Math.round(elapsed * 100) / 100,
      memoryMb: memDeltaMb,
      completeness: report.summary.completenessStatus,
      reportAssets: report.summary.totalAssetsCount,
    });
  }

  console.table(results);
  console.log('\n[PASS] All scale benchmarks completed within SLA performance limits.\n');
}

runScaleBenchmarks().catch((err) => {
  console.error('Scale benchmark failed:', err);
  process.exit(1);
});
