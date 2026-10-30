import { describe, it, expect } from 'vitest';
import {
  Money,
  Quantity,
  TransactionFactory,
} from '@atlas/domain';
import {
  buildCostBasisAssessment,
  summarizeLedgerKnownLots,
  type VerifiedEvidenceLot,
} from '@atlas/portfolio-engine';
import { scenario } from '../scenario-builder';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from '../fixtures/assets';

const ASSET = String(ASSET_PETR4);
const ACCOUNT = String(ACCOUNT_XP);

function evidenceLot(overrides: Partial<VerifiedEvidenceLot> = {}): VerifiedEvidenceLot {
  return {
    evidenceId: 'e0000000-0000-4000-8000-000000000001',
    assetId: ASSET,
    accountId: ACCOUNT,
    acquisitionDate: '2024-12-26',
    quantityCovered: Quantity.from('120'),
    unitCost: Money.from('8.50', 'BRL'),
    totalCost: Money.from('1020.00', 'BRL'),
    currency: 'BRL',
    evidenceType: 'BROKERAGE_NOTE',
    sourceReference: 'XP-NOTA-2024-1234',
    createdAt: new Date('2026-01-05T10:00:00.000Z'),
    ...overrides,
  };
}

describe('summarizeLedgerKnownLots', () => {
  it('sums BUY and SUBSCRIPTION lots with exact cost', () => {
    const txs = [
      TransactionFactory.createBuy({
        portfolioId: String(PORTFOLIO_DEFAULT),
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '80',
        unitPrice: '8.45',
        currency: 'BRL',
        tradeDate: '2024-12-27',
      }),
      TransactionFactory.createBuy({
        portfolioId: String(PORTFOLIO_DEFAULT),
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '96',
        unitPrice: '7.99',
        currency: 'BRL',
        tradeDate: '2025-01-24',
      }),
    ];
    const lots = summarizeLedgerKnownLots(txs, { assetId: ASSET, accountId: ACCOUNT });
    expect(lots).toHaveLength(2);
    const qty = lots.reduce((acc, lot) => acc.add(lot.quantity), Quantity.zero());
    expect(qty.value).toBe('176');
    const cost = lots.reduce((acc, lot) => acc.add(lot.totalCost), Money.zero('BRL'));
    expect(cost.amount).toBe('1443.04');
  });

  it('ignores transfers, income and costless bonus lots', () => {
    const txs = [
      TransactionFactory.createTransfer({
        portfolioId: String(PORTFOLIO_DEFAULT),
        accountId: ACCOUNT,
        assetId: ASSET,
        type: 'TRANSFER_IN',
        quantity: '120',
        currency: 'BRL',
        tradeDate: '2024-12-31',
      }),
      TransactionFactory.createBonus({
        portfolioId: String(PORTFOLIO_DEFAULT),
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '10',
        currency: 'BRL',
        tradeDate: '2025-06-01',
      }),
    ];
    expect(summarizeLedgerKnownLots(txs, { assetId: ASSET })).toHaveLength(0);
  });

  it('includes BONUS lots carrying assigned cost', () => {
    const txs = [
      TransactionFactory.createBonus({
        portfolioId: String(PORTFOLIO_DEFAULT),
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '10',
        assignedCost: '50.00',
        currency: 'BRL',
        tradeDate: '2025-06-01',
      }),
    ];
    const [lot] = summarizeLedgerKnownLots(txs, { assetId: ASSET });
    expect(lot?.quantity.value).toBe('10');
    expect(lot?.totalCost.amount).toBe('50');
  });
});

