import { describe, it, expect } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { summarizeDocumentaryCoverage } from '../../packages/tax-intelligence/src/index';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '23333333-3333-4333-8333-333333333333';
const ASSET_A = '33333333-3333-4333-8333-333333333333';
const ASSET_B = '34444444-4444-4334-8333-444444444444';

function verifiedRow(assetId: string, accountId: string) {
  return {
    id: `ev-${assetId.slice(0, 4)}-${accountId.slice(0, 4)}`,
    assetId,
    accountId,
    acquisitionDate: '2024-12-26',
    quantityCovered: '100',
    unitCost: '10.00',
    totalCost: '1000.00',
    currency: 'BRL',
    evidenceType: 'BROKERAGE_NOTE',
    sourceReference: 'DOC-1',
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
    status: 'VERIFIED',
  };
}

describe('summarizeDocumentaryCoverage — asset-level aggregates', () => {
  it('counts distinct assets, not scopes (multi-account same asset)', () => {
    const transactions = [
      // Asset A: scope A complete (BUY 100, no evidence needed… covered by ledger),
      TransactionFactory.createBuy({
        portfolioId: PORTFOLIO, accountId: ACCOUNT_A, assetId: ASSET_A,
        quantity: '100', unitPrice: '10.00', currency: 'BRL', tradeDate: '2025-01-10',
      }),
      // Asset A: scope B uncovered (opening TRANSFER_IN, no evidence).
      TransactionFactory.createTransfer({
        portfolioId: PORTFOLIO, accountId: ACCOUNT_B, assetId: ASSET_A,
        type: 'TRANSFER_IN', quantity: '50', currency: 'BRL', tradeDate: '2024-12-31',
      }),
      // Asset B: single scope, fully uncovered.
      TransactionFactory.createTransfer({
        portfolioId: PORTFOLIO, accountId: ACCOUNT_A, assetId: ASSET_B,
        type: 'TRANSFER_IN', quantity: '30', currency: 'BRL', tradeDate: '2024-12-31',
      }),
    ];
    const replayed = replayPortfolio({ portfolioId: PORTFOLIO, transactions });
    const summary = summarizeDocumentaryCoverage({
      transactions,
      replayState: replayed.state,
      evidenceRows: [],
    });
    // Scope granularity preserved in detail…
    expect(summary.scopes).toHaveLength(3);
    // …but headlines count distinct assets: A mixed → partial, B → incomplete.
    expect(summary.completeAssets).toBe(0);
    expect(summary.partialAssets).toBe(1);
    expect(summary.incompleteAssets).toBe(1);
    expect(summary.canonicalIncompleteAssets).toBe(2);
  });

  it('marks an asset complete only when every scope is covered', () => {
    const transactions = [
      TransactionFactory.createTransfer({
        portfolioId: PORTFOLIO, accountId: ACCOUNT_A, assetId: ASSET_A,
        type: 'TRANSFER_IN', quantity: '100', currency: 'BRL', tradeDate: '2024-12-31',
      }),
      TransactionFactory.createTransfer({
        portfolioId: PORTFOLIO, accountId: ACCOUNT_B, assetId: ASSET_A,
        type: 'TRANSFER_IN', quantity: '100', currency: 'BRL', tradeDate: '2024-12-31',
      }),
    ];
    const replayed = replayPortfolio({ portfolioId: PORTFOLIO, transactions });
    // Evidence covers only scope A → asset still partial, never complete.
    const partial = summarizeDocumentaryCoverage({
      transactions,
      replayState: replayed.state,
      evidenceRows: [verifiedRow(ASSET_A, ACCOUNT_A)],
    });
    expect(partial.completeAssets).toBe(0);
    expect(partial.partialAssets).toBe(1);
    // Evidence on both scopes → complete.
    const full = summarizeDocumentaryCoverage({
      transactions,
      replayState: replayed.state,
      evidenceRows: [verifiedRow(ASSET_A, ACCOUNT_A), verifiedRow(ASSET_A, ACCOUNT_B)],
    });
    expect(full.completeAssets).toBe(1);
    expect(full.incompleteAssets).toBe(0);
    expect(full.partialAssets).toBe(0);
  });
});
