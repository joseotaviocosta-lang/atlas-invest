/* eslint-disable no-console */
import { calculateHighIncomeMinimumTax, type CorporatePayerEvidenceInput } from '@atlas/tax-engine';

/**
 * Phase 4I.3 — corporate redutor scale benchmark.
 * Observed development/test evidence, not a production SLA.
 */

function buildCase(payerCount: number, distributionsPerPayer: number) {
  const items: Array<{ itemId: string; category: 'DIVIDEND'; amount: string; payerId: string }> =
    [];
  const corporateEvidence: CorporatePayerEvidenceInput[] = [];
  for (let p = 0; p < payerCount; p++) {
    const payerId = `payer-${p}`;
    for (let d = 0; d < distributionsPerPayer; d++) {
      items.push({ itemId: `d-${p}-${d}`, category: 'DIVIDEND', amount: '5000.00', payerId });
    }
    corporateEvidence.push({
      evidenceId: `e-${p}`,
      payerId,
      payerType: 'STANDARD_CORPORATE',
      profitPeriodExercise: 2026,
      mode: 'FULL',
      accountingProfit: '800000.00',
      irDue: '200000.00',
      csllDue: '68000.00',
      evidenceAuthority: 'AUTHORITATIVE',
      evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    });
  }
  return { items, corporateEvidence };
}

function run() {
  console.log('================================================================');
  console.log('  Project Atlas — Phase 4I.3 Corporate Redutor Scale');
  console.log('================================================================\n');

  const payerScales = [1, 10, 100, 1000, 10000];
  const payerResults: Array<Record<string, unknown>> = [];
  for (const payers of payerScales) {
    const { items, corporateEvidence } = buildCase(payers, 2);
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: `scale-payers-${payers}`,
      items,
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence,
    });
    const elapsed = performance.now() - start;
    const memDeltaMb =
      Math.round(((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024) * 100) / 100;
    payerResults.push({
      payers,
      durationMs: Math.round(elapsed * 100) / 100,
      memoryMb: memDeltaMb,
      status: result.status,
      redutor: result.corporateRedutor?.totalSupportedReduction?.amount ?? null,
    });
  }
  console.table(payerResults);

  const distributionScales = [100, 1000, 10000, 50000];
  const distributionResults: Array<Record<string, unknown>> = [];
  for (const distributions of distributionScales) {
    const { items, corporateEvidence } = buildCase(5, Math.ceil(distributions / 5));
    const start = performance.now();
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: `scale-distributions-${distributions}`,
      items,
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence,
    });
    const elapsed = performance.now() - start;
    distributionResults.push({
      distributions: items.length,
      durationMs: Math.round(elapsed * 100) / 100,
      status: result.status,
    });
  }
  console.table(distributionResults);

  console.log('\n[PASS] Phase 4I.3 redutor scale benchmark completed.\n');
}

run();
