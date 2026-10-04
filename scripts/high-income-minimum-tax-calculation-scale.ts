/* eslint-disable no-console */
import { calculateHighIncomeMinimumTax, type HighIncomeIncomeItemInput } from '@atlas/tax-engine';

/**
 * Phase 4I.2 — high-income minimum-tax calculation scale benchmark.
 * Observed development/test evidence, not a production SLA.
 */

function buildItems(count: number, payerCount: number): HighIncomeIncomeItemInput[] {
  const items: HighIncomeIncomeItemInput[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      itemId: `item-${i}`,
      category: i % 3 === 0 ? 'JCP' : 'EQUITY_CAPITAL_GAIN',
      amount: `${(i % 9000) + 1}.00`,
      payerId: `payer-${i % payerCount}`,
      paymentDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
    });
  }
  return items;
}

function run() {
  console.log('================================================================');
  console.log('  Project Atlas — Phase 4I.2 High-Income Minimum Tax Calculation Scale');
  console.log('================================================================\n');

  const itemScales = [100, 1000, 10000, 50000, 100000];
  const itemResults: Array<Record<string, unknown>> = [];
  for (const count of itemScales) {
    const items = buildItems(count, 25);
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: `scale-${count}`,
      items,
      taxPaidFacts: [
        { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' },
        { factId: 'wh', kind: 'EXCLUSIVE_SOURCE_WITHHOLDING', amount: '0' },
      ],
    });
    const elapsed = performance.now() - start;
    const memDeltaMb =
      Math.round(((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024) * 100) / 100;
    itemResults.push({
      items: count,
      durationMs: Math.round(elapsed * 100) / 100,
      memoryMb: memDeltaMb,
      status: result.status,
      base: result.minimumTaxBase?.amount ?? null,
      gross: result.grossMinimumTax?.amount ?? null,
      fingerprint: result.calculationFingerprint.slice(0, 12),
    });
  }
  console.table(itemResults);

  const payerScales = [1, 100, 1000];
  const payerResults: Array<Record<string, unknown>> = [];
  for (const payers of payerScales) {
    const items = buildItems(5000, payers);
    const start = performance.now();
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: `payers-${payers}`,
      items,
      taxPaidFacts: [
        { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' },
        { factId: 'wh', kind: 'EXCLUSIVE_SOURCE_WITHHOLDING', amount: '0' },
      ],
    });
    const elapsed = performance.now() - start;
    payerResults.push({
      payers,
      durationMs: Math.round(elapsed * 100) / 100,
      status: result.status,
      jcpPayers:
        result.incomeBreakdown.find((entry) => entry.category === 'JCP')?.payerIds.length ?? 0,
    });
  }
  console.table(payerResults);

  console.log('\n[PASS] Phase 4I.2 calculation scale benchmark completed.\n');
}

run();