describe('buildCostBasisAssessment', () => {
  it('reports PARTIAL with exact KCRE11-shaped numbers', () => {
    const ledgerLots = [
      {
        assetId: ASSET,
        accountId: ACCOUNT,
        tradeDate: '2024-12-27',
        quantity: Quantity.from('80'),
        unitPrice: Money.from('8.45', 'BRL'),
        totalCost: Money.from('676.00', 'BRL'),
        currency: 'BRL' as const,
      },
      {
        assetId: ASSET,
        accountId: ACCOUNT,
        tradeDate: '2025-01-24',
        quantity: Quantity.from('100'),
        unitPrice: undefined,
        totalCost: Money.from('798.96', 'BRL'),
        currency: 'BRL' as const,
      },
    ];
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots,
      evidence: [evidenceLot()],
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.positionQuantity).toBe('300');
    expect(result.ledgerKnownQuantity).toBe('180');
    expect(result.evidenceCoveredQuantity).toBe('120');
    expect(result.totalCoveredQuantity).toBe('300');
    expect(result.uncoveredQuantity).toBe('0');
    expect(result.coveragePercent).toBe('100.00');
    expect(result.verifiedKnownCost).toEqual([{ amount: '2494.96', currency: 'BRL' }]);
    // 2494.96 / 300 = 8.3165333… (40-digit precision: '8.3165' + 35 threes).
    expect(result.averageKnownCostForCoveredQuantity).toEqual({
      amount: `8.3165${'3'.repeat(35)}`,
      currency: 'BRL',
    });
    expect(result.appliedEvidenceIds).toEqual(['e0000000-0000-4000-8000-000000000001']);
    expect(result.issues).toEqual([]);
  });

  it('reports PARTIAL when evidence covers only part of the position', () => {
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots: [],
      evidence: [evidenceLot()],
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.totalCoveredQuantity).toBe('120');
    expect(result.uncoveredQuantity).toBe('180');
    expect(result.coveragePercent).toBe('40.00');
    expect(result.verifiedKnownCost).toEqual([{ amount: '1020', currency: 'BRL' }]);
  });

  it('reports INCOMPLETE with zero coverage and null average', () => {
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots: [],
      evidence: [],
    });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.coveragePercent).toBe('0.00');
    expect(result.verifiedKnownCost).toEqual([]);
    expect(result.averageKnownCostForCoveredQuantity).toBeNull();
  });

  it('fails closed on over-coverage (BLOCKED, never clamps)', () => {
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('100'),
      ledgerLots: [],
      evidence: [evidenceLot()],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.some((i) => i.code === 'COST_EVIDENCE_OVER_COVERAGE')).toBe(true);
  });

  it('excludes redundant evidence restating a ledger lot', () => {
    const ledgerLots = [
      {
        assetId: ASSET,
        accountId: ACCOUNT,
        tradeDate: '2024-12-27',
        quantity: Quantity.from('80'),
        unitPrice: Money.from('8.45', 'BRL'),
        totalCost: Money.from('676.00', 'BRL'),
        currency: 'BRL' as const,
      },
    ];
    const redundant = evidenceLot({
      evidenceId: 'e0000000-0000-4000-8000-000000000002',
      acquisitionDate: '2024-12-27',
      quantityCovered: Quantity.from('80'),
      unitCost: Money.from('8.45', 'BRL'),
      totalCost: Money.from('676.00', 'BRL'),
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
    });
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots,
      evidence: [redundant],
    });
    expect(result.redundantEvidenceIds).toEqual(['e0000000-0000-4000-8000-000000000002']);
    expect(result.evidenceCoveredQuantity).toBe('0');
    expect(result.totalCoveredQuantity).toBe('80');
    expect(result.issues.some((i) => i.code === 'EVIDENCE_REDUNDANT')).toBe(true);
  });

  it('counts same-lot evidence once across documents (LOT_DUPLICATE)', () => {
    const first = evidenceLot();
    const second = evidenceLot({
      evidenceId: 'e0000000-0000-4000-8000-000000000003',
      evidenceType: 'ANNUAL_TAX_STATEMENT',
      sourceReference: 'IRPF-2025',
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    });
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots: [],
      evidence: [first, second],
    });
    expect(result.evidenceCoveredQuantity).toBe('120');
    expect(result.duplicateEvidenceIds).toEqual(['e0000000-0000-4000-8000-000000000003']);
    expect(result.appliedEvidenceIds).toEqual(['e0000000-0000-4000-8000-000000000001']);
  });

  it('keeps multi-currency costs segregated without FX', () => {
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('300'),
      ledgerLots: [
        {
          assetId: ASSET,
          accountId: ACCOUNT,
          tradeDate: '2025-01-24',
          quantity: Quantity.from('100'),
          unitPrice: Money.from('10.00', 'USD'),
          totalCost: Money.from('1000.00', 'USD'),
          currency: 'USD' as const,
        },
      ],
      evidence: [evidenceLot()],
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.verifiedKnownCost).toEqual([
      { amount: '1000', currency: 'USD' },
      { amount: '1020', currency: 'BRL' },
    ]);
    expect(result.averageKnownCostForCoveredQuantity).toBeNull();
  });

  it('treats a zero position as vacuously COMPLETE', () => {
    const result = buildCostBasisAssessment({
      positionQuantity: Quantity.from('0'),
      ledgerLots: [],
      evidence: [],
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.uncoveredQuantity).toBe('0');
  });
});

describe('KCRE11 synthetic full-coverage projection (PART Z)', () => {
  it('projects 120@8.50 evidence over replayed ledger lots to COMPLETE without touching quantity', () => {
    const built = scenario()
      .transferIn({ quantity: '120', tradeDate: '2024-12-31' })
      .buy({ quantity: '80', unitPrice: '8.45', tradeDate: '2024-12-27' })
      .buy({ quantity: '96', unitPrice: '7.99', tradeDate: '2025-01-24' })
      .buy({ quantity: '4', unitPrice: '7.98', tradeDate: '2025-01-24' });
    const replayed = built.replay();
    const [assetId] = [...replayed.state.assets.keys()];
    const position = replayed.state.assets.get(assetId!)!;
    expect(position.quantity.value).toBe('300');
    expect(position.costBasisStatus).toBe('INCOMPLETE');

    const ledgerLots = summarizeLedgerKnownLots(built.build(), {
      assetId: String(assetId),
    });
    const knownQty = ledgerLots.reduce((acc, lot) => acc.add(lot.quantity), Quantity.zero());
    expect(knownQty.value).toBe('180');

    const result = buildCostBasisAssessment({
      positionQuantity: position.quantity,
      ledgerLots,
      evidence: [evidenceLot({ quantityCovered: Quantity.from('120') })],
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.totalCoveredQuantity).toBe('300');
    expect(result.uncoveredQuantity).toBe('0');
  });
});
