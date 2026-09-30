import { describe, expect, it } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import type { Transaction } from '@atlas/domain';
import type { CanonicalRealizedResult } from '@atlas/tax-engine';
import { computeEquityMonthlyFiscalRead } from '../../apps/api/src/application/fiscal/equity-monthly-fiscal-replay.service';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const INSTITUTION = '33333333-3333-4333-8333-333333333333';
const ASSET = '44444444-4444-4444-8444-444444444444';

function sameDayTrades(): {
  transactions: Transaction[];
  canonical: Map<string, CanonicalRealizedResult>;
} {
  const buy = TransactionFactory.createBuy({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: '100',
    unitPrice: '10',
    currency: 'BRL',
    tradeDate: '2026-08-10',
    source: 'B3',
  });
  const sell = TransactionFactory.createSell({
    portfolioId: PORTFOLIO,
    accountId: ACCOUNT,
    assetId: ASSET,
    quantity: '100',
    unitPrice: '30',
    currency: 'BRL',
    tradeDate: '2026-08-10',
    source: 'B3',
  });
  return {
    transactions: [buy, sell],
    canonical: new Map([
      [
        String(sell.id),
        {
          netProceeds: '3000',
          costBasisRemoved: '1000',
          realizedGainLoss: '2000',
          status: 'KNOWN',
        },
      ],
    ]),
  };
}

/**
 * Closure A (4G.2A.1b.2): a real, executable service-level test proving that an
 * equity execution whose canonical institution identity cannot be resolved
 * fails closed with `MISSING_INSTITUTION_IDENTITY` — never guessing an
 * institution, never falling back to `accountId`, and never emitting a partial
 * COMPLETE result.
 */
describe('Phase 4G.2A.1b.2 — missing institution identity fails closed', () => {
  it('blocks the month when the account has no resolvable institution', () => {
    const { transactions, canonical } = sameDayTrades();
    const result = computeEquityMonthlyFiscalRead({
      taxSubjectId: 'user',
      requestedCompetence: '2026-08',
      transactions,
      assetTypeByAssetId: new Map([[ASSET, 'STOCK']]),
      // Institution identity intentionally unresolved for this account.
      institutionByAccountId: new Map(),
      canonicalRealizedByTransactionId: canonical,
      electionByCompetence: new Map(),
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('MISSING_INSTITUTION_IDENTITY');
    // No guessed institution and no fallback to accountId: the same-account,
    // same-day buy/sell pair is NOT matched as day trade.
    expect(result.dayTrade.matchedQuantity).toBe('0');
    expect(result.dayTrade.currentResult).toBe('0');
    // No false exemption and no partial COMPLETE.
    expect(result.normal.exemptionStatus).toBe('NOT_APPLICABLE');
    expect(result.compensationElection.required).toBe(false);
  });

  it('does not block when the institution is resolvable (control)', () => {
    const { transactions, canonical } = sameDayTrades();
    const result = computeEquityMonthlyFiscalRead({
      taxSubjectId: 'user',
      requestedCompetence: '2026-08',
      transactions,
      assetTypeByAssetId: new Map([[ASSET, 'STOCK']]),
      institutionByAccountId: new Map([[ACCOUNT, INSTITUTION]]),
      canonicalRealizedByTransactionId: canonical,
      electionByCompetence: new Map(),
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.dayTrade.matchedQuantity).toBe('100');
  });
});
