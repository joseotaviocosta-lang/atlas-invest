import { describe, expect, it } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import type { Transaction } from '@atlas/domain';
import type { CanonicalRealizedResult } from '@atlas/tax-engine';
import { computeEquityMonthlyFiscalRead } from '../../apps/api/src/application/fiscal/equity-monthly-fiscal-replay.service';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const INSTITUTION = '33333333-3333-4333-8333-333333333333';
const ASSET = '44444444-4444-4444-8444-444444444444';

function monthOf(index: number): string {
  const year = 2020 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${month.toString().padStart(2, '0')}`;
}

function buildLedger(
  months: number,
  perMonth: number,
): {
  transactions: Transaction[];
  canonicalRealizedByTransactionId: Map<string, CanonicalRealizedResult>;
} {
  const transactions: Transaction[] = [];
  const canonicalRealizedByTransactionId = new Map<string, CanonicalRealizedResult>();
  for (let m = 0; m < months; m += 1) {
    const competence = monthOf(m);
    for (let i = 0; i < perMonth; i += 1) {
      const buy = TransactionFactory.createBuy({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '100',
        unitPrice: '10',
        currency: 'BRL',
        tradeDate: `${competence}-05`,
        source: 'B3',
      });
      const sell = TransactionFactory.createSell({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '100',
        unitPrice: '11',
        currency: 'BRL',
        tradeDate: `${competence}-20`,
        source: 'B3',
      });
      transactions.push(buy, sell);
      canonicalRealizedByTransactionId.set(String(sell.id), {
        netProceeds: '1100',
        costBasisRemoved: '1000',
        realizedGainLoss: '100',
        status: 'KNOWN',
      });
    }
  }
  return { transactions, canonicalRealizedByTransactionId };
}

function run(months: number, perMonth: number): { ms: number; status: string } {
  const { transactions, canonicalRealizedByTransactionId } = buildLedger(months, perMonth);
  const started = performance.now();
  const result = computeEquityMonthlyFiscalRead({
    taxSubjectId: 'user',
    requestedCompetence: monthOf(months - 1),
    transactions,
    assetTypeByAssetId: new Map([[ASSET, 'STOCK']]),
    institutionByAccountId: new Map([[ACCOUNT, INSTITUTION]]),
    canonicalRealizedByTransactionId,
    electionByCompetence: new Map(),
  });
  return { ms: performance.now() - started, status: result.status };
}

describe('Phase 4G.2A.1b.1 — equity monthly replay scale', () => {
  it('scales across transaction volume and replay depth', () => {
    const report: string[] = [];
    for (const perMonth of [1, 6, 30, 60, 500]) {
      const { ms, status } = run(1, perMonth);
      expect(status).toBe('COMPLETE');
      report.push(`transactions=${perMonth * 2} months=1 total=${ms.toFixed(1)}ms`);
    }
    for (const months of [1, 12, 60, 120]) {
      const { ms, status } = run(months, 1);
      expect(status).toBe('COMPLETE');
      report.push(`transactions=${months * 2} months=${months} total=${ms.toFixed(1)}ms`);
    }
    console.info(`[equity-monthly-replay-scale]\n${report.join('\n')}`);
    expect(report).toHaveLength(9);
  });
});
