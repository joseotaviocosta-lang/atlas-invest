/* eslint-disable no-console */
import {
  assessHighIncomeMinimumTaxApplicability,
  buildHighIncomeTaxDataSnapshot,
  type HighIncomeIncomeCategory,
  type HighIncomeIncomeItemInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.1 — High-Income Minimum Tax scale benchmark (observed development/test evidence,
 * not a production SLA). Measures pure in-memory snapshot assembly and applicability
 * assessment across synthetic deterministic datasets.
 */

const CATEGORY_CYCLE: readonly HighIncomeIncomeCategory[] = [
  'DIVIDEND',
  'JCP',
  'FII_INCOME',
  'EQUITY_CAPITAL_GAIN',
  'SAVINGS_INCOME',
  'EQUITY_DAY_TRADE_GAIN',
];

function buildItems(count: number, subjectId: string): HighIncomeIncomeItemInput[] {
  const items: HighIncomeIncomeItemInput[] = [];
  for (let i = 0; i < count; i++) {
    const category = CATEGORY_CYCLE[i % CATEGORY_CYCLE.length]!;
    items.push({
      itemId: `${subjectId}-item-${i}`,
      category,
      amount: `${(i % 9000) + 1}.00`,
      payerId: `payer-${i % 25}`,
      paymentDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
    });
  }
  return items;
}

function benchmarkFacts() {
  console.log('================================================================');
  console.log('  Project Atlas — Phase 4I.1 High-Income Minimum Tax Scale');
  console.log('================================================================\n');

  const factScales = [100, 1000, 10000, 50000];
  console.log('-- Snapshot assembly + applicability assessment by fact count --');
  const factResults: Array<Record<string, unknown>> = [];
  for (const count of factScales) {
    const items = buildItems(count, `facts-${count}`);
    const start = performance.now();
    const assessment = assessHighIncomeMinimumTaxApplicability({
      calendarYear: 2026,
      taxSubjectId: `facts-subject-${count}`,
      items,
    });
    const elapsed = performance.now() - start;
    factResults.push({
      facts: count,
      durationMs: Math.round(elapsed * 100) / 100,
      applicability: assessment.applicability,
      classifications: assessment.incomeClassifications.length,
      fingerprint: assessment.snapshotFingerprint.slice(0, 12),
    });
  }
  console.table(factResults);

  console.log('\n-- Snapshot assembly by number of modeled years --');
  const yearCounts = [1, 5, 10, 20];
  const yearResults: Array<Record<string, unknown>> = [];
  for (const years of yearCounts) {
    const items = buildItems(1000, `years-${years}`);
    const start = performance.now();
    let fingerprints = 0;
    for (let y = 0; y < years; y++) {
      const snapshot = buildHighIncomeTaxDataSnapshot({
        calendarYear: 2026 + y,
        taxSubjectId: `years-subject-${years}`,
        items,
      });
      if (snapshot.fingerprint.length === 64) {
        fingerprints += 1;
      }
    }
    const elapsed = performance.now() - start;
    yearResults.push({
      years,
      durationMs: Math.round(elapsed * 100) / 100,
      snapshots: fingerprints,
    });
  }
  console.table(yearResults);

  console.log('\n[PASS] Phase 4I.1 scale benchmark completed.\n');
}

benchmarkFacts();
